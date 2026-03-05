// src/pages/Top3/top3.hooks.js
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  safeStr,
  isYMD,
  ymdToBR,
  normalizeToYMD,
  todayYMDLocal,
  addDaysYMD,
  toHourBucket,
  getCentena3,
  getDowKey,
} from "./top3.formatters";

import {
  LOOKBACK_ALL,
  LOOKBACK_OPTIONS,
  LOTTERY_OPTIONS,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  TOP3_SMOOTH_ALPHA,
  TOP3_GROUPS_K,
} from "./top3.constants";

import {
  getScheduleForLottery,
  isFederalDrawDay,
  findLastDrawInList,
  pickDrawHour,
  pickDrawYMD,
  pickPrize1GrupoFromDraw,
  getPreviousDrawRobust,
  build16MilharesForGrupo,
  buildMilharesForGrupo,
  getNextSlotForLottery,
  computeConditionalNextTop3,
} from "./top3.engine";

import { lotteryLabel, makeImgVariantsFromGrupo, normalizeImgSrc } from "./top3.selectors";

import {
  getKingResultsByDate,
  getKingResultsByRange,
  getKingBoundsByUf,
} from "../../services/kingResultsService";

import { getAnimalLabel, getImgFromGrupo } from "../../constants/bichoMap";

/** normaliza milhar para 4 dígitos */
function normalizeMilhar4(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const dig = s.replace(/\D+/g, "");
  if (!dig) return "";
  return dig.length >= 4 ? dig.slice(-4) : dig.padStart(4, "0");
}

/**
 * Monta 4 colunas (uma por dezena fixa do grupo), com 5 milhares cada.
 * - NÃO inventa sequência
 * - se faltar, completa com "" (vazio)
 */
function build4ColsFromEngineOut(out, expectedCols = 4, perCol = 5) {
  const dezenas = Array.isArray(out?.dezenas) ? out.dezenas : [];
  const slots = Array.isArray(out?.slots) ? out.slots : [];

  const cols = [];
  const dzList = dezenas.slice(0, expectedCols);

  for (const dz of dzList) {
    const items = slots
      .filter((s) => String(s?.dezena || "") === String(dz))
      .map((s) => normalizeMilhar4(s?.milhar))
      .map((m) => (m && /^\d{4}$/.test(m) ? m : ""))
      .slice(0, perCol);

    while (items.length < perCol) items.push("");
    cols.push({ dezena: dz, items });
  }

  // blindagem: se por algum motivo vier menos de 4 dezenas
  while (cols.length < expectedCols) {
    cols.push({ dezena: "", items: Array(perCol).fill("") });
  }

  return cols.slice(0, expectedCols);
}

/**
 * ✅ Resolve qual "UF/coleção" realmente contém dados para a loteria selecionada.
 * Motivo: alguns backends não salvam Federal em uf="FEDERAL".
 *
 * Estratégia:
 * - Para PT_RIO: usa "PT_RIO" direto (como você já usa)
 * - Para FEDERAL: tenta uma lista de chaves até achar um "last" válido para o schedule (20:00)
 */
async function resolveUfForLottery({
  lotteryKey,
  ymd,
  schedule,
  getKingResultsByDateFn,
}) {
  const lk = safeStr(lotteryKey).toUpperCase();

  // padrão (mantém comportamento atual)
  if (lk !== "FEDERAL") return lk;

  const candidates = [
    "FEDERAL",
    "BR",
    "DF",
    "RJ",
    "PT_RIO",
  ];

  // tenta achar dados do dia que batam com o schedule (20:00)
  for (const uf of candidates) {
    try {
      const out = await getKingResultsByDateFn({
        uf,
        date: ymd,
        closeHour: null,
        positions: null,
        readPolicy: "server",
      });
      const today = Array.isArray(out) ? out : [];
      const last = findLastDrawInList(today, schedule);
      if (last) return uf;

      // fallback: se veio algo (mesmo sem casar horário), ainda assim é candidato viável
      if (today.length) return uf;
    } catch {
      // tenta próximo
    }
  }

  // se nada funcionou, volta para FEDERAL mesmo
  return "FEDERAL";
}

