import { useCallback, useEffect, useMemo } from "react";

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
  buildMilharesForGrupo,
  getNextSlotForLottery,
  computeStatisticalTop3V3,
} from "./top3.engine";

import { lotteryLabel } from "./top3.selectors";

import { buildTop3TimelineViewModel } from "./modules/top3.timeline";

import { useTop3State } from "./modules/top3.state";

import {
  fallbackBaseSearch,
  loadHistoryRange,
} from "./modules/top3.loader";

import { computeTop3Analytics } from "./modules/top3.analytics";

import { buildTop3Predictions } from "./modules/top3.prediction";

import {
  registerPrediction,
  reconcilePendingTop3Log,
  ensureDayTimeline,
  isFutureTarget,
  makeKey,
} from "./top3.storage";

import {
  getKingResultsByDate,
  getKingResultsByRange,
  getKingBoundsByUf,
} from "../../services/kingResultsService";

import { getAnimalLabel } from "../../constants/bichoMap";

import {
  normalizeImgSrc,
  getGrupoImgSrc,
  buildResultStyleImgVariants,
} from "./top3.images";


function normalizeMilhar4(v) {
  const s = String(v || "").trim();
  if (!s) return "";

  const dig = s.replace(/\D+/g, "");
  if (!dig) return "";

  return dig.length >= 4 ? dig.slice(-4) : dig.padStart(4, "0");
}

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

  while (cols.length < expectedCols) {
    cols.push({ dezena: "", items: Array(perCol).fill("") });
  }

  return cols.slice(0, expectedCols);
}

function drawTs(draw) {
  const y = pickDrawYMD(draw);
  const h = toHourBucket(pickDrawHour(draw));

  if (!isYMD(y) || !h) return Number.NEGATIVE_INFINITY;

  const [Y, M, D] = String(y).split("-").map(Number);
  const hh = Number(String(h).slice(0, 2));
  const mm = Number(String(h).slice(3, 5));

  return Date.UTC(Y, M - 1, D, hh, mm, 0, 0);
}

function isDrawValidForLotterySchedule(draw, lotteryKey) {
  const y = pickDrawYMD(draw);
  const h = toHourBucket(pickDrawHour(draw));

  if (!isYMD(y) || !h) return false;

  const schedule = getScheduleForLottery({
    lotteryKey,
    ymd: y,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });

  return Array.isArray(schedule) && schedule.map(toHourBucket).includes(h);
}

function findLatestHistoricalBaseDraw({
  draws,
  lotteryKey,
  targetYmd,
  targetHourBucket,
}) {
  const list = Array.isArray(draws) ? draws : [];
  const targetHour = toHourBucket(targetHourBucket);

  if (!isYMD(targetYmd) || !targetHour) {
    return { draw: null, ymd: "", hour: "", source: "none" };
  }

  const [tY, tM, tD] = String(targetYmd).split("-").map(Number);
  const th = Number(String(targetHour).slice(0, 2));
  const tm = Number(String(targetHour).slice(3, 5));
  const targetTs = Date.UTC(tY, tM - 1, tD, th, tm, 0, 0);

  let best = null;
  let bestTs = Number.NEGATIVE_INFINITY;

  for (const d of list) {
    if (!isDrawValidForLotterySchedule(d, lotteryKey)) continue;

    const ts = drawTs(d);
    if (!Number.isFinite(ts)) continue;
    if (ts >= targetTs) continue;

    if (ts > bestTs) {
      best = d;
      bestTs = ts;
    }
  }

  if (!best) {
    return { draw: null, ymd: "", hour: "", source: "none" };
  }

  return {
    draw: best,
    ymd: pickDrawYMD(best) || "",
    hour: toHourBucket(pickDrawHour(best)) || "",
    source: "history_range",
  };
}

function sanitizeHistoricalDraws({ draws, lotteryKey, baseDraw }) {
  const list = Array.isArray(draws) ? draws : [];
  if (!baseDraw) return [];

  const baseTs = drawTs(baseDraw);
  if (!Number.isFinite(baseTs)) return [];

  return list
    .filter((d) => isDrawValidForLotterySchedule(d, lotteryKey))
    .filter((d) => {
      const ts = drawTs(d);
      return Number.isFinite(ts) && ts <= baseTs;
    })
    .sort((a, b) => drawTs(a) - drawTs(b));
}

