import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  safeStr,
  isYMD,
  ymdToBR,
  normalizeToYMD,
  todayYMDLocal,
  addDaysYMD,
  toHourBucket,
  hourToInt,
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
  findLastDrawInList,
  pickDrawHour,
  pickDrawYMD,
  pickPrize1GrupoFromDraw,
  getPreviousDrawRobust,
  build16MilharesForGrupo,
  buildMilharesForGrupo,
  getNextSlotForLottery,
  isFederalDrawDay,
} from "./top3.engine";

import { lotteryLabel } from "./top3.selectors";

import {
  registerPrediction,
  reconcilePendingTop3Log,
  ensureDayTimeline,
} from "./top3.storage";

import {
  saveTop3PredictionSnapshot,
  loadTop3PredictionDay,
  reconcileTop3PredictionDay,
} from "./top3.firestore";

import {
  getKingResultsByDate,
  getKingResultsByRange,
  getKingBoundsByUf,
} from "../../services/kingResultsService";

import { getAnimalLabel } from "../../constants/bichoMap";

import {
  fallbackBaseSearch,
  loadHistoryRange,
} from "./modules/top3.loader";

import { computeTop3Analytics } from "./modules/top3.analytics";

import { buildTop3Predictions } from "./modules/top3.prediction";

import { buildTop3TimelineViewModel } from "./modules/top3.timeline";

import {
  buildTop3MilharesCols,
  resolveTop3ProbValue,
} from "./modules/top3.viewmodel";

import {
  normalizeImgSrc,
  getGrupoImgSrc,
  buildResultStyleImgVariants,
} from "./top3.images";

function emptyAnalytics() {
  return { top: [], meta: null };
}

