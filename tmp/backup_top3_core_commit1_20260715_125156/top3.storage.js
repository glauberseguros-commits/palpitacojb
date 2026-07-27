import { safeStr, isYMD, toHourBucket } from "./top3.formatters";

import {
  pickDrawYMD,
  pickDrawHour,
  pickPrize1GrupoFromDraw,
  getScheduleForLottery,
} from "./top3.engine";

import {
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
} from "./top3.constants";

// ===============================
// TOP3 LOG SYSTEM (VALIDAÇÃO REAL)
// ===============================

function normHour(h) {
  return toHourBucket(h) || "";
}

function makeKey(ymd, hour) {
  const y = safeStr(ymd);
  const h = normHour(hour);
  return isYMD(y) && h ? `${y}_${h}` : "";
}

function parseTargetDate(ymd, hour) {
  if (!isYMD(ymd)) return null;

  const hourBucket = normHour(hour);
  const m = String(hourBucket || "").match(/^(\d{2})h$/);
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

function resolvePendingStatus(ymd, hour, picks) {
  const hasPicks = Array.isArray(picks) && picks.length > 0;
  if (!hasPicks) return "empty";
  return isFutureTarget(ymd, hour) ? "future" : "pending_result";
}

function normalizePicks(picks) {
  return Array.from(
    new Set(
      (Array.isArray(picks) ? picks : [])
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 25)
    )
  ).slice(0, 3);
}

function normalizeResult(resultValue) {
  const n = Number(resultValue);
  return Number.isFinite(n) && n >= 1 && n <= 25 ? n : null;
}

function normalizeLogEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  const ymd = safeStr(entry?.target?.ymd || "");
  const hour = normHour(entry?.target?.hour || "");
  const targetKey = makeKey(ymd, hour);

  if (!targetKey) return null;

  const picks = normalizePicks(entry?.picks);
  const result = normalizeResult(entry?.result);

  const hit =
    result != null && picks.length
      ? picks.includes(result)
      : typeof entry?.hit === "boolean"
        ? entry.hit
        : null;

  const status =
    result != null ? "validated" : resolvePendingStatus(ymd, hour, picks);

  return {
    ...entry,
    targetKey,
    target: { ymd, hour },
    picks,
    result,
    hit,
    createdAt: Number(entry?.createdAt) || Date.now(),
    validatedAt:
      result != null && Number(entry?.validatedAt)
        ? Number(entry.validatedAt)
        : undefined,
    status,
  };
}

function scoreLogEntry(entry) {
  if (!entry) return -1;

  let score = 0;
  if (Array.isArray(entry?.picks) && entry.picks.length) score += 20;
  if (entry?.result != null) score += 10;
  if (typeof entry?.hit === "boolean") score += 5;
  if (entry?.validatedAt) score += 2;
  if (entry?.createdAt) score += 1;

  return score;
}