function backfillDayTop3({ draws, lotteryKey, rangeDraws }) {
  const dayDraws = Array.isArray(draws) ? draws : [];
  const historicalDraws = Array.isArray(rangeDraws) ? rangeDraws : [];

  if (!dayDraws.length) return;

  const sortedDay = [...dayDraws]
    .filter((d) => isDrawValidForLotterySchedule(d, lotteryKey))
    .sort((a, b) => drawTs(a) - drawTs(b));

  if (sortedDay.length < 2) return;

  for (let i = 1; i < sortedDay.length; i++) {
    const current = sortedDay[i];
    const prev = sortedDay[i - 1];

    const currentYmd = pickDrawYMD(current);
    const currentHour = toHourBucket(pickDrawHour(current));
    const prevTs = drawTs(prev);

    if (!isYMD(currentYmd) || !currentHour || !Number.isFinite(prevTs)) continue;

    const usableHistory = [...historicalDraws]
      .filter((d) => isDrawValidForLotterySchedule(d, lotteryKey))
      .filter((d) => {
        const ts = drawTs(d);
        return Number.isFinite(ts) && ts <= prevTs;
      })
      .sort((a, b) => drawTs(a) - drawTs(b));

    if (!usableHistory.length) continue;

    const computed = computeStatisticalTop3V3({
      lotteryKey,
      drawsRange: usableHistory,
      drawLast: prev,
      drawsToday: sortedDay.filter((d) => {
        const ts = drawTs(d);
        return Number.isFinite(ts) && ts <= prevTs;
      }),
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
      topN: 3,
    });

    const picks = (Array.isArray(computed?.top) ? computed.top : [])
      .map((x) => Number(x?.grupo))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 25)
      .slice(0, 3);

    if (!picks.length) continue;

    registerPrediction({
      targetYmd: currentYmd,
      targetHour: currentHour,
      picks,
    });
  }
}

function resolveProbValue(x) {
  const n = Number(
    x?.scoreProb ??
      x?.prob ??
      x?.probCond ??
      x?.score ??
      0
  );

  return Number.isFinite(n) ? n : 0;
}

function resolveLayerMetaText(analytics) {
  const meta = analytics?.meta || null;
  const explain = meta?.explain || null;

  const candidates = [
    meta?.label,
    explain?.layerLabel,
    explain?.layerKey,
    meta?.scenario,
  ]
    .map((v) => safeStr(v))
    .filter(Boolean);

  return candidates[0] || "";
}

