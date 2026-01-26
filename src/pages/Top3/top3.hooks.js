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
} from "./top3.engine";

import { lotteryLabel, makeImgVariantsFromGrupo, normalizeImgSrc } from "./top3.selectors";

import {
  getKingResultsByDate,
  getKingResultsByRange,
  getKingBoundsByUf,
} from "../../services/kingResultsService";

import { getAnimalLabel, getImgFromGrupo } from "../../constants/bichoMap";
import { computeTop3Signals } from "../../services/statsSignals";

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

  const dayEnded = useMemo(() => {
    return !!safeStr(lastHourBucket) && !safeStr(targetHourBucket);
  }, [lastHourBucket, targetHourBucket]);

  const analysisHourBucket = useMemo(() => {
    return safeStr(targetHourBucket) || safeStr(lastHourBucket) || "";
  }, [targetHourBucket, lastHourBucket]);

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

  const load = useCallback(async () => {
    const lKey = safeStr(lotteryKeySafe);
    if (!lKey || !isYMD(ymdSafe)) return;

    setLoading(true);
    setError("");

    if (lKey === "FEDERAL" && !isFederalDrawDay(ymdSafe)) {
      setRangeDraws([]);
      setLastHourBucket("");
      setTargetHourBucket("");
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

      const outToday = await getKingResultsByDate({
        uf: lKey,
        date: ymdSafe,
        closeHour: null,
        positions: null,
      });
      const today = Array.isArray(outToday) ? outToday : [];

      const last = findLastDrawInList(today, schedule);
      const lastBucket = last ? toHourBucket(pickDrawHour(last)) : "";
      setLastHourBucket(lastBucket);

      const nextFromLast = (() => {
        if (!lastBucket) return null;
        const sch = Array.isArray(schedule) ? schedule : [];
        const lh = toHourBucket(lastBucket);
        const idx = sch.findIndex((h) => toHourBucket(h) === lh);
        if (idx >= 0 && idx < sch.length - 1) return sch[idx + 1];
        return null;
      })();

      const targetBucket = !lastBucket ? schedule[0] || "" : nextFromLast || "";
      const ended = !!lastBucket && !nextFromLast;
      setTargetHourBucket(ended ? "" : targetBucket);

      const rangeTo = ymdSafe;
      let rangeFrom = "";

      if (lookback === LOOKBACK_ALL) {
        rangeFrom = isYMD(minDate) ? minDate : addDaysYMD(ymdSafe, -180);
      } else {
        const days = Math.max(1, Number(lookback || 30));
        rangeFrom = addDaysYMD(ymdSafe, -(days - 1));
      }

      setRangeInfo({ from: rangeFrom, to: rangeTo });

      const outRange = await getKingResultsByRange({
        uf: lKey,
        dateFrom: rangeFrom,
        dateTo: rangeTo,
        closeHour: null,
        positions: [1],
        mode: "detailed",
      });

      const hist = Array.isArray(outRange) ? outRange : [];
      setRangeDraws(hist);

      const hourForPrev = ended ? lastBucket || "" : targetBucket || "";

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

  const analytics = useMemo(() => {
    const list = Array.isArray(rangeDraws) ? rangeDraws : [];
    const hour = safeStr(analysisHourBucket);
    if (!list.length || !hour) return { top: [], meta: null };

    return computeTop3Signals({
      drawsRange: list,
      schedule,
      ymdTarget: ymdSafe,
      hourBucket: hour,
      prevGrupo: prevInfo?.prevGrupo ?? null,
      weights: { base: 1.0, trans: 0.65, dow: 0.35, dom: 0.25, global: 0.18 },
      mins: { trans: 6, dow: 4, dom: 3 },
    });
  }, [rangeDraws, schedule, ymdSafe, analysisHourBucket, prevInfo?.prevGrupo]);

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
    const m = analytics?.meta;
    if (!m) return "—";

    const parts = [];
    parts.push(`Base(${m.baseTotal})`);

    if (m.prevGrupo != null) {
      parts.push(`Trans(${m.transTotal}${m.useTrans ? "" : "↓"})`);
      parts.push(`DOW(${m.transTotalDow}${m.useDow ? "" : "↓"})`);
      parts.push(`DOM(${m.transTotalDom}${m.useDom ? "" : "↓"})`);
    } else {
      parts.push("Trans(—)");
      parts.push("DOW(—)");
      parts.push("DOM(—)");
    }

    return parts.join(" • ");
  }, [analytics]);

  const buildWhyFromReasons = useCallback(
    (reasons) => {
      const r = Array.isArray(reasons) ? reasons : [];
      const out = [];

      out.push(`Horário alvo: ${safeStr(analysisHourBucket)} • Base: ${lookbackLabel}`);

      if (prevInfo?.prevGrupo) out.push(`Sorteio anterior (camada): ${prevLabel}`);
      else out.push(`Sorteio anterior: sem amostra suficiente/ausente (camada reduzida)`);

      for (const line of r) out.push(line);

      out.push(`Grade da loteria respeitada (${lotteryLabel(lotteryKeySafe)}).`);

      if (dayEnded) {
        out.push(`Dia encerrado: exibindo o último Top3 do dia (${safeStr(lastHourBucket)}).`);
      }

      return out.slice(0, 8);
    },
    [analysisHourBucket, lookbackLabel, prevInfo?.prevGrupo, prevLabel, lotteryKeySafe, dayEnded, lastHourBucket]
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
    // constants for view
    LOOKBACK_ALL,
    LOOKBACK_OPTIONS,
    LOTTERY_OPTIONS,

    // state for view
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
    analysisHourBucket,
    dayEnded,
    prevLabel,
    layerMetaText,
    top3,

    // actions for view
    setLotteryKey,
    setYmd,
    setLookback,
    load,

    // helpers for view
    safeStr,
    lotteryLabel,
    buildWhyFromReasons,
    build16,
    getCentena3,
    normalizeImgSrc,
  };
}