function normalizeAndDedupeLog(log) {
  const list = Array.isArray(log) ? log : [];
  const byKey = new Map();

  for (const raw of list) {
    const entry = normalizeLogEntry(raw);
    if (!entry) continue;

    const prev = byKey.get(entry.targetKey);

    if (!prev || scoreLogEntry(entry) >= scoreLogEntry(prev)) {
      byKey.set(entry.targetKey, entry);
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const aKey = `${a?.target?.ymd || ""}_${a?.target?.hour || ""}`;
    const bKey = `${b?.target?.ymd || ""}_${b?.target?.hour || ""}`;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
}

function getTop3Log() {
  try {
    const raw = JSON.parse(localStorage.getItem("top3_log") || "[]");
    return normalizeAndDedupeLog(raw);
  } catch {
    return [];
  }
}

function saveTop3Log(log) {
  try {
    const normalized = normalizeAndDedupeLog(log).slice(-200);
    localStorage.setItem("top3_log", JSON.stringify(normalized));
  } catch {}
}

function registerPrediction({
  targetKey,
  targetYmd,
  targetHour,
  picks,
  snapshot = [],
  engineVersion = "",
}) {
  const ymd = safeStr(targetYmd);
  const hour = normHour(targetHour);
  const normalizedKey = targetKey || makeKey(ymd, hour);

  if (!isYMD(ymd) || !hour || !normalizedKey) return;

  const normalizedPicks = normalizePicks(picks);
  if (!normalizedPicks.length) return;

  const log = getTop3Log();

  const idx = log.findIndex(
    (l) => String(l?.targetKey || "") === String(normalizedKey)
  );

  const status = resolvePendingStatus(ymd, hour, normalizedPicks);

  if (idx >= 0) {
    const prev = log[idx] || {};

    if (prev.result != null || prev.status === "validated") return;

    log[idx] = {
      ...prev,
      targetKey: normalizedKey,
      target: { ymd, hour },
      picks: normalizedPicks,
      result: null,
      hit: null,
      snapshot:
        Array.isArray(prev?.snapshot) && prev.snapshot.length
          ? prev.snapshot
          : Array.isArray(snapshot)
            ? snapshot
            : [],
      engineVersion:
        safeStr(prev?.engineVersion || engineVersion || "V3_STATISTICAL"),
      createdAt: prev.createdAt || Date.now(),
      status,
    };
  } else {
    log.push({
      targetKey: normalizedKey,
      target: { ymd, hour },
      picks: normalizedPicks,
      result: null,
      hit: null,
      snapshot: Array.isArray(snapshot) ? snapshot : [],
      engineVersion: safeStr(engineVersion || "V3_STATISTICAL"),
      createdAt: Date.now(),
      status,
    });
  }

  saveTop3Log(log);
}

function registerResult({ targetKey, resultGrupo }) {
  const log = getTop3Log();
  const normalizedTargetKey = safeStr(targetKey);
  const result = normalizeResult(resultGrupo);

  if (!normalizedTargetKey || result == null) return;

  const idx = log.findIndex(
    (l) => String(l?.targetKey || "") === String(normalizedTargetKey)
  );

  if (idx === -1) return;

  const picks = normalizePicks(log[idx]?.picks);

  log[idx] = {
    ...log[idx],
    picks,
    result,
    hit: picks.includes(result),
    validatedAt: Date.now(),
    status: "validated",
  };

  saveTop3Log(log);
}

function findRealDrawByTarget({ targetYmd, targetHour, todayDraws, rangeDraws }) {
  const ymd = safeStr(targetYmd);
  const hour = normHour(targetHour);

  if (!isYMD(ymd) || !hour) return null;

  const sameTarget = (d) =>
    pickDrawYMD(d) === ymd && normHour(pickDrawHour(d)) === hour;

  const realToday =
    (Array.isArray(todayDraws) ? todayDraws : []).find(sameTarget) || null;

  const realRange =
    (Array.isArray(rangeDraws) ? rangeDraws : []).find(sameTarget) || null;

  return realToday || realRange || null;
}

function reconcilePendingTop3Log({ todayDraws, rangeDraws }) {
  const log = getTop3Log();
  if (!Array.isArray(log) || !log.length) return;

  let changed = false;

  const nextLog = log.map((entry) => {
    if (!entry || entry.result != null) return entry;

    const targetYmd = safeStr(entry?.target?.ymd || "");
    const targetHour = normHour(entry?.target?.hour || "");

    if (!isYMD(targetYmd) || !targetHour) return entry;
    if (isFutureTarget(targetYmd, targetHour)) return entry;

    const real = findRealDrawByTarget({
      targetYmd,
      targetHour,
      todayDraws,
      rangeDraws,
    });

    if (!real) return entry;

    const result = normalizeResult(pickPrize1GrupoFromDraw(real));
    if (result == null) return entry;

    const picks = normalizePicks(entry?.picks);

    changed = true;

    return {
      ...entry,
      picks,
      result,
      hit: picks.includes(result),
      validatedAt: Date.now(),
      status: "validated",
    };
  });

  if (changed) saveTop3Log(nextLog);
}

function ensureDayTimeline({ ymd, lotteryKey }) {
  if (!isYMD(ymd)) return;

  const schedule = getScheduleForLottery({
    lotteryKey,
    ymd,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });

  if (!Array.isArray(schedule) || !schedule.length) return;

  const log = getTop3Log();

  for (const h of schedule) {
    const hour = normHour(h);
    const targetKey = makeKey(ymd, hour);

    if (!targetKey) continue;

    const idx = log.findIndex(
      (l) => String(l?.targetKey || "") === String(targetKey)
    );

    if (idx >= 0) {
      const prev = log[idx] || {};
      const picks = normalizePicks(prev?.picks);
      const result = normalizeResult(prev?.result);
      const status =
        result != null ? "validated" : resolvePendingStatus(ymd, hour, picks);

      log[idx] = {
        ...prev,
        targetKey,
        target: { ymd, hour },
        picks,
        result,
        hit: result != null ? picks.includes(result) : prev?.hit ?? null,
        createdAt: prev?.createdAt || Date.now(),
        validatedAt: result != null ? prev?.validatedAt : undefined,
        status,
      };
    } else {
      log.push({
        targetKey,
        target: { ymd, hour },
        picks: [],
        result: null,
        hit: null,
        createdAt: Date.now(),
        status: "empty",
      });
    }
  }

  saveTop3Log(log);
}

export {
  getTop3Log,
  saveTop3Log,
  registerPrediction,
  registerResult,
  reconcilePendingTop3Log,
  ensureDayTimeline,
  isFutureTarget,
  makeKey,
};