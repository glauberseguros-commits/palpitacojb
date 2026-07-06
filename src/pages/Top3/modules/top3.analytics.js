import { isYMD, toHourBucket } from "../top3.formatters";

import {
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
} from "../top3.constants";

import {
  pickDrawHour,
  pickDrawYMD,
  pickPrize1GrupoFromDraw,
  computeStatisticalTop3V3,
} from "../top3.engine";

function emptyAnalytics() {
  return { top: [], meta: null };
}

function sameSlot(meta, targetYmd, targetHour) {
  const y = String(meta?.next?.ymd || "").trim();
  const h = toHourBucket(meta?.next?.hour || "");
  return isYMD(targetYmd) && targetHour && y === targetYmd && h === targetHour;
}

export function computeTop3Analytics({
  rangeDraws,
  baseDrawState,
  analyticsCacheRef,
  lotteryKeySafe,
  lookback,
  rangeInfo,
  todayDraws,
  sanitizeHistoricalDraws,
  targetYmd = "",
  targetHourBucket = "",
}) {
  const rawList = Array.isArray(rangeDraws) ? rangeDraws : [];
  const drawLast = baseDrawState;

  if (!rawList.length || !drawLast) {
    const empty = emptyAnalytics();
    analyticsCacheRef.current = { key: "", value: empty };
    return empty;
  }

  const lastG = Number(pickPrize1GrupoFromDraw(drawLast));
  const lastY = pickDrawYMD(drawLast) || "";
  const lastH = toHourBucket(pickDrawHour(drawLast)) || "";

  const forcedTargetY = isYMD(targetYmd) ? targetYmd : "";
  const forcedTargetH = toHourBucket(targetHourBucket);

  if (
    !Number.isFinite(lastG) ||
    lastG < 1 ||
    lastG > 25 ||
    !isYMD(lastY) ||
    !lastH ||
    !isYMD(forcedTargetY) ||
    !forcedTargetH
  ) {
    const empty = emptyAnalytics();
    analyticsCacheRef.current = { key: "", value: empty };
    return empty;
  }

  const historicalList = sanitizeHistoricalDraws({
    draws: rawList,
    lotteryKey: lotteryKeySafe,
    baseDraw: drawLast,
  });

  if (!historicalList.length) {
    const empty = emptyAnalytics();
    analyticsCacheRef.current = { key: "", value: empty };
    return empty;
  }

  const firstDraw = historicalList[0] || null;
  const lastDrawInRange = historicalList[historicalList.length - 1] || null;

  const todaySignature = (Array.isArray(todayDraws) ? todayDraws : [])
    .map((d) => `${pickDrawYMD(d) || ""}@${toHourBucket(pickDrawHour(d)) || ""}`)
    .filter(Boolean)
    .join(",");

  const cacheKey = [
    "V3",
    lotteryKeySafe,
    lookback,
    rangeInfo?.from || "",
    rangeInfo?.to || "",
    historicalList.length,
    rawList.length,
    todaySignature,
    firstDraw ? pickDrawYMD(firstDraw) || "" : "",
    firstDraw ? toHourBucket(pickDrawHour(firstDraw)) || "" : "",
    lastDrawInRange ? pickDrawYMD(lastDrawInRange) || "" : "",
    lastDrawInRange ? toHourBucket(pickDrawHour(lastDrawInRange)) || "" : "",
    lastY,
    lastH,
    lastG,
    forcedTargetY,
    forcedTargetH,
  ].join("|");

  if (analyticsCacheRef.current.key === cacheKey) {
    return analyticsCacheRef.current.value;
  }

  const computed =
    computeStatisticalTop3V3({
      lotteryKey: lotteryKeySafe,
      drawsRange: historicalList,
      drawLast,
      drawsToday: Array.isArray(todayDraws) ? todayDraws : [],
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
      topN: 3,
      targetYmdOverride: forcedTargetY,
      targetHourOverride: forcedTargetH,
    }) || emptyAnalytics();

  if (!sameSlot(computed?.meta, forcedTargetY, forcedTargetH)) {
    const empty = emptyAnalytics();
    analyticsCacheRef.current = { key: cacheKey, value: empty };
    return empty;
  }

  const top = Array.isArray(computed?.top)
    ? computed.top.filter((x) => {
        const g = Number(x?.grupo);
        return Number.isFinite(g) && g >= 1 && g <= 25;
      })
    : [];

  const value = {
    ...computed,
    top: top.slice(0, 3),
  };

  analyticsCacheRef.current = { key: cacheKey, value };
  return value;
}