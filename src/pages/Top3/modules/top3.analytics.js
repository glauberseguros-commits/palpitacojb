import {
  isYMD,
  toHourBucket,
} from "../top3.formatters";

import {
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
} from "../top3.constants";

import {
  pickDrawHour,
  pickDrawYMD,
  pickPrize1GrupoFromDraw,
  computeConditionalNextTop3V2,
} from "../top3.engine";

export function computeTop3Analytics({
  rangeDraws,
  baseDrawState,
  analyticsCacheRef,
  lotteryKeySafe,
  lookback,
  rangeInfo,
  todayDraws,
  sanitizeHistoricalDraws,
}) {
  const rawList = Array.isArray(rangeDraws) ? rangeDraws : [];
  const drawLast = baseDrawState;

  console.info("[TOP3 ANALYTICS DEBUG]", {
    rawListLength: rawList.length,
    hasBaseDraw: !!drawLast,
    baseYmd: pickDrawYMD(drawLast) || "",
    baseHour: toHourBucket(pickDrawHour(drawLast)) || "",
    baseGrupo: pickPrize1GrupoFromDraw(drawLast),
    lotteryKeySafe,
    lookback,
    rangeFrom: rangeInfo?.from || "",
    rangeTo: rangeInfo?.to || "",
    todayDrawsLength: Array.isArray(todayDraws) ? todayDraws.length : 0,
  });

  if (!rawList.length || !drawLast) {
    const empty = { top: [], meta: null };
    analyticsCacheRef.current = { key: "", value: empty };
    return empty;
  }

  const lastG = Number(pickPrize1GrupoFromDraw(drawLast));
  const lastY = pickDrawYMD(drawLast) || "";
  const lastH = toHourBucket(pickDrawHour(drawLast)) || "";

  if (!Number.isFinite(lastG) || !isYMD(lastY) || !lastH) {
    const empty = { top: [], meta: null };
    analyticsCacheRef.current = { key: "", value: empty };
    return empty;
  }

  const historicalList = sanitizeHistoricalDraws({
    draws: rawList,
    lotteryKey: lotteryKeySafe,
    baseDraw: drawLast,
  });

  console.info("[TOP3 ANALYTICS DEBUG] historicalList", {
    historicalListLength: historicalList.length,
    firstYmd: pickDrawYMD(historicalList[0]) || "",
    firstHour: toHourBucket(pickDrawHour(historicalList[0])) || "",
    lastYmd: pickDrawYMD(historicalList[historicalList.length - 1]) || "",
    lastHour: toHourBucket(pickDrawHour(historicalList[historicalList.length - 1])) || "",
  });

  if (!historicalList.length) {
    const fallback = computeConditionalNextTop3V2({
      lotteryKey: lotteryKeySafe,
      drawsRange: rawList,
      drawLast,
      drawsToday: Array.isArray(todayDraws) ? todayDraws : [],
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
      topN: 3,
    }) || { top: [], meta: null };

    analyticsCacheRef.current = { key: "fallback", value: fallback };
    return fallback;
  }

  const firstDraw = historicalList[0];
  const lastDrawInRange = historicalList[historicalList.length - 1];

  const cacheKey = [
    "V3",
    lotteryKeySafe,
    lookback,
    rangeInfo?.from || "",
    rangeInfo?.to || "",
    historicalList.length,
    Array.isArray(todayDraws) ? todayDraws.length : 0,
    pickDrawYMD(firstDraw) || "",
    toHourBucket(pickDrawHour(firstDraw)) || "",
    pickDrawYMD(lastDrawInRange) || "",
    toHourBucket(pickDrawHour(lastDrawInRange)) || "",
    lastY,
    lastH,
    lastG,
  ].join("|");

  if (analyticsCacheRef.current.key === cacheKey) {
    return analyticsCacheRef.current.value;
  }

  const computed = computeConditionalNextTop3V2({
    lotteryKey: lotteryKeySafe,
    drawsRange: historicalList,
    drawLast,
    drawsToday: Array.isArray(todayDraws) ? todayDraws : [],
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
    topN: 3,
  });

  console.info("[TOP3 ANALYTICS DEBUG] computed", {
    topLength: Array.isArray(computed?.top) ? computed.top.length : 0,
    meta: computed?.meta || null,
  });

  analyticsCacheRef.current = { key: cacheKey, value: computed };
  return computed;
}
