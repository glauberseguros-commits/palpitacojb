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

function safeCacheRef(ref) {
  if (!ref || typeof ref !== "object") {
    return { current: { key: "", value: emptyAnalytics() } };
  }

  if (!ref.current || typeof ref.current !== "object") {
    ref.current = { key: "", value: emptyAnalytics() };
  }

  return ref;
}

function sameSlot(meta, targetYmd, targetHour) {
  const targetY = String(targetYmd || "").trim();
  const targetH = toHourBucket(targetHour || "");

  const y = String(meta?.next?.ymd || "").trim();
  const h = toHourBucket(meta?.next?.hour || "");

  return isYMD(targetY) && !!targetH && y === targetY && h === targetH;
}

function sanitizeTop3(top) {
  const out = [];
  const seen = new Set();

  for (const item of Array.isArray(top) ? top : []) {
    const g = Number(item?.grupo);

    if (!Number.isFinite(g) || g < 1 || g > 25) continue;
    if (seen.has(g)) continue;

    const confidence = Number(
      item?.displayConfidence ??
        item?.confidence ??
        item?.scoreProb ??
        item?.prob ??
        0
    );

    if (!Number.isFinite(confidence) || confidence < 0) continue;

    seen.add(g);
    out.push(item);

    if (out.length >= 3) break;
  }

  return out;
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
  const cacheRef = safeCacheRef(analyticsCacheRef);
  const lotteryKey = String(lotteryKeySafe || "").trim();

  const rawList = Array.isArray(rangeDraws) ? rangeDraws : [];
  const drawLast = baseDrawState || null;

  if (!rawList.length || !drawLast || !lotteryKey) {
    const empty = emptyAnalytics();
    cacheRef.current = { key: "", value: empty };
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
    cacheRef.current = { key: "", value: empty };
    return empty;
  }

  const historicalList =
    typeof sanitizeHistoricalDraws === "function"
      ? sanitizeHistoricalDraws({
          draws: rawList,
          lotteryKey,
          baseDraw: drawLast,
        })
      : rawList;

  const safeHistoricalList = Array.isArray(historicalList)
    ? historicalList
    : [];

  if (!safeHistoricalList.length) {
    const empty = emptyAnalytics();
    cacheRef.current = { key: "", value: empty };
    return empty;
  }

  const firstDraw = safeHistoricalList[0] || null;
  const lastDrawInRange = safeHistoricalList[safeHistoricalList.length - 1] || null;

  const todaySignature = (Array.isArray(todayDraws) ? todayDraws : [])
    .map((d) => `${pickDrawYMD(d) || ""}@${toHourBucket(pickDrawHour(d)) || ""}`)
    .filter(Boolean)
    .join(",");

  const cacheKey = [
    "V3",
    lotteryKey,
    lookback,
    rangeInfo?.from || "",
    rangeInfo?.to || "",
    safeHistoricalList.length,
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

  if (cacheRef.current?.key === cacheKey) {
    return cacheRef.current.value || emptyAnalytics();
  }

  const computed =
    computeStatisticalTop3V3({
      lotteryKey,
      drawsRange: safeHistoricalList,
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
    cacheRef.current = { key: cacheKey, value: empty };
    return empty;
  }

  const value = {
    ...computed,
    top: sanitizeTop3(computed?.top),
  };

  cacheRef.current = { key: cacheKey, value };
  return value;
}