function drawTs(draw) {
  const y = pickDrawYMD(draw);
  const h = toHourBucket(pickDrawHour(draw));

  if (!isYMD(y) || !h) return Number.NEGATIVE_INFINITY;

  const [Y, M, D] = String(y).split("-").map(Number);
  const mins = hourToInt(h);

  if (!Number.isFinite(mins) || mins < 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return Date.UTC(Y, M - 1, D) + mins * 60 * 1000;
}

function drawKey(draw) {
  const y = pickDrawYMD(draw);
  const h = toHourBucket(pickDrawHour(draw));
  return isYMD(y) && h ? `${y}|${h}` : "";
}

function hasDrawAtHour(draws, hourBucket) {
  const target = toHourBucket(hourBucket);
  if (!target) return false;

  return (Array.isArray(draws) ? draws : []).some((d) => {
    const h = toHourBucket(pickDrawHour(d));
    return h === target;
  });
}

function mergeBaseIntoRange(rangeDraws, baseDraw) {
  const list = Array.isArray(rangeDraws) ? rangeDraws : [];
  const key = drawKey(baseDraw);

  if (!key) return list;

  const map = new Map();

  for (const d of list) {
    const k = drawKey(d);
    if (k) map.set(k, d);
  }

  if (!map.has(key)) {
    map.set(key, baseDraw);
  }

  return Array.from(map.values()).sort((a, b) => drawTs(a) - drawTs(b));
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

  const normalizedSchedule = Array.isArray(schedule)
    ? schedule.map(toHourBucket).filter(Boolean)
    : [];

  return normalizedSchedule.includes(h);
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

  const [Y, M, D] = String(targetYmd).split("-").map(Number);
  const mins = hourToInt(targetHour);
  const targetTs = Date.UTC(Y, M - 1, D) + mins * 60 * 1000;

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
  const baseTs = drawTs(baseDraw);

  if (!baseDraw || !Number.isFinite(baseTs)) return [];

  return list
    .filter((d) => isDrawValidForLotterySchedule(d, lotteryKey))
    .filter((d) => {
      const ts = drawTs(d);
      return Number.isFinite(ts) && ts <= baseTs;
    })
    .sort((a, b) => drawTs(a) - drawTs(b));
}

function parseTargetDate(ymd, hour) {
  if (!isYMD(ymd)) return null;

  const h = toHourBucket(hour);
  const m = String(h || "").match(/^(\d{2})h$/);

  if (!m) return null;

  const [Y, M, D] = String(ymd).split("-").map(Number);
  const hh = Number(m[1]);

  const dt = new Date(Y, M - 1, D, hh, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isFutureTarget(ymd, hour) {
  const target = parseTargetDate(ymd, hour);
  if (!target) return false;
  return target.getTime() > Date.now();
}

function makeTargetKey(ymd, hour) {
  const y = safeStr(ymd);
  const h = toHourBucket(hour);
  return isYMD(y) && h ? `${y}_${h}` : "";
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

function debugTop3Effect(name, details = {}) {
  if (typeof window === "undefined") return;

  const enabled =
    new URLSearchParams(window.location.search).get(
      "debugTop3Effects"
    ) === "1";

  if (!enabled) return;

  const counters =
    window.__TOP3_EFFECT_COUNTS__ ||
    (window.__TOP3_EFFECT_COUNTS__ = {});

  counters[name] = Number(counters[name] || 0) + 1;

  console.info(
    "[TOP3 EFFECT]",
    name,
    `#${counters[name]}`,
    details
  );
}

export function useTop3Controller() {
  const DEFAULT_LOTTERY = "PT_RIO";

  const debugTop3 =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debugTop3") === "1";

  const requestIdRef = useRef(0);
  const boundsCacheRef = useRef(new Map());
  const analyticsCacheRef = useRef({ key: "", value: emptyAnalytics() });

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
  const [todayDraws, setTodayDraws] = useState([]);
  const [rangeInfo, setRangeInfo] = useState({ from: "", to: "" });

  const [loadedYmd, setLoadedYmd] = useState("");
  const [lastHourBucket, setLastHourBucket] = useState("");
  const [targetHourBucket, setTargetHourBucket] = useState("");
  const [targetYmd, setTargetYmd] = useState("");
  const [skipPtRio18ByFederal, setSkipPtRio18ByFederal] = useState(false);

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

  const [baseDrawState, setBaseDrawState] = useState(null);
  const [persistedTop3History, setPersistedTop3History] = useState([]);

  const lotteryKeySafe = useMemo(
    () => safeStr(lotteryKey).toUpperCase() || DEFAULT_LOTTERY,
    [lotteryKey]
  );

  const ymdSafe = useMemo(() => {
    const y = normalizeToYMD(ymd);
    return y && isYMD(y) ? y : todayYMDLocal();
  }, [ymd]);

  const dateBR = useMemo(() => ymdToBR(ymdSafe), [ymdSafe]);

  const analysisHourBucket = useMemo(
    () => toHourBucket(targetHourBucket) || "",
    [targetHourBucket]
  );

  const analysisYmd = useMemo(
    () => (isYMD(targetYmd) ? targetYmd : ""),
    [targetYmd]
  );

  const timelineYmd = useMemo(() => {
    if (isYMD(loadedYmd)) return loadedYmd;
    return ymdSafe;
  }, [loadedYmd, ymdSafe]);

  const schedule = useMemo(() => {
    const y = isYMD(analysisYmd)
      ? analysisYmd
      : isYMD(loadedYmd)
        ? loadedYmd
        : ymdSafe;

    return getScheduleForLottery({
      lotteryKey: lotteryKeySafe,
      ymd: y,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });
  }, [lotteryKeySafe, ymdSafe, loadedYmd, analysisYmd]);

  const isFederalNonDrawDay = useMemo(() => {
    return lotteryKeySafe === "FEDERAL" && !isFederalDrawDay(ymdSafe);
  }, [lotteryKeySafe, ymdSafe]);

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
    analyticsCacheRef.current = { key: "", value: emptyAnalytics() };

    setLoadedYmd("");
    setLastHourBucket("");
    setTargetHourBucket("");
    setTargetYmd("");
    setSkipPtRio18ByFederal(false);
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
  }, []);

  const load = useCallback(async () => {
    const lKey = safeStr(lotteryKeySafe).toUpperCase();
    if (!lKey || !isYMD(ymdSafe)) return;

    setLoading(true);
    setLoadingStage({ today: true, range: false });
    setError("");

    analyticsCacheRef.current = { key: "", value: emptyAnalytics() };

    const currentRequestId = ++requestIdRef.current;

    try {
      const ufResolved = lKey;

      let minDate = "";
      let maxDate = "";

      const cached = boundsCacheRef.current.get(ufResolved);

      if (cached) {
        minDate = cached.minDate;
        maxDate = cached.maxDate;
      } else {
        const b = await getKingBoundsByUf({ uf: ufResolved });

        const bMin = safeStr(b?.minYmd || b?.minDate || "");
        const bMax = safeStr(b?.maxYmd || b?.maxDate || "");

        if (isYMD(bMin)) minDate = bMin;
        if (isYMD(bMax)) maxDate = bMax;

        boundsCacheRef.current.set(ufResolved, { minDate, maxDate });
      }

      const selectedFederalNonDrawDay =
        lKey === "FEDERAL" && !isFederalDrawDay(ymdSafe);

      const effectiveYmd =
        selectedFederalNonDrawDay && isYMD(maxDate) ? maxDate : ymdSafe;

      const today =
        (await getKingResultsByDate({
          uf: ufResolved,
          date: effectiveYmd,
          readPolicy: "server",
        })) || [];

      if (requestIdRef.current !== currentRequestId) return;

      setLoadedYmd(effectiveYmd);
      setTodayDraws(today);

      let todaySchedule = getScheduleForLottery({
        lotteryKey: lKey,
        ymd: effectiveYmd,
        PT_RIO_SCHEDULE_NORMAL,
        PT_RIO_SCHEDULE_WED_SAT,
        FEDERAL_SCHEDULE,
      });

      const shouldSkipPtRio18 =
        (lKey === "PT_RIO" || lKey === "RJ") &&
        isFederalDrawDay(effectiveYmd) &&
        String(effectiveYmd || "").trim() >= "2025-11-03";

      if (shouldSkipPtRio18) {
        todaySchedule = Array.from(
          new Set([
            ...(Array.isArray(todaySchedule) ? todaySchedule : [])
              .map(toHourBucket)
              .filter((h) => h && h !== "18:00"),
            "19:00",
          ])
        ).sort((a, b) => {
          const [ah, am] = String(a).split(":").map(Number);
          const [bh, bm] = String(b).split(":").map(Number);

          return ah * 60 + am - (bh * 60 + bm);
        });
      }

      setSkipPtRio18ByFederal(Boolean(shouldSkipPtRio18));

      if (!Array.isArray(todaySchedule) || !todaySchedule.length) {
        resetStateForNoData();
        setError("Não há grade de sorteio válida para esta data/loteria.");
        return;
      }

      const todayLast = findLastDrawInList(today, todaySchedule);

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

        const effectiveTodaySchedule = (Array.isArray(todaySchedule) ? todaySchedule : [])
          .map(toHourBucket)
          .filter(Boolean);

        const baseIdx = baseY === effectiveYmd
          ? effectiveTodaySchedule.indexOf(baseH)
          : -1;

        if (baseIdx >= 0 && baseIdx < effectiveTodaySchedule.length - 1) {
          resolvedTargetY = effectiveYmd;
          resolvedTargetH = effectiveTodaySchedule[baseIdx + 1];
        } else {
          const nextSlot = getNextSlotForLottery({
            lotteryKey: lKey,
            ymd: baseY,
            hourBucket: baseH,
            PT_RIO_SCHEDULE_NORMAL,
            PT_RIO_SCHEDULE_WED_SAT,
            FEDERAL_SCHEDULE,
          });

          resolvedTargetY = safeStr(nextSlot?.ymd || "");
          resolvedTargetH = toHourBucket(nextSlot?.hour || "");
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
      }

      baseGrupo = pickPrize1GrupoFromDraw(baseDraw);
      baseAnimal = baseGrupo ? safeStr(getAnimalLabel(baseGrupo)) : "";

      if (
        !baseDraw ||
        !isYMD(baseY) ||
        !baseH ||
        !Number.isFinite(Number(baseGrupo)) ||
        Number(baseGrupo) < 1 ||
        Number(baseGrupo) > 25 ||
        !isYMD(resolvedTargetY) ||
        !resolvedTargetH
      ) {
        resetStateForNoData();
        setError("Base ou alvo inválido para cálculo do TOP3.");
        return;
      }

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

      if (requestIdRef.current !== currentRequestId) return;

      setBaseDrawState(baseDraw);
      setLastHourBucket(baseH);
      setTargetYmd(resolvedTargetY);
      setTargetHourBucket(resolvedTargetH);

      if (debugTop3) console.log(
        "[TOP3 STATE]",
        JSON.stringify(
          {
            loadedYmd: effectiveYmd,

            baseYmd: baseY,
            baseHour: baseH,
            baseGrupo,

            targetYmd: resolvedTargetY,
            targetHour: resolvedTargetH,

            previousYmd: resolvedPrev?.ymd || "",
            previousHour: resolvedPrev?.hour || "",
            previousSource: resolvedPrev?.source || "",

            todayDraws: Array.isArray(today) ? today.length : 0,
          },
          null,
          2
        )
      );

      setLastInfo({
        lastYmd: baseY,
        lastHour: baseH,
        lastGrupo: Number(baseGrupo),
        lastAnimal: baseAnimal,
      });

      if (resolvedPrev?.draw) {
        const gPrev = pickPrize1GrupoFromDraw(resolvedPrev.draw);

        setPrevInfo({
          prevYmd: resolvedPrev.ymd || "",
          prevHour: toHourBucket(resolvedPrev.hour) || "",
          prevGrupo: Number.isFinite(Number(gPrev)) ? Number(gPrev) : null,
          prevAnimal: gPrev ? safeStr(getAnimalLabel(gPrev)) : "",
          source: resolvedPrev.source || "none",
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
        rangeFrom = minDate || addDaysYMD(baseY, -240);
      } else {
        const days = Math.max(1, Number(lookback || 30));
        rangeFrom = addDaysYMD(baseY, -(days - 1));
      }

      const rangeTo = baseY;

      setRangeInfo({ from: rangeFrom, to: rangeTo });
      setLoadingStage({ today: false, range: true });

      const histRaw = await loadHistoryRange({
        getKingResultsByRange,
        uf: ufResolved,
        dateFrom: rangeFrom,
        dateTo: rangeTo,
        readPolicy: "server",
      });

      if (requestIdRef.current !== currentRequestId) return;

      const hist = mergeBaseIntoRange(histRaw, baseDraw);

      if (debugTop3) console.log(
        "[TOP3 HISTORY]",
        JSON.stringify(
          {
            period: {
              from: rangeFrom,
              to: rangeTo,
            },

            firestoreDraws: Array.isArray(histRaw)
              ? histRaw.length
              : 0,

            mergedDraws: Array.isArray(hist)
              ? hist.length
              : 0,

            baseIncluded: Array.isArray(hist)
              ? hist.some(
                  (d) =>
                    drawKey(d) === drawKey(baseDraw)
                )
              : false,

            firstDraw:
              Array.isArray(hist) && hist.length
                ? {
                    ymd: pickDrawYMD(hist[0]),
                    hour: toHourBucket(pickDrawHour(hist[0])),
                  }
                : null,

            lastDraw:
              Array.isArray(hist) && hist.length
                ? {
                    ymd: pickDrawYMD(hist[hist.length - 1]),
                    hour: toHourBucket(
                      pickDrawHour(hist[hist.length - 1])
                    ),
                  }
                : null,
          },
          null,
          2
        )
      );

      setRangeDraws(hist);
    } catch (e) {
      if (requestIdRef.current === currentRequestId) {
        setError(String(e?.message || e || "Falha ao carregar dados do TOP3."));
        setBaseDrawState(null);
      }
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoadingStage({ today: false, range: false });
        setLoading(false);
      }
    }
  }, [lotteryKeySafe, ymdSafe, lookback, resetStateForNoData]);

  useEffect(() => {
    debugTop3Effect("01_load", {
      lotteryKey: lotteryKeySafe,
      ymd: ymdSafe,
      lookback,
    });

    load();
  }, [load]);

  useEffect(() => {
    debugTop3Effect("02_ensure_timeline", {
      lotteryKey: lotteryKeySafe,
      timelineYmd,
    });

    ensureDayTimeline({
      ymd: timelineYmd,
      lotteryKey: lotteryKeySafe,
    });
  }, [timelineYmd, lotteryKeySafe]);

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
      targetYmd: analysisYmd,
      targetHourBucket: analysisHourBucket,
    });
  }, [
    rangeDraws,
    baseDrawState,
    lotteryKeySafe,
    lookback,
    rangeInfo,
    todayDraws,
    analysisYmd,
    analysisHourBucket,
  ]);

  const build20 = useCallback(
    (grupo2, item = null) => {
      return buildMilharesForGrupo({
        rangeDraws,
        analysisHourBucket,
        schedule,
        grupo2,
        count: 20,
        targetYmd: item?.meta?.next?.ymd || analysisYmd,
      });
    },
    [rangeDraws, analysisHourBucket, schedule, analysisYmd]
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
      build4ColsFromEngineOut: buildTop3MilharesCols,
      resolveProbValue: resolveTop3ProbValue,
      getGrupoImgSrc,
      buildResultStyleImgVariants,
    });
  }, [analytics, build20]);

  const timelineTop3 = useMemo(() => {
    const built = buildTop3TimelineViewModel({
      todayDraws,
      rangeDraws,
      lotteryKeySafe,
      ymdSafe: timelineYmd,
      analysisYmd,
      publicBase: String(process.env.PUBLIC_URL || "").trim(),
    });

    if (
      (lotteryKeySafe === "PT_RIO" || lotteryKeySafe === "RJ") &&
      skipPtRio18ByFederal &&
      isYMD(timelineYmd)
    ) {
      return (Array.isArray(built) ? built : []).filter((slot) => {
        const y = String(slot?.targetYmd || "").trim();
        const h = toHourBucket(slot?.targetHour || "");
        return !(y === timelineYmd && h === "18:00");
      });
    }

    return built;
  }, [
    todayDraws,
    rangeDraws,
    lotteryKeySafe,
    timelineYmd,
    analysisYmd,
    skipPtRio18ByFederal,
  ]);

  useEffect(() => {
    debugTop3Effect("03_save_prediction", {
      lotteryKey: lotteryKeySafe,
      analysisYmd,
      analysisHourBucket,
      top3Length: Array.isArray(top3)
        ? top3.length
        : -1,
    });

    if (!analysisYmd || !analysisHourBucket) return;
    if (!Array.isArray(top3) || !top3.length) return;
    if (!isFutureTarget(analysisYmd, analysisHourBucket)) return;

    const targetKey = makeTargetKey(analysisYmd, analysisHourBucket);
    const picks = top3
      .map((x) => Number(x?.grupo))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 25)
      .slice(0, 3);

    if (!targetKey || !picks.length) return;

    const snapshot = top3.map((item, index) => ({
      rank: index + 1,
      grupo: Number(item?.grupo),
      animal: safeStr(item?.animal || ""),
      prob: Number(item?.prob || 0),
      probPct: Number(item?.probPct || 0),
      milhares20: Array.isArray(item?.milhares20)
        ? item.milhares20.slice(0, 20)
        : [],
      milharesCols: Array.isArray(item?.milharesCols)
        ? item.milharesCols
        : [],
      meta: item?.meta || null,
    }));

    const engineVersion =
      safeStr(top3?.[0]?.meta?.explain?.engine) ||
      safeStr(top3?.[0]?.meta?.scenario) ||
      "V3_STATISTICAL";

    registerPrediction({
      targetKey,
      targetYmd: analysisYmd,
      targetHour: analysisHourBucket,
      picks,
      snapshot,
      engineVersion,
    });

    saveTop3PredictionSnapshot({
      lotteryKey: lotteryKeySafe,
      targetYmd: analysisYmd,
      targetHour: analysisHourBucket,
      picks,
      snapshot,
      engineVersion,
    })
      .then((result) => {
        const diagnostic = {
          at: new Date().toISOString(),
          lotteryKey: lotteryKeySafe,
          targetYmd: analysisYmd,
          targetHour: analysisHourBucket,
          picks,
          result: result || null,
        };

        try {
          window.localStorage.setItem(
            "top3_firestore_last_save",
            JSON.stringify(diagnostic)
          );

          window.__TOP3_FIRESTORE_LAST_SAVE__ = diagnostic;
        } catch {}

        if (!result?.ok) {
          console.error(
            "[TOP3 FIRESTORE SAVE FAILED]",
            diagnostic
          );
        } else {
          console.info(
            "[TOP3 FIRESTORE SAVE OK]",
            diagnostic
          );
        }
      })
      .catch((error) => {
        const diagnostic = {
          at: new Date().toISOString(),
          lotteryKey: lotteryKeySafe,
          targetYmd: analysisYmd,
          targetHour: analysisHourBucket,
          picks,
          error: String(error?.message || error || ""),
        };

        try {
          window.localStorage.setItem(
            "top3_firestore_last_save",
            JSON.stringify(diagnostic)
          );

          window.__TOP3_FIRESTORE_LAST_SAVE__ = diagnostic;
        } catch {}

        console.error(
          "[TOP3 FIRESTORE SAVE EXCEPTION]",
          diagnostic
        );
      });
  }, [
    analysisYmd,
    analysisHourBucket,
    top3,
    lotteryKeySafe,
    debugTop3,
  ]);

  useEffect(() => {
    debugTop3Effect("04_load_persisted_history", {
      lotteryKey: lotteryKeySafe,
      timelineYmd,
      scheduleLength: Array.isArray(schedule)
        ? schedule.length
        : -1,
      todayDrawsLength: Array.isArray(todayDraws)
        ? todayDraws.length
        : -1,
      rangeDrawsLength: Array.isArray(rangeDraws)
        ? rangeDraws.length
        : -1,
    });

    let alive = true;

    async function loadPersistedHistory() {
      if (!isYMD(timelineYmd)) {
        if (alive) setPersistedTop3History([]);
        return;
      }

      try {
        const history = await loadTop3PredictionDay({
          lotteryKey: lotteryKeySafe,
          targetYmd: timelineYmd,
          schedule,
        });

        if (alive) {
          setPersistedTop3History(
            Array.isArray(history) ? history : []
          );
        }
      } catch {
        if (alive) setPersistedTop3History([]);
      }
    }

    loadPersistedHistory();

    return () => {
      alive = false;
    };
  }, [
    lotteryKeySafe,
    timelineYmd,
    schedule,
    todayDraws,
    rangeDraws,
  ]);

  useEffect(() => {
    debugTop3Effect("05_reconcile_history", {
      lotteryKey: lotteryKeySafe,
      timelineYmd,
      scheduleLength: Array.isArray(schedule)
        ? schedule.length
        : -1,
      todayDrawsLength: Array.isArray(todayDraws)
        ? todayDraws.length
        : -1,
      rangeDrawsLength: Array.isArray(rangeDraws)
        ? rangeDraws.length
        : -1,
    });

    if (!(todayDraws?.length || rangeDraws?.length)) return;

    const allDraws = [
      ...(Array.isArray(rangeDraws) ? rangeDraws : []),
      ...(Array.isArray(todayDraws) ? todayDraws : []),
    ];

    reconcilePendingTop3Log({
      todayDraws: Array.isArray(todayDraws) ? todayDraws : [],
      rangeDraws: Array.isArray(rangeDraws) ? rangeDraws : [],
    });

    reconcileTop3PredictionDay({
      lotteryKey: lotteryKeySafe,
      targetYmd: timelineYmd,
      schedule,
      draws: allDraws,
    })
      .then(async () => {
        const history = await loadTop3PredictionDay({
          lotteryKey: lotteryKeySafe,
          targetYmd: timelineYmd,
          schedule,
        });

        setPersistedTop3History(
          Array.isArray(history) ? history : []
        );
      })
      .catch((error) => {
        if (debugTop3) {
          console.warn("[TOP3 FIRESTORE RECONCILE]", error);
        }
      });
  }, [
    todayDraws,
    rangeDraws,
    lotteryKeySafe,
    timelineYmd,
    schedule,
    debugTop3,
  ]);

  return {
    LOOKBACK_ALL,
    LOOKBACK_OPTIONS,
    LOTTERY_OPTIONS,

    lotteryKeySafe,
    ymdSafe,
    loadedYmd,
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
    persistedTop3History,

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
        targetYmd: analysisYmd,
      }),

    build20,
    getCentena3,
    normalizeImgSrc,
  };
}