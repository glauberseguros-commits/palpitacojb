import {
  safeStr,
  isYMD,
  toHourBucket,
} from "./top3.formatters";

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
  const m = String(h || "").match(/(\d{1,2})/);
  const hh = m ? String(m[1]).padStart(2, "0") : "";
  return hh ? `${hh}h` : "";
}

function makeKey(ymd, hour) {
  const y = String(ymd || "").trim();
  const h = normHour(hour);
  return y && h ? `${y}_${h}` : "";
}

function parseTargetDate(ymd, hour) {
  if (!isYMD(ymd)) return null;

  const hourBucket = toHourBucket(hour);
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

function normalizeLogEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  const ymd = safeStr(entry?.target?.ymd || "");
  const hour = normHour(entry?.target?.hour || "");
  const targetKey = makeKey(ymd, hour);

  if (!isYMD(ymd) || !hour || !targetKey) return null;

  const picks = Array.isArray(entry?.picks)
    ? entry.picks
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 25)
    : [];

  const resultNum = Number(entry?.result);
  const result =
    entry?.result != null &&
    Number.isFinite(resultNum) &&
    resultNum >= 1 &&
    resultNum <= 25
      ? resultNum
      : null;

  const normalizedStatus =
    result != null
      ? "validated"
      : resolvePendingStatus(ymd, hour, picks);

  return {
    ...entry,
    targetKey,
    target: { ymd, hour },
    picks,
    result,
    hit:
      typeof entry?.hit === "boolean"
        ? entry.hit
        : result != null && picks.length
          ? picks.includes(result)
          : null,
    createdAt: Number(entry?.createdAt) || Date.now(),
    validatedAt: Number(entry?.validatedAt) || undefined,
    status: safeStr(entry?.status || "") || normalizedStatus,
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

    const key = entry.targetKey;
    const prev = byKey.get(key);

    if (!prev) {
      byKey.set(key, entry);
      continue;
    }

    byKey.set(key, scoreLogEntry(entry) >= scoreLogEntry(prev) ? entry : prev);
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

function registerPrediction({ targetKey, targetYmd, targetHour, picks }) {
  const normalizedHour = normHour(targetHour);
  const normalizedKey = targetKey || makeKey(targetYmd, normalizedHour);

  if (!normalizedKey || !Array.isArray(picks) || !picks.length) return;

  const log = getTop3Log();
  const normalizedPicks = picks
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 25);

  const idx = log.findIndex(
    (l) => String(l?.targetKey || "") === String(normalizedKey)
  );

  const status = resolvePendingStatus(targetYmd, normalizedHour, normalizedPicks);

  if (idx >= 0) {
    const prev = log[idx] || {};

    if (prev.result != null || prev.status === "validated") return;

    log[idx] = {
      ...prev,
      targetKey: normalizedKey,
      target: { ymd: targetYmd || "", hour: normalizedHour || "" },
      picks: normalizedPicks,
      createdAt: prev.createdAt || Date.now(),
      result: prev.result ?? null,
      hit:
        prev.result != null
          ? normalizedPicks.includes(Number(prev.result))
          : null,
      status,
    };
  } else {
    log.push({
      targetKey: normalizedKey,
      target: { ymd: targetYmd || "", hour: normalizedHour || "" },
      picks: normalizedPicks,
      result: null,
      hit: null,
      createdAt: Date.now(),
      status,
    });
  }

  saveTop3Log(log);
}

function registerResult({ targetKey, resultGrupo }) {
  const log = getTop3Log();
  const normalizedTargetKey = String(targetKey || "").trim();

  if (!normalizedTargetKey || !Number.isFinite(Number(resultGrupo))) return;

  const idx = log.findIndex(
    (l) => String(l?.targetKey || "") === String(normalizedTargetKey)
  );

  if (idx === -1) return;

  const picks = Array.isArray(log[idx]?.picks)
    ? log[idx].picks.map(Number)
    : [];

  log[idx] = {
    ...log[idx],
    result: Number(resultGrupo),
    hit: picks.includes(Number(resultGrupo)),
    validatedAt: Date.now(),
    status: "validated",
  };

  saveTop3Log(log);
}

function findRealDrawByTarget({ targetYmd, targetHour, todayDraws, rangeDraws }) {
  const normalizedHour = normHour(targetHour);

  const sameTarget = (d) =>
    pickDrawYMD(d) === targetYmd &&
    normHour(toHourBucket(pickDrawHour(d))) === normalizedHour;

  const realToday =
    (Array.isArray(todayDraws) ? todayDraws : []).find(sameTarget) || null;

  const realRange =
    (Array.isArray(rangeDraws) ? rangeDraws : []).find(sameTarget) || null;

  return realToday || realRange || null;
}

function reconcilePendingTop3Log({ todayDraws, rangeDraws }) {
  const log = getTop3Log();
  if (!Array.isArray(log) || !log.length) return;

  for (const entry of log) {
    if (!entry || entry.result != null) continue;

    const targetYmd = safeStr(entry?.target?.ymd || "");
    const targetHour = normHour(entry?.target?.hour || "");

    if (!isYMD(targetYmd) || !targetHour) continue;
    if (isFutureTarget(targetYmd, targetHour)) continue;

    const real = findRealDrawByTarget({
      targetYmd,
      targetHour,
      todayDraws,
      rangeDraws,
    });

    if (!real) continue;

    const resultGrupo = pickPrize1GrupoFromDraw(real);
    if (!Number.isFinite(Number(resultGrupo))) continue;

    registerResult({
      targetKey: entry.targetKey,
      resultGrupo: Number(resultGrupo),
    });
  }
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
    const hour = normHour(toHourBucket(h));
    const targetKey = makeKey(ymd, hour);

    if (!targetKey) continue;

    const idx = log.findIndex(
      (l) => String(l?.targetKey || "") === String(targetKey)
    );

    if (idx >= 0) {
      const prev = log[idx] || {};
      const picks = Array.isArray(prev?.picks) ? prev.picks : [];
      const status =
        prev?.result != null
          ? "validated"
          : resolvePendingStatus(ymd, hour, picks);

      log[idx] = {
        ...prev,
        targetKey,
        target: { ymd, hour },
        picks,
        result: prev?.result ?? null,
        hit: prev?.hit ?? null,
        createdAt: prev?.createdAt || Date.now(),
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