export function useTop3Controller() {
  const DEFAULT_LOTTERY = "PT_RIO";
  const requestIdRef = useRef(0);

  // cache de bounds por UF (evita refetch em todo load)
  const boundsCacheRef = useRef(new Map()); // uf -> {minDate,maxDate}

  // cache do analytics pesado (evita recomputar toda hora)
  const analyticsCacheRef = useRef({ key: "", value: { top: [], meta: null } });

  const [lotteryKey, setLotteryKey] = useState(DEFAULT_LOTTERY);
  const [ymd, setYmd] = useState(() => todayYMDLocal());
  const [lookback, setLookback] = useState(LOOKBACK_ALL);

  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState({
    today: false,
    range: false,
  });
  const [error, setError] = useState("");

  const [rangeDraws, setRangeDraws] = useState([]);
  const [bounds, setBounds] = useState({ minDate: "", maxDate: "" });
  const [rangeInfo, setRangeInfo] = useState({ from: "", to: "" });

  const [lastHourBucket, setLastHourBucket] = useState("");
  const [targetHourBucket, setTargetHourBucket] = useState("");
  const [targetYmd, setTargetYmd] = useState("");

  const [lastInfo, setLastInfo] = useState({
    lastYmd: "",
    lastHour: "",
    lastGrupo: null,
    lastAnimal: "",
  });

  const [prevInfo, setPrevInfo] = useState({
    prevYmd: "",
    prevHour: "",
    prevGrupo: null,
    prevAnimal: "",
    source: "none",
  });

  const lotteryKeySafe = useMemo(
    () => safeStr(lotteryKey).toUpperCase() || DEFAULT_LOTTERY,
    [lotteryKey]
  );

  const ymdSafe = useMemo(() => {
    const y = normalizeToYMD(ymd);
    return y && isYMD(y) ? y : todayYMDLocal();
  }, [ymd]);

  const dateBR = useMemo(() => ymdToBR(ymdSafe), [ymdSafe]);

  const schedule = useMemo(() => {
    return getScheduleForLottery({
      lotteryKey: lotteryKeySafe,
      ymd: ymdSafe,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });
  }, [lotteryKeySafe, ymdSafe]);

  const isFederalNonDrawDay = useMemo(() => {
    return lotteryKeySafe === "FEDERAL" && !schedule.length;
  }, [lotteryKeySafe, schedule]);

  const analysisHourBucket = useMemo(() => {
    return safeStr(targetHourBucket) || "";
  }, [targetHourBucket]);

  const analysisYmd = useMemo(() => {
    return safeStr(targetYmd) || "";
  }, [targetYmd]);

  const lookbackLabel = useMemo(() => {
    if (lookback === LOOKBACK_ALL) return "Toda a base";
    const n = Number(lookback || 0);
    if (!Number.isFinite(n) || n <= 0) return "—";
    return `${n} dias`;
  }, [lookback]);

  const rangeLabel = useMemo(() => {
    const f = safeStr(rangeInfo?.from);
    const t = safeStr(rangeInfo?.to);
    if (isYMD(f) && isYMD(t)) return `${ymdToBR(f)} → ${ymdToBR(t)}`;
    return "—";
  }, [rangeInfo]);

  const prevLabel = useMemo(() => {
    if (!prevInfo?.prevGrupo) return "—";
    const g = Number(prevInfo.prevGrupo);
    const animal = safeStr(prevInfo.prevAnimal || getAnimalLabel?.(g) || "");
    const when =
      prevInfo?.prevYmd && prevInfo?.prevHour
        ? `${ymdToBR(prevInfo.prevYmd)} ${prevInfo.prevHour}`
        : "";
    return `G${String(g).padStart(2, "0")}${animal ? " • " + animal.toUpperCase() : ""}${
      when ? " • " + when : ""
    }`;
  }, [prevInfo]);

  const lastLabel = useMemo(() => {
    if (!lastInfo?.lastGrupo) return "—";
    const g = Number(lastInfo.lastGrupo);
    const animal = safeStr(lastInfo.lastAnimal || getAnimalLabel?.(g) || "");
    const when =
      lastInfo?.lastYmd && lastInfo?.lastHour
        ? `${ymdToBR(lastInfo.lastYmd)} ${lastInfo.lastHour}`
        : "";
    return `G${String(g).padStart(2, "0")}${animal ? " • " + animal.toUpperCase() : ""}${
      when ? " • " + when : ""
    }`;
  }, [lastInfo]);

  const load = useCallback(async () => {
    const lKey = safeStr(lotteryKeySafe);
    if (!lKey || !isYMD(ymdSafe)) return;

    setLoading(true);
    setLoadingStage({ today: true, range: false });
    setError("");
    const currentRequestId = ++requestIdRef.current;

    // FEDERAL: trava cedo e sai rápido (dia errado)
    if (lKey === "FEDERAL" && !isFederalDrawDay(ymdSafe)) {
      if (requestIdRef.current === currentRequestId) {
        setLastHourBucket("");
        setTargetHourBucket("");
        setTargetYmd("");
        setLastInfo({ lastYmd: "", lastHour: "", lastGrupo: null, lastAnimal: "" });
        setPrevInfo({ prevYmd: "", prevHour: "", prevGrupo: null, prevAnimal: "", source: "none" });
        setRangeInfo({ from: "", to: "" });
        setLoadingStage({ today: false, range: false });
        setLoading(false);
        setError(
          `Loteria Federal só tem resultado às 20h nas quartas e sábados. (${dateBR} não é dia de concurso)`
        );
      }
      return;
    }

    try {
      // ✅ resolve UF real (especialmente para FEDERAL)
      const ufResolved = await resolveUfForLottery({
        lotteryKey: lKey,
        ymd: ymdSafe,
        schedule,
        getKingResultsByDateFn: getKingResultsByDate,
      });

      // ========= 1) Bounds (cacheado) =========
      let minDate = safeStr(bounds?.minDate);
      let maxDate = safeStr(bounds?.maxDate);

      const cached = boundsCacheRef.current.get(ufResolved);
      if (cached?.minDate || cached?.maxDate) {
        minDate = cached.minDate || minDate;
        maxDate = cached.maxDate || maxDate;
        if (requestIdRef.current === currentRequestId) {
          setBounds({ minDate: minDate || "", maxDate: maxDate || "" });
        }
      } else {
        try {
          const b = await getKingBoundsByUf({ uf: ufResolved });
          const bMin = safeStr(b?.minYmd || b?.minDate || b?.min || "");
          const bMax = safeStr(b?.maxYmd || b?.maxDate || b?.max || "");
          if (isYMD(bMin)) minDate = bMin;
          if (isYMD(bMax)) maxDate = bMax;

          boundsCacheRef.current.set(ufResolved, {
            minDate: isYMD(minDate) ? minDate : "",
            maxDate: isYMD(maxDate) ? maxDate : "",
          });

          if (requestIdRef.current === currentRequestId) {
            setBounds({ minDate: minDate || "", maxDate: maxDate || "" });
          }
        } catch {
          // ok
        }
      }

      // ========= 2) HOJE (rápido) =========
      const outToday = await getKingResultsByDate({
        uf: ufResolved,
        date: ymdSafe,
        closeHour: null,
        positions: null,
        readPolicy: "server",
      });
      const today = Array.isArray(outToday) ? outToday : [];

      const last = findLastDrawInList(today, schedule);
      const lastBucket = last ? toHourBucket(pickDrawHour(last)) : "";
      if (requestIdRef.current === currentRequestId) setLastHourBucket(lastBucket);

      const lastY = last ? pickDrawYMD(last) || ymdSafe : "";
      const lastGrupo = last ? pickPrize1GrupoFromDraw(last) : null;
      const lastAnimal = lastGrupo ? safeStr(getAnimalLabel?.(lastGrupo) || "") : "";

      if (requestIdRef.current === currentRequestId) {
        setLastInfo({
          lastYmd: safeStr(lastY || ""),
          lastHour: safeStr(lastBucket || ""),
          lastGrupo: Number.isFinite(Number(lastGrupo)) ? Number(lastGrupo) : null,
          lastAnimal,
        });
      }

      const nextSlot =
        last && lastY && lastBucket
          ? getNextSlotForLottery({
              lotteryKey: lKey,
              ymd: lastY,
              hourBucket: lastBucket,
              PT_RIO_SCHEDULE_NORMAL,
              PT_RIO_SCHEDULE_WED_SAT,
              FEDERAL_SCHEDULE,
            })
          : { ymd: "", hour: "" };

      if (requestIdRef.current === currentRequestId) {
        setTargetYmd(safeStr(nextSlot?.ymd || ""));
        setTargetHourBucket(safeStr(nextSlot?.hour || ""));
      }

      // prev robusto
      const hourForPrev = safeStr(nextSlot?.hour || lastBucket || "");
      if (hourForPrev) {
        const prev = await getPreviousDrawRobust({
          getKingResultsByDate,
          lotteryKey: lKey,
          ymdTarget: ymdSafe,
          targetHourBucket: hourForPrev,
          todayDraws: today,
          schedule,
          maxBackDays: 14,
          PT_RIO_SCHEDULE_NORMAL,
          PT_RIO_SCHEDULE_WED_SAT,
          FEDERAL_SCHEDULE,
        });

        const prevGrupo = prev?.draw ? pickPrize1GrupoFromDraw(prev.draw) : null;
        const prevAnimal = prevGrupo ? safeStr(getAnimalLabel?.(prevGrupo) || "") : "";

        if (requestIdRef.current === currentRequestId) {
          setPrevInfo({
            prevYmd: safeStr(prev?.ymd || ""),
            prevHour: safeStr(prev?.hour || ""),
            prevGrupo: Number.isFinite(Number(prevGrupo)) ? Number(prevGrupo) : null,
            prevAnimal,
            source: safeStr(prev?.source || "none"),
          });
        }
      } else {
        if (requestIdRef.current === currentRequestId) {
          setPrevInfo({
            prevYmd: "",
            prevHour: "",
            prevGrupo: null,
            prevAnimal: "",
            source: "none",
          });
        }
      }

      if (requestIdRef.current === currentRequestId) {
        setLoadingStage({ today: false, range: true });
      }

      // ========= 3) RANGE (pesado) =========
      let rangeTo = ymdSafe;
      let rangeFrom = "";

      if (nextSlot?.ymd && isYMD(nextSlot.ymd)) {
        if (nextSlot.ymd > rangeTo) rangeTo = nextSlot.ymd;
      }

      if (lookback === LOOKBACK_ALL) {
        rangeFrom = isYMD(minDate) ? minDate : addDaysYMD(ymdSafe, -180);
      } else {
        const days = Math.max(1, Number(lookback || 30));
        rangeFrom = addDaysYMD(ymdSafe, -(days - 1));
      }

      if (requestIdRef.current === currentRequestId) {
        setRangeInfo({ from: rangeFrom, to: rangeTo });
      }

      const outRange = await getKingResultsByRange({
        uf: ufResolved,
        dateFrom: rangeFrom,
        dateTo: addDaysYMD(rangeTo, 1),
        closeHour: null,
        positions: null,
        mode: "detailed",
        readPolicy: "server",
      });

      const hist = Array.isArray(outRange) ? outRange : [];
      if (requestIdRef.current === currentRequestId) {
        setRangeDraws(hist);
      }
    } catch (e) {
      if (requestIdRef.current === currentRequestId) {
        setError(String(e?.message || e || "Falha ao carregar dados do TOP3."));
      }
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoadingStage({ today: false, range: false });
        setLoading(false);
      }
    }
  }, [
    lotteryKeySafe,
    ymdSafe,
    schedule,
    lookback,
    bounds?.minDate,
    bounds?.maxDate,
    dateBR,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  // TOP3 (condicionado) — com cache
  const analytics = useMemo(() => {
    const list = Array.isArray(rangeDraws) ? rangeDraws : [];
    const lastG = lastInfo?.lastGrupo;
    const lastY = safeStr(lastInfo?.lastYmd);
    const lastH = safeStr(lastInfo?.lastHour);

    if (!list.length || !lastG || !isYMD(lastY) || !safeStr(lastH)) {
      const empty = { top: [], meta: null };
      analyticsCacheRef.current = { key: "", value: empty };
      return empty;
    }

    const cacheKey = [
      lotteryKeySafe,
      lookback,
      list.length,
      lastY,
      toHourBucket(lastH),
      Number(lastG),
    ].join("|");

    if (analyticsCacheRef.current.key === cacheKey) {
      return analyticsCacheRef.current.value;
    }

    const drawLast = list.find((d) => {
      const y = pickDrawYMD(d);
      const h = toHourBucket(pickDrawHour(d));
      return y === lastY && h === toHourBucket(lastH);
    });

    let drawLastSafe = drawLast;
    if (!drawLastSafe) {
      drawLastSafe = {
        ymd: lastY,
        close_hour: lastH,
        prizes: [{ grupo: lastG }],
      };
    }

    const computed = computeConditionalNextTop3({
      lotteryKey: lotteryKeySafe,
      drawsRange: list,
      drawLast: drawLastSafe,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
      topN: 3,
    });

    analyticsCacheRef.current = { key: cacheKey, value: computed };
    return computed;
  }, [
    rangeDraws,
    lotteryKeySafe,
    lookback,
    lastInfo?.lastGrupo,
    lastInfo?.lastYmd,
    lastInfo?.lastHour,
  ]);

  // ✅ motor 20 milhares (EXATOS) -> 4 colunas x 5
  const build20 = useCallback(
    (grupo2) => {
      return buildMilharesForGrupo({
        rangeDraws,
        analysisHourBucket,
        schedule,
        grupo2,
        count: 20,
      });
    },
    [rangeDraws, analysisHourBucket, schedule]
  );

  const metaNext = useMemo(() => {
    const m = analytics?.meta;
    if (!(m?.trigger?.grupo && m?.next?.ymd && m?.next?.hour)) {
      return { triggerText: "", targetText: "", samples: 0 };
    }

    const g = Number(m.trigger.grupo);
    const animal = safeStr(getAnimalLabel?.(g) || "");
    const dow = getDowKey(m.trigger.ymd);
    const dowLabel =
      dow === 0
        ? "DOM"
        : dow === 1
        ? "SEG"
        : dow === 2
        ? "TER"
        : dow === 3
        ? "QUA"
        : dow === 4
        ? "QUI"
        : dow === 5
        ? "SEX"
        : dow === 6
        ? "SÁB"
        : "—";

    return {
      triggerText: `G${String(g).padStart(2, "0")}${animal ? " • " + animal.toUpperCase() : ""} • ${dowLabel} ${
        m.trigger.hour
      }`,
      targetText: `${ymdToBR(m.next.ymd)} ${m.next.hour}`,
      samples: Number(m.samples || 0),
    };
  }, [analytics]);

  const top3 = useMemo(() => {
    const arr = Array.isArray(analytics?.top) ? analytics.top : [];
    const samplesMeta = Number(analytics?.meta?.samples || 0);

    const alpha = Number.isFinite(Number(TOP3_SMOOTH_ALPHA)) ? Number(TOP3_SMOOTH_ALPHA) : 1;
    const groupsK = Number.isFinite(Number(TOP3_GROUPS_K)) ? Number(TOP3_GROUPS_K) : 25;

    const denomRaw = Math.max(0, samplesMeta) * 7;
    const denom = denomRaw + alpha * groupsK;

    return arr.map((x) => {
      const g = Number(x.grupo);
      const animal = safeStr(getAnimalLabel?.(g) || "");

      const bgPrimary = normalizeImgSrc(safeStr(getImgFromGrupo?.(g, 512) || getImgFromGrupo?.(g) || ""));

      const iconVariants = makeImgVariantsFromGrupo({
        grupo: g,
        size: 96,
        getImgFromGrupo,
        getAnimalLabel,
      });

      const bgVariants = bgPrimary
        ? [bgPrimary]
        : makeImgVariantsFromGrupo({
            grupo: g,
            size: 512,
            getImgFromGrupo,
            getAnimalLabel,
          });

      const freq = Number(x.freq || 0);
      const prob = denom > 0 ? (freq + alpha) / denom : 0;
      const probPct = Math.max(0, prob * 100);

      let milharesCols = [
        { dezena: "", items: ["", "", "", "", ""] },
        { dezena: "", items: ["", "", "", "", ""] },
        { dezena: "", items: ["", "", "", "", ""] },
        { dezena: "", items: ["", "", "", "", ""] },
      ];

      try {
        const out = build20(g);
        milharesCols = build4ColsFromEngineOut(out, 4, 5);
      } catch {
        // mantém vazio
      }

      const milhares20 = milharesCols.flatMap((c) => c.items).slice(0, 20);

      return {
        ...x,
        animal,
        imgBg: bgVariants,
        imgIcon: iconVariants,
        prob,
        probPct,
        milharesCols,
        milhares20,
      };
    });
  }, [analytics, build20]);

  const layerMetaText = useMemo(() => {
    const t = safeStr(metaNext?.triggerText);
    const a = safeStr(metaNext?.targetText);
    const s = Number(metaNext?.samples || 0);

    const parts = [];
    if (t) parts.push(`Gatilho: ${t}`);
    if (a) parts.push(`Alvo: ${a}`);
    if (Number.isFinite(s)) parts.push(`Amostras: ${s}`);
    return parts.length ? parts.join(" • ") : "—";
  }, [metaNext]);

  const buildWhyFromReasons = useCallback(
    (reasons) => {
      const r = Array.isArray(reasons) ? reasons : [];
      const out = [];

      out.push(`Base histórica: ${lookbackLabel}`);
      if (lastLabel !== "—") out.push(`Último sorteio (gatilho): ${lastLabel}`);
      if (safeStr(analysisYmd) && safeStr(analysisHourBucket)) {
        out.push(`Próximo sorteio (alvo): ${ymdToBR(analysisYmd)} ${analysisHourBucket}`);
      }

      for (const line of r) out.push(line);

      out.push(`Grade respeitada (${lotteryLabel(lotteryKeySafe)}).`);

      return out.slice(0, 10);
    },
    [lookbackLabel, lastLabel, analysisYmd, analysisHourBucket, lotteryKeySafe]
  );

  const build16 = useCallback(
    (grupo2) => {
      return build16MilharesForGrupo({
        rangeDraws,
        analysisHourBucket,
        schedule,
        grupo2,
      });
    },
    [rangeDraws, analysisHourBucket, schedule]
  );

  return {
    LOOKBACK_ALL,
    LOOKBACK_OPTIONS,
    LOTTERY_OPTIONS,

    lotteryKeySafe,
    ymdSafe,
    lookback,
    loading,
    loadingStage,
    error,
    dateBR,
    schedule,
    isFederalNonDrawDay,
    rangeLabel,
    lastHourBucket,
    targetHourBucket,
    targetYmd,
    analysisHourBucket,
    analysisYmd,
    prevLabel,
    lastLabel,
    layerMetaText,
    top3,

    setLotteryKey,
    setYmd,
    setLookback,
    load,

    safeStr,
    lotteryLabel,
    buildWhyFromReasons,
    build16,
    build20,
    getCentena3,
    normalizeImgSrc,
  };
}