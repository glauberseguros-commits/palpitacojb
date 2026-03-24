import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  computeConditionalNextTop3V2,
  buildTimelineTop3,
} from "./top3.engine";

import { lotteryLabel } from "./top3.selectors";

import {
  getKingResultsByDate,
  getKingResultsByRange,
  getKingBoundsByUf,
} from "../../services/kingResultsService";

import { getAnimalLabel, getImgFromGrupo } from "../../constants/bichoMap";

function publicBase() {
  const b = String(process.env.PUBLIC_URL || "").trim();
  return b && b !== "/" ? b : "";
}

function normalizeImgSrc(src) {
  const s = String(src || "").trim();
  if (!s) return "";

  if (/^https?:\/\//i.test(s)) return s;

  const base = publicBase();

  if (s.startsWith("/")) return `${base}${s}`;
  if (s.startsWith("public/")) return `${base}/${s.slice("public/".length)}`;
  if (s.startsWith("img/")) return `${base}/${s}`;

  return `${base}/${s}`;
}

function buildResultStyleImgVariants(grupo, size = 96) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g <= 0) return [];

  const seeds = [
    getImgFromGrupo?.(g, size),
    getImgFromGrupo?.(g),
  ]
    .map((x) => normalizeImgSrc(x))
    .filter(Boolean);

  const out = [];

  for (const seed of seeds) {
    const clean = String(seed).split("?")[0];
    if (!clean) continue;

    out.push(clean);

    if (/\.png$/i.test(clean)) {
      out.push(clean.replace(/\.png$/i, ".jpg"));
      out.push(clean.replace(/\.png$/i, ".jpeg"));
      out.push(clean.replace(/\.png$/i, ".webp"));
    } else if (/\.jpg$/i.test(clean)) {
      out.push(clean.replace(/\.jpg$/i, ".png"));
      out.push(clean.replace(/\.jpg$/i, ".jpeg"));
      out.push(clean.replace(/\.jpg$/i, ".webp"));
    } else if (/\.jpeg$/i.test(clean)) {
      out.push(clean.replace(/\.jpeg$/i, ".png"));
      out.push(clean.replace(/\.jpeg$/i, ".jpg"));
      out.push(clean.replace(/\.jpeg$/i, ".webp"));
    } else if (/\.webp$/i.test(clean)) {
      out.push(clean.replace(/\.webp$/i, ".png"));
      out.push(clean.replace(/\.webp$/i, ".jpg"));
      out.push(clean.replace(/\.webp$/i, ".jpeg"));
    }
  }

  return Array.from(new Set(out.filter(Boolean)));
}

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
    status: safeStr(entry?.status || "") || undefined,
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

// ===============================
// TOP3 LOG SYSTEM (VALIDAÇÃO REAL)
// ===============================
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

function registerPrediction({ targetKey, targetYmd, targetHour, picks, ranking = [] }) {
  const normalizedHour = normHour(targetHour);
  const normalizedKey = makeKey(targetYmd, normalizedHour);
  if (!normalizedKey || !Array.isArray(picks) || !picks.length) return;

  const log = getTop3Log();
  const normalizedPicks = picks
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 25);

  const idx = log.findIndex(
    (l) => String(l?.targetKey || "") === String(normalizedKey)
  );

  if (idx >= 0) {
    const prev = log[idx] || {};
    log[idx] = {
      ...prev,
      targetKey: normalizedKey,
      target: { ymd: targetYmd || "", hour: normalizedHour || "" },
      picks: normalizedPicks,
      ranking: Array.isArray(ranking) ? ranking : [],
      createdAt: prev.createdAt || Date.now(),
      result: prev.result ?? null,
      hit:
        prev.result != null
          ? normalizedPicks.includes(Number(prev.result))
          : prev.hit ?? null,
      status: normalizedPicks.length ? "predicted" : prev.status || "empty",
    };
  } else {
    log.push({
      targetKey: normalizedKey,
      target: { ymd: targetYmd || "", hour: normalizedHour || "" },
      picks: normalizedPicks,
      ranking: Array.isArray(ranking) ? ranking : [],
      result: null,
      hit: null,
      createdAt: Date.now(),
      status: "predicted",
    });
  }

  saveTop3Log(log);
}