export function useTop3Controller() {
  const DEFAULT_LOTTERY = "PT_RIO";

  const {
    requestIdRef,
    boundsCacheRef,
    analyticsCacheRef,

    lotteryKey,
    setLotteryKey,
    ymd,
    setYmd,
    lookback,
    setLookback,

    loading,
    setLoading,
    loadingStage,
    setLoadingStage,
    error,
    setError,

    rangeDraws,
    setRangeDraws,
    todayDraws,
    setTodayDraws,
    rangeInfo,
    setRangeInfo,

    lastHourBucket,
    setLastHourBucket,
    targetHourBucket,
    setTargetHourBucket,
    targetYmd,
    setTargetYmd,

    lastInfo,
    setLastInfo,
    prevInfo,
    setPrevInfo,

    baseDrawState,
    setBaseDrawState,
  } = useTop3State({
    defaultLottery: DEFAULT_LOTTERY,
    defaultYmd: todayYMDLocal(),
    defaultLookback: LOOKBACK_ALL,
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
    const y = safeStr(targetYmd) || ymdSafe;

    return getScheduleForLottery({
      lotteryKey: lotteryKeySafe,
      ymd: y,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });
  }, [lotteryKeySafe, ymdSafe, targetYmd]);

  const isFederalNonDrawDay = useMemo(() => {
    return lotteryKeySafe === "FEDERAL" && !schedule.length;
  }, [lotteryKeySafe, schedule]);

  const analysisHourBucket = useMemo(
    () => safeStr(targetHourBucket) || "",
    [targetHourBucket]
  );

  const analysisYmd = useMemo(() => safeStr(targetYmd) || "", [targetYmd]);

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

    return `G${String(g).padStart(2, "0")}${
      animal ? " • " + animal.toUpperCase() : ""
    }${when ? " • " + when : ""}`;
  }, [prevInfo]);

  const lastLabel = useMemo(() => {
    if (!lastInfo?.lastGrupo) return "—";

    const g = Number(lastInfo.lastGrupo);
    const animal = safeStr(lastInfo.lastAnimal || getAnimalLabel?.(g) || "");

    const when =
      lastInfo?.lastYmd && lastInfo?.lastHour
        ? `${ymdToBR(lastInfo.lastYmd)} ${lastInfo.lastHour}`
        : "";

    return `G${String(g).padStart(2, "0")}${
      animal ? " • " + animal.toUpperCase() : ""
    }${when ? " • " + when : ""}`;
  }, [lastInfo]);

  const resetStateForNoData = useCallback(() => {
    setLastHourBucket("");
    setTargetHourBucket("");
    setTargetYmd("");
    setBaseDrawState(null);

    setLastInfo({
      lastYmd: "",
      lastHour: "",
      lastGrupo: null,
      lastAnimal: "",
    });

    setPrevInfo({
      prevYmd: "",
      prevHour: "",
      prevGrupo: null,
      prevAnimal: "",
      source: "none",
    });

    setRangeInfo({ from: "", to: "" });
    setRangeDraws([]);
    setTodayDraws([]);
  }, [
    setBaseDrawState,
    setLastHourBucket,
    setLastInfo,
    setPrevInfo,
    setRangeDraws,
    setRangeInfo,
    setTargetHourBucket,
    setTargetYmd,
    setTodayDraws,
  ]);

  const load = useCallback(async () => {
    const lKey = safeStr(lotteryKeySafe);
    if (!lKey || !isYMD(ymdSafe)) return;

    setLoading(true);
    setLoadingStage({ today: true, range: false });
    setError("");

    const currentRequestId = ++requestIdRef.current;

    const perfNow = () =>
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const perfLog = (label, start) => {
      const ms = Math.round((perfNow() - start) * 100) / 100;
      console.info(`[TOP3 PERF] ${label}: ${ms} ms`);
    };

    const perfTotal = perfNow();
    let __top3TodayCount = 0;
    let __top3HistCount = 0;

    console.info("[TOP3 FLOW] inicio", {
      lotteryKey: lotteryKeySafe,
      ymd: ymdSafe,
      lookback,
    });

    try {
      const ufResolved = lKey;

      let minDate = "";
      let maxDate = "";

      const cached = boundsCacheRef.current.get(ufResolved);

      if (cached) {
        minDate = cached.minDate;
        maxDate = cached.maxDate;
      } else {
        const perfBounds = perfNow();
        const b = await getKingBoundsByUf({ uf: ufResolved });
        perfLog("getKingBoundsByUf", perfBounds);

        const bMin = safeStr(b?.minYmd || b?.minDate || "");
        const bMax = safeStr(b?.maxYmd || b?.maxDate || "");

        if (isYMD(bMin)) minDate = bMin;
        if (isYMD(bMax)) maxDate = bMax;

        boundsCacheRef.current.set(ufResolved, { minDate, maxDate });
      }

      const effectiveYmd =
        lKey === "FEDERAL" && isYMD(maxDate) && !isFederalDrawDay(ymdSafe)
          ? maxDate
          : ymdSafe;

      alert("TOP3 FEDERAL DEBUG");
      console.info("[TOP3 FEDERAL DATE DEBUG]", {
        lKey,
        ymdSafe,
        minDate,
        maxDate,
        effectiveYmd,
        isFederalDrawDay: isFederalDrawDay(ymdSafe),
      });

      const perfToday = perfNow();
      const today =
        (await getKingResultsByDate({
          uf: ufResolved,
          date: effectiveYmd,
          readPolicy: "server",
        })) || [];
      perfLog("getKingResultsByDate:today", perfToday);
      __top3TodayCount = Array.isArray(today) ? today.length : 0;
      console.info("[TOP3 FLOW] today carregado", {
        totalToday: __top3TodayCount,
      });

      const todaySchedule = getScheduleForLottery({
        lotteryKey: lKey,
        ymd: effectiveYmd,
        PT_RIO_SCHEDULE_NORMAL,
        PT_RIO_SCHEDULE_WED_SAT,
        FEDERAL_SCHEDULE,
      });

      const todayLast = findLastDrawInList(today, todaySchedule);
      setTodayDraws(today);

      let baseDraw = null;
      let baseY = "";
      let baseH = "";
      let baseGrupo = null;
      let baseAnimal = "";

      let resolvedTargetY = "";
      let resolvedTargetH = "";

      let resolvedPrev = {
        draw: null,
        ymd: "",
        hour: "",
        source: "none",
      };


      if (todayLast) {
        baseDraw = todayLast;
        baseY = pickDrawYMD(todayLast) || effectiveYmd;
        baseH = toHourBucket(pickDrawHour(todayLast));
        baseGrupo = pickPrize1GrupoFromDraw(todayLast);
        baseAnimal = baseGrupo ? safeStr(getAnimalLabel(baseGrupo)) : "";

        const isFederalFallbackDay =
          lKey === "FEDERAL" && effectiveYmd !== ymdSafe;

        if (isFederalFallbackDay) {
          resolvedTargetY = baseY;
          resolvedTargetH = baseH;
        } else {
          const nextSlot = getNextSlotForLottery({
            lotteryKey: lKey,
            ymd: baseY,
            hourBucket: baseH,
            PT_RIO_SCHEDULE_NORMAL,
            PT_RIO_SCHEDULE_WED_SAT,
            FEDERAL_SCHEDULE,
          });

          resolvedTargetY = safeStr(nextSlot?.ymd);
          resolvedTargetH = toHourBucket(nextSlot?.hour);
        }

        if (isYMD(baseY) && baseH) {
          resolvedPrev = await getPreviousDrawRobust({
            getKingResultsByDate,
            lotteryKey: lKey,
            ymdTarget: baseY,
            targetHourBucket: baseH,
            todayDraws: today,
            schedule: todaySchedule,
            PT_RIO_SCHEDULE_NORMAL,
            PT_RIO_SCHEDULE_WED_SAT,
            FEDERAL_SCHEDULE,
          });

          if (!resolvedPrev?.draw) {
            resolvedPrev = await fallbackBaseSearch({
              getKingResultsByRange,
              findLatestHistoricalBaseDraw,
              addDaysYMD,
              minDate,
              lotteryKey: lKey,
              targetYmd: baseY,
              targetHourBucket: baseH,
              uf: ufResolved,
            });
          }
        }
      } else {
        const firstHourToday = toHourBucket(todaySchedule?.[0]);

        if (!firstHourToday) {
          resetStateForNoData();
          setError(
            "Não foi possível determinar o primeiro horário válido para esta loteria."
          );
          return;
        }

        resolvedTargetY = effectiveYmd;
        resolvedTargetH = firstHourToday;

        const previousForFirstSlot = await getPreviousDrawRobust({
          getKingResultsByDate,
          lotteryKey: lKey,
          ymdTarget: effectiveYmd,
          targetHourBucket: firstHourToday,
          todayDraws: today,
          schedule: todaySchedule,
          PT_RIO_SCHEDULE_NORMAL,
          PT_RIO_SCHEDULE_WED_SAT,
          FEDERAL_SCHEDULE,
        });

        if (typeof window !== "undefined") {
          console.info("[TOP3 FIRST SLOT DEBUG]", {
            effectiveYmd,
            firstHourToday,
            previousForFirstSlot: previousForFirstSlot
              ? {
                  ymd: previousForFirstSlot.ymd,
                  hour: previousForFirstSlot.hour,
                  source: previousForFirstSlot.source,
                  hasDraw: !!previousForFirstSlot.draw,
                }
              : null,
          });
        }

        if (typeof window !== "undefined") {
          console.info("[TOP3 FIRST SLOT DEBUG]", {
            effectiveYmd,
            firstHourToday,
            previousForFirstSlot: previousForFirstSlot
              ? {
                  ymd: previousForFirstSlot.ymd,
                  hour: previousForFirstSlot.hour,
                  source: previousForFirstSlot.source,
                  hasDraw: !!previousForFirstSlot.draw,
                }
              : null,
          });
        }

        const previousResolved = previousForFirstSlot?.draw
          ? previousForFirstSlot
          : await fallbackBaseSearch({
              getKingResultsByRange,
              findLatestHistoricalBaseDraw,
              addDaysYMD,
              minDate,
              lotteryKey: lKey,
              targetYmd: effectiveYmd,
              targetHourBucket: firstHourToday,
              uf: ufResolved,
            });

        if (!previousResolved?.draw) {
          resetStateForNoData();
          setError(
            "Não foi possível localizar a base anterior ao primeiro sorteio do dia."
          );
          return;
        }

        baseDraw = previousResolved.draw;
        baseY = safeStr(previousResolved.ymd);
        baseH = toHourBucket(previousResolved.hour);
        baseGrupo = pickPrize1GrupoFromDraw(baseDraw);
        baseAnimal = baseGrupo ? safeStr(getAnimalLabel(baseGrupo)) : "";

        const baseDayDraws =
          baseY === effectiveYmd
            ? today
            : (await getKingResultsByDate({
                uf: ufResolved,
                date: baseY,
                readPolicy: "server",
              })) || [];

        const baseDaySchedule = getScheduleForLottery({
          lotteryKey: lKey,
          ymd: baseY,
          PT_RIO_SCHEDULE_NORMAL,
          PT_RIO_SCHEDULE_WED_SAT,
          FEDERAL_SCHEDULE,
        });

        if (isYMD(baseY) && baseH) {
          resolvedPrev = await getPreviousDrawRobust({
            getKingResultsByDate,
            lotteryKey: lKey,
            ymdTarget: baseY,
            targetHourBucket: baseH,
            todayDraws: baseDayDraws,
            schedule: baseDaySchedule,
            PT_RIO_SCHEDULE_NORMAL,
            PT_RIO_SCHEDULE_WED_SAT,
            FEDERAL_SCHEDULE,
          });

          if (!resolvedPrev?.draw) {
            resolvedPrev = await fallbackBaseSearch({
              getKingResultsByRange,
              findLatestHistoricalBaseDraw,
              addDaysYMD,
              minDate,
              lotteryKey: lKey,
              targetYmd: baseY,
              targetHourBucket: baseH,
              uf: ufResolved,
            });
          }
        }
      }

      if (requestIdRef.current !== currentRequestId) return;

      setBaseDrawState(baseDraw || null);
      setLastHourBucket(baseH);
      setTargetYmd(resolvedTargetY || "");
      setTargetHourBucket(resolvedTargetH || "");

      setLastInfo({
        lastYmd: baseY || "",
        lastHour: baseH || "",
        lastGrupo: baseGrupo,
        lastAnimal: baseAnimal,
      });

      if (resolvedPrev?.draw) {
        const gPrev = pickPrize1GrupoFromDraw(resolvedPrev.draw);

        setPrevInfo({
          prevYmd: resolvedPrev.ymd,
          prevHour: resolvedPrev.hour,
          prevGrupo: gPrev,
          prevAnimal: gPrev ? safeStr(getAnimalLabel(gPrev)) : "",
          source: resolvedPrev.source,
        });
      } else {
        setPrevInfo({
          prevYmd: "",
          prevHour: "",
          prevGrupo: null,
          prevAnimal: "",
          source: "none",
        });
      }

      let rangeFrom = "";

      if (lookback === LOOKBACK_ALL) {
        rangeFrom = minDate || addDaysYMD(ymdSafe, -180);
      } else {
        const days = Math.max(1, Number(lookback || 30));
        rangeFrom = addDaysYMD(ymdSafe, -(days - 1));
      }

      const rangeTo = isYMD(baseY) ? baseY : ymdSafe;

      setRangeInfo({ from: rangeFrom, to: rangeTo });
      setLoadingStage({ today: false, range: true });

      // Libera a renderização principal antes do carregamento pesado do histórico.
      setLoading(false);

      const perfRange = perfNow();
      const hist = await loadHistoryRange({
        getKingResultsByRange,
        uf: ufResolved,
        dateFrom: rangeFrom,
        dateTo: rangeTo,
      });
      perfLog("loadHistoryRange:detailed", perfRange);
      __top3HistCount = Array.isArray(hist) ? hist.length : 0;
      console.info("[TOP3 FLOW] historico carregado", {
        totalHistorico: __top3HistCount,
        rangeFrom,
        rangeTo,
      });

      if (requestIdRef.current !== currentRequestId) return;

      setRangeDraws(hist);
      backfillDayTop3({ draws: today, lotteryKey: lKey, rangeDraws: hist });
    } catch (e) {
      if (requestIdRef.current === currentRequestId) {
        setError(String(e?.message || e || "Falha ao carregar dados do TOP3."));
        setBaseDrawState(null);
      }
    } finally {
      perfLog("load:total", perfTotal);
      console.info("[TOP3 FLOW] fim", {
        totalToday: __top3TodayCount,
        totalHistorico: __top3HistCount,
      });

      if (requestIdRef.current === currentRequestId) {
        setLoadingStage({ today: false, range: false });
        setLoading(false);
      }
    }
  }, [
    lotteryKeySafe,
    ymdSafe,
    lookback,
    resetStateForNoData,
    boundsCacheRef,
    requestIdRef,
    setBaseDrawState,
    setError,
    setLastHourBucket,
    setLastInfo,
    setLoading,
    setLoadingStage,
    setPrevInfo,
    setRangeDraws,
    setRangeInfo,
    setTargetHourBucket,
    setTargetYmd,
    setTodayDraws,
  ]);

  useEffect(() => {
    ensureDayTimeline({
      ymd: ymdSafe,
      lotteryKey: lotteryKeySafe,
    });

    load();
  }, [load, ymdSafe, lotteryKeySafe]);

  const analytics = useMemo(() => {
    return computeTop3Analytics({
      rangeDraws,
      baseDrawState,
      analyticsCacheRef,
      lotteryKeySafe,
      lookback,
      rangeInfo,
      todayDraws,
      sanitizeHistoricalDraws,
    });
  }, [
    rangeDraws,
    baseDrawState,
    analyticsCacheRef,
    lotteryKeySafe,
    lookback,
    rangeInfo,
    todayDraws,
  ]);

  const build20 = useCallback(
    (grupo2, item = null) => {
      const scopedDraws = Array.isArray(item?.meta?.matchingDraws) && item.meta.matchingDraws.length
        ? item.meta.matchingDraws
        : rangeDraws;

      return buildMilharesForGrupo({
        rangeDraws: scopedDraws,
        analysisHourBucket,
        schedule,
        grupo2,
        count: 20,
      });
    },
    [rangeDraws, analysisHourBucket, schedule]
  );

  const layerMetaText = useMemo(() => {
    return resolveLayerMetaText(analytics);
  }, [analytics]);

  const top3 = useMemo(() => {
    return buildTop3Predictions({
      analytics,
      build20,
      safeStr,
      getAnimalLabel,
      build4ColsFromEngineOut,
      resolveProbValue,
      getGrupoImgSrc,
      buildResultStyleImgVariants,
    });
  }, [analytics, build20]);

  const timelineTop3 = useMemo(() => {
    return buildTop3TimelineViewModel({
      todayDraws,
      rangeDraws,
      lotteryKeySafe,
      ymdSafe,
      analysisYmd,
      publicBase: "",
    });
  }, [todayDraws, rangeDraws, lotteryKeySafe, ymdSafe, analysisYmd]);

  useEffect(() => {
    if (!analysisYmd || !analysisHourBucket) return;
    if (!Array.isArray(top3) || !top3.length) return;

    if (!isFutureTarget(analysisYmd, analysisHourBucket)) return;

    const targetKey = makeKey(analysisYmd, analysisHourBucket);
    const picks = top3
      .map((x) => Number(x?.grupo))
      .filter((n) => Number.isFinite(n));

    if (!targetKey || !picks.length) return;

    registerPrediction({
      targetKey,
      targetYmd: analysisYmd,
      targetHour: analysisHourBucket,
      picks,
    });
  }, [analysisYmd, analysisHourBucket, top3]);

  useEffect(() => {
    if (!Array.isArray(todayDraws) && !Array.isArray(rangeDraws)) return;
    if (!(todayDraws?.length || rangeDraws?.length)) return;

    reconcilePendingTop3Log({
      todayDraws: Array.isArray(todayDraws) ? todayDraws : [],
      rangeDraws: Array.isArray(rangeDraws) ? rangeDraws : [],
    });
  }, [todayDraws, rangeDraws]);

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
    timelineTop3,

    setLotteryKey,
    setYmd,
    setLookback,
    load,

    safeStr,
    lotteryLabel,
    build16: (grupo2) =>
      build16MilharesForGrupo({
        rangeDraws,
        analysisHourBucket,
        schedule,
        grupo2,
      }),

    build20,
    getCentena3,
    normalizeImgSrc,
  };
}









