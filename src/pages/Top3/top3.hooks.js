import { useCallback, useEffect, useMemo, useState } from "react";
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
  getNextSlotForLottery,
  computeConditionalNextTop3,
} from "./top3.engine";

import {
  lotteryLabel,
  makeImgVariantsFromGrupo,
  normalizeImgSrc,
} from "./top3.selectors";

import {
  getKingResultsByDate,
  getKingResultsByRange,
  getKingBoundsByUf,
} from "../../services/kingResultsService";

import { getAnimalLabel, getImgFromGrupo } from "../../constants/bichoMap";

export function useTop3Controller() {
  const DEFAULT_LOTTERY = "PT_RIO";

  const [lotteryKey, setLotteryKey] = useState(DEFAULT_LOTTERY);
  const [ymd, setYmd] = useState(() => todayYMDLocal());
  const [lookback, setLookback] = useState(LOOKBACK_ALL);

  const [loading, setLoading] = useState(false);
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
  }, [lotteryKeySafe, schedule.length]);

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
    setError("");

    if (lKey === "FEDERAL" && !isFederalDrawDay(ymdSafe)) {
      setRangeDraws([]);
      setLastHourBucket("");
      setTargetHourBucket("");
      setTargetYmd("");
      setLastInfo({ lastYmd: "", lastHour: "", lastGrupo: null, lastAnimal: "" });
      setPrevInfo({ prevYmd: "", prevHour: "", prevGrupo: null, prevAnimal: "", source: "none" });
      setRangeInfo({ from: "", to: "" });

      setLoading(false);
      setError(
        `Loteria Federal só tem resultado às 20h nas quartas e sábados. (${dateBR} não é dia de concurso)`
      );
      return;
    }

    try {
      let minDate = safeStr(bounds?.minDate);
      let maxDate = safeStr(bounds?.maxDate);

      try {
        const b = await getKingBoundsByUf({ uf: lKey });
        const bMin = safeStr(b?.minYmd || b?.minDate || b?.min || "");
        const bMax = safeStr(b?.maxYmd || b?.maxDate || b?.max || "");
        if (isYMD(bMin)) minDate = bMin;
        if (isYMD(bMax)) maxDate = bMax;

        if (isYMD(minDate) || isYMD(maxDate)) {
          setBounds({ minDate: minDate || "", maxDate: maxDate || "" });
        }
      } catch {
        // ok
      }

      // hoje: precisamos de prizes para achar o 1º do último draw
      const outToday = await getKingResultsByDate({ uf: lKey,
        date: ymdSafe,
        closeHour: null,
        positions: null,
      readPolicy: "server" });
      const today = Array.isArray(outToday) ? outToday : [];

      const last = findLastDrawInList(today, schedule);
      const lastBucket = last ? toHourBucket(pickDrawHour(last)) : "";
      setLastHourBucket(lastBucket);

      const lastY = last ? (pickDrawYMD(last) || ymdSafe) : "";
      const lastGrupo = last ? pickPrize1GrupoFromDraw(last) : null;
      const lastAnimal = lastGrupo ? safeStr(getAnimalLabel?.(lastGrupo) || "") : "";

      setLastInfo({
        lastYmd: safeStr(lastY || ""),
        lastHour: safeStr(lastBucket || ""),
        lastGrupo: Number.isFinite(Number(lastGrupo)) ? Number(lastGrupo) : null,
        lastAnimal,
      });

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

      setTargetYmd(safeStr(nextSlot?.ymd || ""));
      setTargetHourBucket(safeStr(nextSlot?.hour || ""));

      // range
      const rangeTo = ymdSafe;
      let rangeFrom = "";

      if (lookback === LOOKBACK_ALL) {
        rangeFrom = isYMD(minDate) ? minDate : addDaysYMD(ymdSafe, -180);
      } else {
        const days = Math.max(1, Number(lookback || 30));
        rangeFrom = addDaysYMD(ymdSafe, -(days - 1));
      }

      setRangeInfo({ from: rangeFrom, to: rangeTo });

      // IMPORTANTE: positions:null para contar aparições
      const outRange = await getKingResultsByRange({ uf: lKey,
        dateFrom: rangeFrom,
        dateTo: rangeTo,
        closeHour: null,
        positions: null,
        mode: "detailed",
      readPolicy: "server" });

      const hist = Array.isArray(outRange) ? outRange : [];
      setRangeDraws(hist);

      // camada prev (mantém seu comportamento)
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

        setPrevInfo({
          prevYmd: safeStr(prev?.ymd || ""),
          prevHour: safeStr(prev?.hour || ""),
          prevGrupo: Number.isFinite(Number(prevGrupo)) ? Number(prevGrupo) : null,
          prevAnimal,
          source: safeStr(prev?.source || "none"),
        });
      } else {
        setPrevInfo({ prevYmd: "", prevHour: "", prevGrupo: null, prevAnimal: "", source: "none" });
      }
    } catch (e) {
      setRangeDraws([]);
      setLastHourBucket("");
      setTargetHourBucket("");
      setTargetYmd("");
      setLastInfo({ lastYmd: "", lastHour: "", lastGrupo: null, lastAnimal: "" });
      setPrevInfo({ prevYmd: "", prevHour: "", prevGrupo: null, prevAnimal: "", source: "none" });
      setRangeInfo({ from: "", to: "" });
      setError(String(e?.message || e || "Falha ao carregar dados do TOP3."));
    } finally {
      setLoading(false);
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

  // TOP3 (condicionado)
  const analytics = useMemo(() => {
    const list = Array.isArray(rangeDraws) ? rangeDraws : [];
    const lastG = lastInfo?.lastGrupo;
    const lastY = safeStr(lastInfo?.lastYmd);
    const lastH = safeStr(lastInfo?.lastHour);

    if (!list.length || !lastG || !isYMD(lastY) || !safeStr(lastH)) return { top: [], meta: null };

    const drawLast = list.find((d) => {
      const y = pickDrawYMD(d);
      const h = toHourBucket(pickDrawHour(d));
      return y === lastY && h === toHourBucket(lastH);
    });

    if (!drawLast) return { top: [], meta: null };

    return computeConditionalNextTop3({
      lotteryKey: lotteryKeySafe,
      drawsRange: list,
      drawLast,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
      topN: 3,
    });
  }, [rangeDraws, lotteryKeySafe, lastInfo?.lastGrupo, lastInfo?.lastYmd, lastInfo?.lastHour]);

  // meta (DERIVADO, sem setState)
  const metaNext = useMemo(() => {
    const m = analytics?.meta;
    if (!(m?.trigger?.grupo && m?.next?.ymd && m?.next?.hour)) {
      return { triggerText: "", targetText: "", samples: 0 };
    }

    const g = Number(m.trigger.grupo);
    const animal = safeStr(getAnimalLabel?.(g) || "");
    const dow = getDowKey(m.trigger.ymd);
    const dowLabel =
      dow === 0 ? "DOM" :
      dow === 1 ? "SEG" :
      dow === 2 ? "TER" :
      dow === 3 ? "QUA" :
      dow === 4 ? "QUI" :
      dow === 5 ? "SEX" :
      dow === 6 ? "SÁB" : "—";

    return {
      triggerText: `G${String(g).padStart(2, "0")}${animal ? " • " + animal.toUpperCase() : ""} • ${dowLabel} ${m.trigger.hour}`,
      targetText: `${ymdToBR(m.next.ymd)} ${m.next.hour}`,
      samples: Number(m.samples || 0),
    };
  }, [analytics]);

  const top3 = useMemo(() => {
    const arr = Array.isArray(analytics?.top) ? analytics.top : [];

    return arr.map((x) => {
      const g = Number(x.grupo);
      const animal = safeStr(getAnimalLabel?.(g) || "");

      const bgPrimary = normalizeImgSrc(
        safeStr(getImgFromGrupo?.(g, 512) || getImgFromGrupo?.(g) || "")
      );

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

      return { ...x, animal, imgBg: bgVariants, imgIcon: iconVariants };
    });
  }, [analytics]);

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
      if (safeStr(analysisYmd) && safeStr(analysisHourBucket))
        out.push(`Próximo sorteio (alvo): ${ymdToBR(analysisYmd)} ${analysisHourBucket}`);

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
    getCentena3,
    normalizeImgSrc,
  };
}