function registerResult({ targetKey, resultGrupo }) {
  const log = getTop3Log();
  const normalizedTargetKey = String(targetKey || "").trim();
  const resultNum = Number(resultGrupo);

  if (!normalizedTargetKey || !Number.isFinite(resultNum)) return;

  const idx = log.findIndex(
    (l) => String(l?.targetKey || "") === String(normalizedTargetKey)
  );
  if (idx === -1) return;

  const picks = Array.isArray(log[idx]?.picks)
    ? log[idx].picks.map(Number)
    : [];

  const ranking = Array.isArray(log[idx]?.ranking)
    ? log[idx].ranking
    : [];

  const position =
    ranking.findIndex((x) => Number(x?.grupo) === resultNum) + 1;

  const score =
    position === 1 ? 100 :
    position === 2 ? 80 :
    position === 3 ? 60 :
    position > 0 && position <= 5 ? 40 :
    position > 0 && position <= 10 ? 20 : 0;

  log[idx] = {
    ...log[idx],
    result: resultNum,
    hit: picks.includes(resultNum),
    position: position > 0 ? position : null,
    score,
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
      log[idx] = {
        ...prev,
        targetKey,
        target: { ymd, hour },
        picks: Array.isArray(prev?.picks) ? prev.picks : [],
        result: prev?.result ?? null,
        hit: prev?.hit ?? null,
        createdAt: prev?.createdAt || Date.now(),
        status:
          Array.isArray(prev?.picks) && prev.picks.length
            ? prev.status || "predicted"
            : prev.status || "empty",
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

    const computed = computeConditionalNextTop3V2({
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
      ranking: (Array.isArray(computed?.top) ? computed.top : []),
    });
  }
}

export function useTop3Controller() {
  const DEFAULT_LOTTERY = "PT_RIO";

  const requestIdRef = useRef(0);
  const boundsCacheRef = useRef(new Map());
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
  const [todayDraws, setTodayDraws] = useState([]);
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

  const [baseDrawState, setBaseDrawState] = useState(null);

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
  }, []);

  const load = useCallback(async () => {
    const lKey = safeStr(lotteryKeySafe);
    if (!lKey || !isYMD(ymdSafe)) return;

    setLoading(true);
    setLoadingStage({ today: true, range: false });
    setError("");

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

      const effectiveYmd =
        lKey === "FEDERAL" && isYMD(maxDate) && !isFederalDrawDay(ymdSafe)
          ? maxDate
          : ymdSafe;

      const today =
        (await getKingResultsByDate({
          uf: ufResolved,
          date: effectiveYmd,
          readPolicy: "server",
        })) || [];

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

      const fallbackBaseSearch = async (targetY, targetH) => {
        const searchFrom =
          minDate ||
          (lKey === "FEDERAL"
            ? addDaysYMD(targetY, -180)
            : addDaysYMD(targetY, -60));

        const hist =
          (await getKingResultsByRange({
            uf: ufResolved,
            dateFrom: searchFrom,
            dateTo: targetY,
            mode: "detailed",
            readPolicy: "server",
          })) || [];

        return findLatestHistoricalBaseDraw({
          draws: hist,
          lotteryKey: lKey,
          targetYmd: targetY,
          targetHourBucket: targetH,
        });
      };

      if (todayLast) {
        baseDraw = todayLast;
        baseY = pickDrawYMD(todayLast) || effectiveYmd;
        baseH = toHourBucket(pickDrawHour(todayLast));
        baseGrupo = pickPrize1GrupoFromDraw(todayLast);
        baseAnimal = baseGrupo ? safeStr(getAnimalLabel(baseGrupo)) : "";

        const isFederalFallbackDay =
          lKey === "FEDERAL" &&
          effectiveYmd !== ymdSafe;

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
            resolvedPrev = await fallbackBaseSearch(baseY, baseH);
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

        const previousResolved = previousForFirstSlot?.draw
          ? previousForFirstSlot
          : await fallbackBaseSearch(effectiveYmd, firstHourToday);

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
            resolvedPrev = await fallbackBaseSearch(baseY, baseH);
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

      const hist =
        (await getKingResultsByRange({
          uf: ufResolved,
          dateFrom: rangeFrom,
          dateTo: rangeTo,
          mode: "detailed",
          readPolicy: "server",
        })) || [];

      if (requestIdRef.current !== currentRequestId) return;

      setRangeDraws(hist);
      backfillDayTop3({ draws: today, lotteryKey: lKey, rangeDraws: hist });
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
    const timelineYmd =
  lotteryKeySafe === "FEDERAL" &&
  isFederalNonDrawDay &&
  isYMD(lastInfo?.lastYmd)
    ? lastInfo.lastYmd
    : ymdSafe;

ensureDayTimeline({
  ymd: timelineYmd,
  lotteryKey: lotteryKeySafe,
});

    load();
  }, [load, ymdSafe, lotteryKeySafe, isFederalNonDrawDay, lastInfo?.lastYmd]);

  const analytics = useMemo(() => {
    const rawList = Array.isArray(rangeDraws) ? rangeDraws : [];
    const drawLast = baseDrawState;

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

    if (!historicalList.length) {
      const empty = { top: [], meta: null };
      analyticsCacheRef.current = { key: "", value: empty };
      return empty;
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

    analyticsCacheRef.current = { key: cacheKey, value: computed };
    return computed;
  }, [
    rangeDraws,
    rangeInfo?.from,
    rangeInfo?.to,
    lotteryKeySafe,
    lookback,
    baseDrawState,
    todayDraws,
  ]);

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

  const top3 = useMemo(() => {
    const arr = Array.isArray(analytics?.top) ? analytics.top : [];
    const milharesCache = new Map();

    return arr.map((x) => {
      const g = Number(x.grupo);
      const animal = safeStr(getAnimalLabel(g) || "");

      let out = milharesCache.get(g);

      if (!out) {
        out = build20(g);
        milharesCache.set(g, out);
      }

      const milharesCols = build4ColsFromEngineOut(out, 4, 5);
      const milhares20 = milharesCols.flatMap((c) => c.items).slice(0, 20);
const centenas = milhares20
  .map((m) => getCentena3(m))
  .filter((c) => c && /^\d{3}$/.test(c));

      const prob = Number(x.prob || 0);
      const probPct = prob * 100;

      const bgPrimary = normalizeImgSrc(
        safeStr(getImgFromGrupo?.(g, 512) || getImgFromGrupo?.(g) || "")
      );

      const iconVariants = buildResultStyleImgVariants(g, 96);

      return {
        ...x,
        animal,
        imgBg: [bgPrimary],
        imgIcon: iconVariants,
        prob,
        probPct,
        milharesCols,
        milhares20,
centenas,
      };
    });
  }, [analytics, build20]);

  const timelineTop3 = useMemo(() => {
    const day = Array.isArray(todayDraws) ? todayDraws : [];
    const range = Array.isArray(rangeDraws) ? rangeDraws : [];

    if (!isYMD(ymdSafe) || !range.length) return [];

    const timelineYmd =
  lotteryKeySafe === "FEDERAL" &&
  isFederalNonDrawDay &&
  isYMD(lastInfo?.lastYmd)
    ? lastInfo.lastYmd
    : ymdSafe;

const rawTimeline = buildTimelineTop3({
  ymd: timelineYmd,
      drawsToday: day,
      drawsRange: range,
      lotteryKey: lotteryKeySafe,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });

    return (Array.isArray(rawTimeline) ? rawTimeline : []).map((slot) => {
      const arr = Array.isArray(slot?.top3) ? slot.top3 : [];
      const milharesCache = new Map();

      const mappedTop3 = arr.map((x) => {
        const g = Number(x?.grupo);
        const animal = safeStr(getAnimalLabel(g) || "");

        let out = milharesCache.get(g);
        if (!out) {
          out = buildMilharesForGrupo({
            rangeDraws,
            analysisHourBucket: slot?.targetHour,
            schedule: getScheduleForLottery({
              lotteryKey: lotteryKeySafe,
              ymd: slot?.targetYmd,
              PT_RIO_SCHEDULE_NORMAL,
              PT_RIO_SCHEDULE_WED_SAT,
              FEDERAL_SCHEDULE,
            }),
            grupo2: g,
            count: 20,
          });
          milharesCache.set(g, out);
        }

        const milharesCols = build4ColsFromEngineOut(out, 4, 5);
        const milhares20 = milharesCols.flatMap((c) => c.items).slice(0, 20);
const centenas = milhares20
  .map((m) => getCentena3(m))
  .filter((c) => c && /^\d{3}$/.test(c));

        const prob = Number(x?.prob || 0);
        const probPct = prob * 100;

        const bgPrimary = normalizeImgSrc(
          safeStr(getImgFromGrupo?.(g, 512) || getImgFromGrupo?.(g) || "")
        );

        const iconVariants = buildResultStyleImgVariants(g, 96);

        return {
          ...x,
          animal,
          imgBg: [bgPrimary],
          imgIcon: iconVariants,
          prob,
          probPct,
          milharesCols,
          milhares20,
centenas,
        };
      });

      return {
        ...slot,
        top3: mappedTop3,
      };
    });
  }, [todayDraws, rangeDraws, lotteryKeySafe, ymdSafe, isFederalNonDrawDay, lastInfo?.lastYmd]);

  useEffect(() => {
    if (!analysisYmd || !analysisHourBucket) return;
    if (!Array.isArray(top3) || !top3.length) return;

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
















