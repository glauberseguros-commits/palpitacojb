// src/pages/Top3/top3.engine.js
import {
  safeStr,
  isYMD,
  normalizeToYMD,
  addDaysYMD,
  normalizeHourLike,
  toHourBucket,
  hourToInt,
  getDowKey,
  pickPrizeMilhar4,
  getDezena2,
  getCentena3,
  milharCompareAsc,
  wrapToDezena2,
} from "./top3.formatters";

import { scoreRanking } from "./modules/scoreEngine/scoreEngineV2";

import {
  TOP3_NEXTDRAW_SCAN_MAX_STEPS,
  TOP3_NEXTDRAW_SCAN_MAX_DAYS,
  TOP3_GROUPS_K,
  TOP3_SMOOTH_ALPHA,
  TOP3_SCENE_WEIGHT,
  TOP3_SCENE_SAMPLE_TARGET,
  TOP3_SCENE_BLEND_SCENE,
  TOP3_SCENE_BLEND_UNIFORM,
  PT_RIO_SCHEDULE_SUNDAY,
  LOOK_SCHEDULE,
  NACIONAL_SCHEDULE,
} from "./top3.constants";

function findPreviousValidDraw(draws, currentYmd, currentHour) {
  const list = Array.isArray(draws) ? draws : [];
  const targetY = safeStr(currentYmd);
  const targetH = toHourBucket(currentHour);

  if (!isYMD(targetY) || !targetH) return null;

  const targetTs = ymdHourToTs(targetY, targetH);

  return list
    .filter((draw) => Array.isArray(draw?.prizes) && draw.prizes.length > 0)
    .map((draw) => {
      const y = pickDrawYMD(draw);
      const h = toHourBucket(pickDrawHour(draw));
      return { draw, ts: ymdHourToTs(y, h) };
    })
    .filter((x) => Number.isFinite(x.ts) && x.ts < targetTs)
    .sort((a, b) => b.ts - a.ts)[0]?.draw || null;
}

/* =========================
   Draw helpers (robustos)
========================= */

function grupoFromDezena2(dezena2) {
  const s = safeStr(dezena2);
  if (!/^\d{2}$/.test(s)) return null;

  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 99) return null;
  if (n === 0) return 25;

  const g = Math.ceil(n / 4);
  return g >= 1 && g <= 25 ? g : null;
}

function drawQualityScore(draw) {
  const prizes = Array.isArray(draw?.prizes) ? draw.prizes : [];
  const y = pickDrawYMD(draw);
  const h = toHourBucket(pickDrawHour(draw));

  let score = 0;
  if (isYMD(y)) score += 20;
  if (h) score += 20;
  score += Math.min(10, prizes.length) * 10;

  const hasP1 = prizes.some((p) => guessPrizePos(p) === 1);
  if (hasP1) score += 15;

  return score;
}

export function guessPrizePos(p) {
  const pos = Number.isFinite(Number(p?.position))
    ? Number(p.position)
    : Number.isFinite(Number(p?.posicao))
      ? Number(p.posicao)
      : Number.isFinite(Number(p?.pos))
        ? Number(p.pos)
        : Number.isFinite(Number(p?.colocacao))
          ? Number(p.colocacao)
          : null;

  return pos;
}

export function guessPrizeGrupo(p) {
  const directCandidates = [
    p?.grupo2,
    p?.group2,
    p?.grupo,
    p?.group,
    p?.animal_grupo,
    p?.grupo_animal,
    p?.grupoAnimal,
    p?.g,
  ];

  for (const v of directCandidates) {
    const g = Number(v);
    if (Number.isFinite(g) && g >= 1 && g <= 25) {
      return g;
    }
  }

  const milhar4 = pickPrizeMilhar4(p);

  if (milhar4) {
    const dezena2 = getDezena2(milhar4);
    const derived = grupoFromDezena2(dezena2);

    if (Number.isFinite(derived)) return derived;
  }

  return null;
}

export function pickDrawHour(draw) {
  return normalizeHourLike(
    draw?.close_hour || draw?.closeHour || draw?.hour || draw?.hora || ""
  );
}

export function pickDrawYMD(draw) {
  const y =
    draw?.ymd ||
    normalizeToYMD(draw?.date) ||
    normalizeToYMD(draw?.data) ||
    normalizeToYMD(draw?.dt) ||
    normalizeToYMD(draw?.draw_date) ||
    normalizeToYMD(draw?.drawDate) ||
    normalizeToYMD(draw?.close_date) ||
    normalizeToYMD(draw?.closeDate) ||
    null;

  return y;
}

export function pickPrize1GrupoFromDraw(draw) {
  const prizes = Array.isArray(draw?.prizes) ? draw.prizes : [];
  if (prizes.length) {
    const p1 = prizes.find((p) => guessPrizePos(p) === 1) || null;
    if (p1) {
      const g = guessPrizeGrupo(p1);
      return Number.isFinite(Number(g)) ? Number(g) : null;
    }
  }

  const candidates = [
    draw?.grupo1,
    draw?.group1,
    draw?.primeiro_grupo,
    draw?.first_grupo,
    draw?.prize1_grupo,
    draw?.prize1Grupo,
    draw?.p1_grupo2,
    draw?.p1Grupo2,
    draw?.g1,
    draw?.grupo_1,
    draw?.grupoPrimeiro,
  ];

  for (const v of candidates) {
    if (Number.isFinite(Number(v))) return Number(v);
  }

  return null;
}

/* =========================
   Helpers internos
========================= */

function safeInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getDayOfMonth(ymd) {
  if (!isYMD(ymd)) return NaN;
  return Number(String(ymd).slice(8, 10));
}

function ymdHourToTs(ymd, hourBucket) {
  const y = safeStr(ymd);
  const h = toHourBucket(hourBucket);

  if (!isYMD(y) || !h) return Number.POSITIVE_INFINITY;

  const mins = hourToInt(h);
  if (!Number.isFinite(mins) || mins < 0) {
    return Number.POSITIVE_INFINITY;
  }

  const [Y, M, D] = y.split("-").map((x) => Number(x));
  const base = Date.UTC(Y, M - 1, D);

  return base + mins * 60 * 1000;
}

/* =========================
   Schedules
========================= */

const FEDERAL_SUNDAY_START_YMD = "2026-07-19";
const PT_RIO_SUNDAY_REDUCED_START_YMD = "2026-07-18";
const FEDERAL_20_REMOVES_PT_RIO_18_START_YMD = "2025-11-03";

/**
 * Calendário Federal com preservação histórica.
 *
 * Até 18/07/2026:
 * - quarta-feira às 20h;
 * - sábado às 20h.
 *
 * A partir de 19/07/2026:
 * - quarta-feira às 20h;
 * - domingo às 11h;
 * - sábado deixa de ter sorteio Federal.
 */
export function isFederalDrawDay(ymd) {
  const y = safeStr(ymd);
  if (!y) return false;

  const dow = Number(getDowKey(y));

  if (y >= FEDERAL_SUNDAY_START_YMD) {
    return dow === 0 || dow === 3;
  }

  return dow === 3 || dow === 6;
}

function getFederalScheduleForYmd(ymd, FEDERAL_SCHEDULE) {
  const y = safeStr(ymd);

  if (!y || !isFederalDrawDay(y)) {
    return [];
  }

  const dow = Number(getDowKey(y));

  if (y >= FEDERAL_SUNDAY_START_YMD && dow === 0) {
    return ["11:00"];
  }

  const historical = Array.isArray(FEDERAL_SCHEDULE)
    ? FEDERAL_SCHEDULE
    : [];

  const normalized = historical
    .map(toHourBucket)
    .filter(Boolean);

  if (normalized.includes("20:00")) {
    return ["20:00"];
  }

  return normalized.length
    ? normalized
    : ["20:00"];
}

/**
 * Determina apenas os slots esperados.
 * Nenhum resultado histórico é removido.
 */
export function getPtRioScheduleForYmd(
  ymd,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT
) {
  const y = safeStr(ymd);
  const dow = Number(getDowKey(y));

  if (dow === 0) {
    const sundaySchedule = Array.isArray(PT_RIO_SCHEDULE_SUNDAY)
      ? [...PT_RIO_SCHEDULE_SUNDAY]
      : [];

    if (y >= PT_RIO_SUNDAY_REDUCED_START_YMD) {
      return sundaySchedule.filter((hour) => {
        const h = normalizeHourLike(hour);

        return h === "14:00" || h === "16:00";
      });
    }

    return sundaySchedule;
  }

  if (dow === 6) {
    const saturdaySchedule = Array.isArray(
      PT_RIO_SCHEDULE_WED_SAT
    )
      ? [...PT_RIO_SCHEDULE_WED_SAT]
      : [];

    if (y >= "2026-07-18") {
      const transitionedSchedule = saturdaySchedule
        .map(normalizeHourLike)
        .filter(Boolean)
        .filter((hour) => hour !== "18:00");

      if (!transitionedSchedule.includes("19:00")) {
        transitionedSchedule.push("19:00");
      }

      return transitionedSchedule
        .filter(
          (hour, index, schedule) =>
            schedule.indexOf(hour) === index
        )
        .sort(
          (hourA, hourB) =>
            hourToInt(hourA) - hourToInt(hourB)
        );
    }

    return saturdaySchedule;
  }

  if (dow === 3) {
    return Array.isArray(PT_RIO_SCHEDULE_WED_SAT)
      ? [...PT_RIO_SCHEDULE_WED_SAT]
      : [];
  }

  return Array.isArray(PT_RIO_SCHEDULE_NORMAL)
    ? [...PT_RIO_SCHEDULE_NORMAL]
    : [];
}

export function getScheduleForLottery({
  lotteryKey,
  ymd,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
}) {
  const key = safeStr(lotteryKey).toUpperCase();

  if (key === "FEDERAL") {
    return getFederalScheduleForYmd(
      ymd,
      FEDERAL_SCHEDULE
    );
  }

  if (key === "LOOK") {
    return [...LOOK_SCHEDULE];
  }

  if (key === "NACIONAL") {
    return [...NACIONAL_SCHEDULE];
  }

  return getPtRioScheduleForYmd(
    ymd,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT
  );
}

export function scheduleSet(schedule) {
  return new Set((Array.isArray(schedule) ? schedule : []).map(toHourBucket));
}

export function isHourInSchedule(schedule, hhmm) {
  const s = scheduleSet(schedule);
  return s.has(toHourBucket(hhmm));
}

export function findLastDrawInList(draws, schedule) {
  const list = Array.isArray(draws) ? draws : [];
  if (!list.length) return null;

  const sorted = [...list]
    .filter((d) => isHourInSchedule(schedule, pickDrawHour(d)))
    .sort((a, b) => {
      const ta = ymdHourToTs(pickDrawYMD(a), toHourBucket(pickDrawHour(a)));
      const tb = ymdHourToTs(pickDrawYMD(b), toHourBucket(pickDrawHour(b)));
      return tb - ta;
    });

  return sorted[0] || null;
}

export function findPrevDrawBeforeTargetInSameDay(
  draws,
  targetHourBucket,
  schedule
) {
  const list = Array.isArray(draws) ? draws : [];
  if (!list.length) return null;

  const t = hourToInt(targetHourBucket);
  if (t < 0) return null;

  const candidates = list
    .filter((d) => isHourInSchedule(schedule, pickDrawHour(d)))
    .map((d) => ({ d, h: hourToInt(toHourBucket(pickDrawHour(d))) }))
    .filter((x) => x.h >= 0 && x.h < t)
    .sort((a, b) => b.h - a.h);

  return candidates.length ? candidates[0].d : null;
}

export async function getPreviousDrawRobust({
  getKingResultsByDate,
  lotteryKey,
  ymdTarget,
  targetHourBucket,
  todayDraws,
  schedule,
  maxBackDays = 10,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
}) {
  const prevSameDay = findPrevDrawBeforeTargetInSameDay(
    todayDraws,
    targetHourBucket,
    schedule
  );

  if (prevSameDay) {
    return {
      draw: prevSameDay,
      ymd: pickDrawYMD(prevSameDay) || ymdTarget,
      hour: toHourBucket(pickDrawHour(prevSameDay)),
      source: "same_day",
    };
  }

  for (let i = 1; i <= maxBackDays; i += 1) {
    const day = addDaysYMD(ymdTarget, -i);

    const daySchedule = getScheduleForLottery({
      lotteryKey,
      ymd: day,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });

    if (
      safeStr(lotteryKey).toUpperCase() === "FEDERAL" &&
      !daySchedule.length
    ) {
      continue;
    }

    const out = await getKingResultsByDate({
      uf: lotteryKey,
      date: day,
      closeHour: null,
      positions: null,
      readPolicy: "server",
    });

    const last = findLastDrawInList(out, daySchedule);
    if (last) {
      return {
        draw: last,
        ymd: pickDrawYMD(last) || day,
        hour: toHourBucket(pickDrawHour(last)),
        source: "prev_day",
      };
    }
  }

  return { draw: null, ymd: "", hour: "", source: "none" };
}

/* =========================
   Próximo sorteio (slot válido)
========================= */

export function getNextSlotForLottery({
  lotteryKey,
  ymd,
  hourBucket,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  maxForwardDays = 21,
}) {
  const key = safeStr(lotteryKey).toUpperCase();
  const y0 = safeStr(ymd);
  const h0 = toHourBucket(hourBucket);

  if (!isYMD(y0) || !safeStr(h0)) return { ymd: "", hour: "" };

  if (key === "FEDERAL") {
    for (let i = 1; i <= maxForwardDays; i += 1) {
      const day = addDaysYMD(y0, i);
      const sch = getScheduleForLottery({
        lotteryKey: key,
        ymd: day,
        PT_RIO_SCHEDULE_NORMAL,
        PT_RIO_SCHEDULE_WED_SAT,
        FEDERAL_SCHEDULE,
      });
      if (Array.isArray(sch) && sch.length) {
        return { ymd: day, hour: toHourBucket(sch[0]) };
      }
    }
    return { ymd: "", hour: "" };
  }

  const sch0 = getScheduleForLottery({
    lotteryKey: key,
    ymd: y0,
    hourBucket: h0,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });

  const idx = (Array.isArray(sch0) ? sch0 : []).findIndex(
    (x) => toHourBucket(x) === h0
  );

  if (idx >= 0 && idx < sch0.length - 1) {
    return { ymd: y0, hour: toHourBucket(sch0[idx + 1]) };
  }

  for (let i = 1; i <= maxForwardDays; i += 1) {
    const day = addDaysYMD(y0, i);
    const sch = getScheduleForLottery({
      lotteryKey: key,
      ymd: day,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });
    if (Array.isArray(sch) && sch.length) {
      return { ymd: day, hour: toHourBucket(sch[0]) };
    }
  }

  return { ymd: "", hour: "" };
}

/* =========================
   Próximo DRAW REAL (não perde amostra)
========================= */

export function findNextExistingDrawFromSlot({
  lotteryKey,
  startSlot,
  drawsIndex,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  maxSteps = TOP3_NEXTDRAW_SCAN_MAX_STEPS,
  maxDays = TOP3_NEXTDRAW_SCAN_MAX_DAYS,
}) {
  const key = safeStr(lotteryKey).toUpperCase();
  const y0 = safeStr(startSlot?.ymd);
  const h0 = toHourBucket(startSlot?.hour);

  if (!isYMD(y0) || !h0 || !(drawsIndex instanceof Map)) {
    return { slot: null, draw: null };
  }

  if (key === "FEDERAL") {
    let curY = y0;
    let steps = 0;
    let daysWalked = 0;

    while (steps < maxSteps && daysWalked <= maxDays) {
      const sch = getScheduleForLottery({
        lotteryKey: key,
        ymd: curY,
        PT_RIO_SCHEDULE_NORMAL,
        PT_RIO_SCHEDULE_WED_SAT,
        FEDERAL_SCHEDULE,
      });

      if (Array.isArray(sch) && sch.length) {
        const hh = toHourBucket(sch[0]);
        const d = drawsIndex.get(`${curY}|${hh}`) || null;
        if (d) return { slot: { ymd: curY, hour: hh }, draw: d };
      }

      curY = addDaysYMD(curY, 1);
      daysWalked += 1;
      steps += 1;
    }

    return { slot: null, draw: null };
  }

  let curY = y0;
  let curH = h0;
  let steps = 0;
  let daysWalked = 0;

  while (steps < maxSteps && daysWalked <= maxDays) {
    const drawKey = `${curY}|${toHourBucket(curH)}`;
    let d = drawsIndex.get(drawKey) || null;

    if (!d) {
      const curTs = ymdHourToTs(curY, curH);
      const curYLocked = curY;
      d = Array.from(drawsIndex.entries())
        .map(([k, v]) => {
          const [ky, kh] = String(k).split("|");
          return { ymd: ky, hour: kh, draw: v, ts: ymdHourToTs(ky, kh) };
        })
        .filter((x) => x.ymd === curYLocked)
        .filter((x) => Number.isFinite(x.ts) && x.ts >= curTs)
        .sort((a, b) => a.ts - b.ts)[0]?.draw || null;
    }

    if (d) return { slot: { ymd: curY, hour: toHourBucket(curH) }, draw: d };

    const sch = getScheduleForLottery({
      lotteryKey: key,
      ymd: curY,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });

    const arr = Array.isArray(sch) ? sch.map(toHourBucket) : [];
    const curBucket = toHourBucket(curH);
    const idx = arr.indexOf(curBucket);

    if (idx >= 0 && idx < arr.length - 1) {
      curH = arr[idx + 1];
    } else {
      curY = addDaysYMD(curY, 1);
      daysWalked += 1;

      const sch2 = getScheduleForLottery({
        lotteryKey: key,
        ymd: curY,
        PT_RIO_SCHEDULE_NORMAL,
        PT_RIO_SCHEDULE_WED_SAT,
        FEDERAL_SCHEDULE,
      });

      const arr2 = Array.isArray(sch2) ? sch2.map(toHourBucket) : [];
      if (!arr2.length) break;
      curH = arr2[0];
    }

    steps += 1;
  }

  return { slot: null, draw: null };
}

/* =========================
   Index + utilitários de grupo
========================= */

export function indexDrawsByYmdHour(draws) {
  const map = new Map();
  const list = Array.isArray(draws) ? draws : [];

  for (const d of list) {
    const y = pickDrawYMD(d);
    const rawH = pickDrawHour(d);
    const h = toHourBucket(rawH);

    if (!isYMD(y) || !h) continue;

    const drawKey = `${y}|${h}`;
    const prev = map.get(drawKey);

    if (!prev) {
      map.set(drawKey, d);
      continue;
    }

    if (drawQualityScore(d) >= drawQualityScore(prev)) {
      map.set(drawKey, d);
    }
  }

  return map;
}

export function computeLastSeenByGrupo(draws) {
  const last = new Map();
  const list = Array.isArray(draws) ? draws : [];

  for (const d of list) {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    if (!isYMD(y) || !h) continue;

    const ts = ymdHourToTs(y, h);
    const ps = Array.isArray(d?.prizes) ? d.prizes : [];

    for (const p of ps) {
      const pos = guessPrizePos(p);
      if (!Number.isFinite(Number(pos)) || Number(pos) < 1 || Number(pos) > 5) {
        continue;
      }

      const g = guessPrizeGrupo(p);
      if (!Number.isFinite(Number(g)) || Number(g) <= 0) continue;

      const gg = Number(g);
      const prev = last.get(gg);

      if (!Number.isFinite(prev) || ts > prev) {
        last.set(gg, ts);
      }
    }
  }

  return last;
}

export function countAparicoesByGrupoInDraw(draw) {
  const counts = new Map();
  const ps = Array.isArray(draw?.prizes) ? draw.prizes : [];
  for (const p of ps) {
    const pos = guessPrizePos(p);
    if (!Number.isFinite(Number(pos)) || Number(pos) < 1 || Number(pos) > 5) {
      continue;
    }
    const g = guessPrizeGrupo(p);
    if (!Number.isFinite(Number(g)) || Number(g) <= 0) continue;
    const gg = Number(g);
    counts.set(gg, (counts.get(gg) || 0) + 1);
  }
  return counts;
}

function getFirstGrupoFromDraw(draw) {
  const ps = Array.isArray(draw?.prizes) ? draw.prizes : [];
  const p1 = ps.find((p) => guessPrizePos(p) === 1) || null;
  if (p1) {
    const g = guessPrizeGrupo(p1);
    return Number.isFinite(Number(g)) ? Number(g) : null;
  }
  return pickPrize1GrupoFromDraw(draw);
}

function getPrizeGroupsByPosition(draw, maxPosition = 3) {
  const limit = Math.max(1, Number(maxPosition || 3));
  const prizes = Array.isArray(draw?.prizes) ? draw.prizes : [];

  return Array.from({ length: limit }, (_, index) => {
    const position = index + 1;

    const prize =
      prizes.find(
        (item) => Number(guessPrizePos(item)) === position
      ) || null;

    if (!prize) return null;

    const grupo = Number(guessPrizeGrupo(prize));

    return Number.isFinite(grupo) &&
      grupo >= 1 &&
      grupo <= TOP3_GROUPS_K
      ? grupo
      : null;
  });
}


function getAllPrizePresenceGroups(draw) {
  const out = [];
  const ps = Array.isArray(draw?.prizes) ? draw.prizes : [];
  for (const p of ps) {
    const pos = guessPrizePos(p);
    if (!Number.isFinite(Number(pos)) || Number(pos) < 1 || Number(pos) > 5) {
      continue;
    }
    const g = guessPrizeGrupo(p);
    if (!Number.isFinite(Number(g)) || Number(g) <= 0) continue;
    out.push({ pos: Number(pos), grupo: Number(g) });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

function buildFreqAndFirstMaps(nextDraw) {
  const freq = new Map();
  const firstMap = new Map();
  const items = getAllPrizePresenceGroups(nextDraw);

  for (const it of items) {
    freq.set(it.grupo, (freq.get(it.grupo) || 0) + 1);
    if (it.pos === 1) {
      firstMap.set(it.grupo, (firstMap.get(it.grupo) || 0) + 1);
    }
  }

  return { freq, firstMap };
}

function mergeMapsAdd(target, source) {
  for (const [k, v] of source.entries()) {
    target.set(Number(k), Number(target.get(Number(k)) || 0) + Number(v || 0));
  }
}

function probFromFreq(freq, samples, groupsK = TOP3_GROUPS_K) {
  const k = safeInt(groupsK, 25);
  const denom = Math.max(1, Number(samples || 0) * 5);
  const out = new Map();

  for (let g = 1; g <= k; g += 1) {
    const n = Number(freq.get(g) || 0);
    out.set(g, n / denom);
  }

  return out;
}

function computeStructuralBaseDistribution(
  draws,
  lotteryKey,
  targetHour,
  targetDow,
  groupsK = TOP3_GROUPS_K
) {
  const list = Array.isArray(draws) ? draws : [];
  const key = safeStr(lotteryKey).toUpperCase();
  const target = toHourBucket(targetHour);
  const k = safeInt(groupsK, 25);

  const freq = new Map();
  let totalSamples = 0;

  for (const d of list) {
    const h = toHourBucket(pickDrawHour(d));
    const y = pickDrawYMD(d);
    if (!h || !y) continue;

    if (key === "FEDERAL") {
      if (!isFederalDrawDay(y)) continue;
      if (Number(getDowKey(y)) !== Number(targetDow)) continue;
    } else {
      if (h !== target) continue;
    }

    const items = getAllPrizePresenceGroups(d);
    if (!items.length) continue;

    totalSamples += 1;

    for (const it of items) {
      const g = Number(it.grupo);
      if (!Number.isFinite(g) || g < 1 || g > k) continue;
      freq.set(g, Number(freq.get(g) || 0) + 1);
    }
  }

  const out = new Map();
  const denom = Math.max(1, totalSamples * 5);

  for (let g = 1; g <= k; g += 1) {
    const n = Number(freq.get(g) || 0);
    out.set(g, n / denom);
  }

  return { scoreProb: out, totalSamples };
}

/* =========================
   Recência / pressão estrutural
========================= */

function sortDrawsAsc(draws) {
  const list = Array.isArray(draws) ? draws : [];
  return [...list].sort((a, b) => {
    const ya = pickDrawYMD(a);
    const yb = pickDrawYMD(b);
    const ha = toHourBucket(pickDrawHour(a));
    const hb = toHourBucket(pickDrawHour(b));
    const tsa = ymdHourToTs(ya, ha);
    const tsb = ymdHourToTs(yb, hb);
    return tsa - tsb;
  });
}

function getRecentDrawsBefore(draws, drawLast, count = 6) {
  const list = sortDrawsAsc(draws);
  const lastY = pickDrawYMD(drawLast);
  const lastH = toHourBucket(pickDrawHour(drawLast));
  const lastTs = ymdHourToTs(lastY, lastH);

  const prev = list.filter((d) => {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    const ts = ymdHourToTs(y, h);
    return Number.isFinite(ts) && ts < lastTs;
  });

  return prev.slice(-Math.max(1, Number(count || 6)));
}

function computeRecentPressureMetrics(recentDraws, groupsK = TOP3_GROUPS_K) {
  const k = safeInt(groupsK, 25);
  const out = new Map();

  for (let g = 1; g <= k; g += 1) {
    out.set(g, {
      recentPrizePresence: 0,
      recentIndirect: 0,
      recentFirst: 0,
      recentLast1First: 0,
      recentLast2PrizePresence: 0,
    });
  }

  const list = Array.isArray(recentDraws) ? recentDraws : [];
  const last1 = list.length ? [list[list.length - 1]] : [];
  const last2 = list.slice(-2);

  for (const d of list) {
    const items = getAllPrizePresenceGroups(d);

    for (const it of items) {
      const g = Number(it.grupo);
      const pos = Number(it.pos);
      if (!Number.isFinite(g) || g < 1 || g > k) continue;

      const row = out.get(g);
      row.recentPrizePresence += 1;

      if (pos >= 2 && pos <= 4) row.recentIndirect += 1;
      if (pos === 1) row.recentFirst += 1;
    }
  }

  for (const d of last1) {
    const items = getAllPrizePresenceGroups(d);
    for (const it of items) {
      const g = Number(it.grupo);
      const pos = Number(it.pos);
      if (!Number.isFinite(g) || g < 1 || g > k) continue;
      if (pos === 1) {
        out.get(g).recentLast1First += 1;
      }
    }
  }

  for (const d of last2) {
    const items = getAllPrizePresenceGroups(d);
    const seen = new Set();
    for (const it of items) {
      const g = Number(it.grupo);
      if (!Number.isFinite(g) || g < 1 || g > k) continue;
      if (seen.has(g)) continue;
      seen.add(g);
      out.get(g).recentLast2PrizePresence += 1;
    }
  }

  return out;
}

function normalizeMetric(value, maxValue) {
  const v = Number(value || 0);
  const m = Number(maxValue || 0);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return 0;
  return Math.max(0, Math.min(1, v / m));
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function buildZeroProbMap(groupsK = TOP3_GROUPS_K) {
  const k = safeInt(groupsK, 25);
  return new Map(Array.from({ length: k }, (_, i) => [i + 1, 0]));
}

function confidenceFromSamples(samples, fullConfidenceAt = 8) {
  const n = Number(samples || 0);
  const lim = Math.max(1, Number(fullConfidenceAt || 8));
  return clamp01(n / lim);
}

/* =========================
   Motor condicional puro por camadas
========================= */

const LAYER_MIN_SAMPLES = {
  DOM_DOW_PREVH_PREVG_TO_TARGET: 3,
  DOW_PREVH_PREVG_TO_TARGET: 5,
  PREVH_PREVG_TO_TARGET: 8,
  DOM_TARGET: 8,
  DOW_TARGET: 12,
  TARGET_ONLY: 20,

  FED_DOW_PREVG: 3,
  FED_PREVG: 4,
  FED_DOW_ONLY: 6,
  FED_ONLY: 10,
};

function buildLayerConfigs({
  lotteryKey,
  targetDayOfMonth,
  targetDow,
  prevHour,
  prevGrupo,
  targetHour,
}) {
  const key = safeStr(lotteryKey).toUpperCase();

  if (key === "FEDERAL") {
    return [
      {
        key: "FED_DOW_PREVG",
        label: "Federal: dia da semana + grupo anterior",
        minSamples: LAYER_MIN_SAMPLES.FED_DOW_PREVG,
        match: (ctx) =>
          ctx.targetDow === targetDow &&
          ctx.prevGrupo === prevGrupo,
      },
      {
        key: "FED_PREVG",
        label: "Federal: grupo anterior",
        minSamples: LAYER_MIN_SAMPLES.FED_PREVG,
        match: (ctx) => ctx.prevGrupo === prevGrupo,
      },
      {
        key: "FED_DOW_ONLY",
        label: "Federal: dia da semana",
        minSamples: LAYER_MIN_SAMPLES.FED_DOW_ONLY,
        match: (ctx) => ctx.targetDow === targetDow,
      },
      {
        key: "FED_ONLY",
        label: "Federal: histórico geral",
        minSamples: LAYER_MIN_SAMPLES.FED_ONLY,
        match: () => true,
      },
    ];
  }

  return [
    {
      key: "DOM_DOW_PREVH_PREVG_TO_TARGET",
      label: "dia do mês + dia da semana + hora anterior + grupo anterior -> alvo",
      minSamples: LAYER_MIN_SAMPLES.DOM_DOW_PREVH_PREVG_TO_TARGET,
      match: (ctx) =>
        ctx.targetDayOfMonth === targetDayOfMonth &&
        ctx.targetDow === targetDow &&
        ctx.prevHour === prevHour &&
        ctx.prevGrupo === prevGrupo &&
        ctx.targetHour === targetHour,
    },
    {
      key: "DOW_PREVH_PREVG_TO_TARGET",
      label: "dia da semana + hora anterior + grupo anterior -> alvo",
      minSamples: LAYER_MIN_SAMPLES.DOW_PREVH_PREVG_TO_TARGET,
      match: (ctx) =>
        ctx.targetDow === targetDow &&
        ctx.prevHour === prevHour &&
        ctx.prevGrupo === prevGrupo &&
        ctx.targetHour === targetHour,
    },
    {
      key: "PREVH_PREVG_TO_TARGET",
      label: "hora anterior + grupo anterior -> alvo",
      minSamples: LAYER_MIN_SAMPLES.PREVH_PREVG_TO_TARGET,
      match: (ctx) =>
        ctx.prevHour === prevHour &&
        ctx.prevGrupo === prevGrupo &&
        ctx.targetHour === targetHour,
    },
    {
      key: "DOM_TARGET",
      label: "dia do mês + alvo",
      minSamples: LAYER_MIN_SAMPLES.DOM_TARGET,
      match: (ctx) =>
        ctx.targetDayOfMonth === targetDayOfMonth &&
        ctx.targetHour === targetHour,
    },
    {
      key: "DOW_TARGET",
      label: "dia da semana + alvo",
      minSamples: LAYER_MIN_SAMPLES.DOW_TARGET,
      match: (ctx) =>
        ctx.targetDow === targetDow &&
        ctx.targetHour === targetHour,
    },
    {
      key: "TARGET_ONLY",
      label: "alvo geral",
      minSamples: LAYER_MIN_SAMPLES.TARGET_ONLY,
      match: (ctx) => ctx.targetHour === targetHour,
    },
  ];
}

function buildConditionalLayerDistribution({
  lotteryKey,
  drawsRange,
  targetHour,
  targetDow,
  targetDayOfMonth,
  prevHour,
  prevGrupo,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
}) {
  const list = Array.isArray(drawsRange) ? drawsRange : [];
  const drawsIndex = indexDrawsByYmdHour(list);

  const layers = buildLayerConfigs({
    lotteryKey,
    targetDayOfMonth,
    targetDow,
    prevHour,
    prevGrupo,
    targetHour,
  });

  const layerResults = layers.map((layer) => ({
    key: layer.key,
    label: layer.label,
    minSamples: layer.minSamples,
    samples: 0,
    freq: new Map(),
    firstFreq: new Map(),
    matchingDraws: [],
  }));

  for (const d of list) {
    const prevY = pickDrawYMD(d);
    const prevH = toHourBucket(pickDrawHour(d));
    if (!isYMD(prevY) || !prevH) continue;

    const prevG = getFirstGrupoFromDraw(d);
    if (!Number.isFinite(Number(prevG)) || Number(prevG) <= 0) continue;

    const ns = getNextSlotForLottery({
      lotteryKey,
      ymd: prevY,
      hourBucket: prevH,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });

    if (!ns?.ymd || !ns?.hour) continue;

    const found = findNextExistingDrawFromSlot({
      lotteryKey,
      startSlot: { ymd: ns.ymd, hour: ns.hour },
      drawsIndex,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });

    const nextDraw = found?.draw || null;
    const nextSlot = found?.slot || null;
    if (!nextDraw || !nextSlot?.ymd || !nextSlot?.hour) continue;

    const ctx = {
      prevYmd: prevY,
      prevHour: prevH,
      prevGrupo: Number(prevG),
      targetYmd: safeStr(nextSlot.ymd),
      targetHour: toHourBucket(nextSlot.hour),
      targetDow: getDowKey(nextSlot.ymd),
      targetDayOfMonth: getDayOfMonth(nextSlot.ymd),
    };

    const nextMaps = buildFreqAndFirstMaps(nextDraw);

    for (let i = 0; i < layers.length; i += 1) {
      const layer = layers[i];
      if (!layer.match(ctx)) continue;

      layerResults[i].samples += 1;
      layerResults[i].matchingDraws.push(nextDraw);
      mergeMapsAdd(layerResults[i].freq, nextMaps.freq);
      mergeMapsAdd(layerResults[i].firstFreq, nextMaps.firstMap);
    }
  }

  let chosen =
    layerResults.find((x) => x.samples >= x.minSamples && x.freq.size > 0) ||
    layerResults.find((x) => x.samples > 0 && x.freq.size > 0) ||
    null;

  if (!chosen) {
    chosen = {
      key: "NONE",
      label: "sem amostra",
      minSamples: 0,
      samples: 0,
      freq: new Map(),
      firstFreq: new Map(),
      matchingDraws: [],
    };
  }

  return {
    chosen,
    layers: layerResults,
  };
}

/* =========================
   Motor principal V1
========================= */

export function computeConditionalNextTop3({
  lotteryKey,
  drawsRange,
  drawLast,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  topN = 3,
  targetYmdOverride = "",
  targetHourOverride = "",
}) {
  const list = Array.isArray(drawsRange) ? drawsRange : [];
  if (!list.length || !drawLast) {
    return { top: [], meta: null };
  }

  const key = safeStr(lotteryKey).toUpperCase();

  const lastY = pickDrawYMD(drawLast);
  const lastH = toHourBucket(pickDrawHour(drawLast));
  const prevGrupo = getFirstGrupoFromDraw(drawLast);

  if (
    !isYMD(lastY) ||
    !lastH ||
    !Number.isFinite(Number(prevGrupo)) ||
    Number(prevGrupo) <= 0
  ) {
    return { top: [], meta: null };
  }

  const nextSlot = getNextSlotForLottery({
    lotteryKey,
    ymd: lastY,
    hourBucket: lastH,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });

  const forcedTargetY = safeStr(targetYmdOverride);
  const forcedTargetH = toHourBucket(targetHourOverride);

  const targetY = isYMD(forcedTargetY) && forcedTargetH
    ? forcedTargetY
    : safeStr(nextSlot?.ymd);

  const targetH = isYMD(forcedTargetY) && forcedTargetH
    ? forcedTargetH
    : toHourBucket(nextSlot?.hour);
  const targetDow = getDowKey(targetY);
  const targetDayOfMonth = getDayOfMonth(targetY);
  const transition = `${lastH}->${targetH}`;

  const useFirstFocusedRanking =
    key !== "FEDERAL" &&
    (transition === "11h->14h" || transition === "14h->16h");

  if (!isYMD(targetY) || !targetH || !Number.isFinite(targetDow)) {
    return { top: [], meta: null };
  }

  const layerOut = buildConditionalLayerDistribution({
    lotteryKey,
    drawsRange: list,
    targetHour: targetH,
    targetDow,
    targetDayOfMonth,
    prevHour: lastH,
    prevGrupo: Number(prevGrupo),
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });

  const chosen = layerOut.chosen;
  const samples = Number(chosen?.samples || 0);
  const freq = chosen?.freq || new Map();
  const firstFreq = chosen?.firstFreq || new Map();
  const probCond = probFromFreq(freq, samples, TOP3_GROUPS_K);

  const structural = computeStructuralBaseDistribution(
    list,
    key,
    targetH,
    targetDow,
    TOP3_GROUPS_K
  );
  const probBase = structural?.scoreProb || new Map();

  const condWeight =
    key === "FEDERAL"
      ? samples >= 8
        ? 0.55
        : samples >= 4
          ? 0.4
          : 0.25
      : samples >= 12
        ? 0.65
        : samples >= 6
          ? 0.55
          : 0.45;

  const baseWeight = 1 - condWeight;

  const lastSeen = computeLastSeenByGrupo(list);
  const nowTs = ymdHourToTs(lastY, lastH);

  const finiteLastSeen = Array.from(lastSeen.values()).filter((v) =>
    Number.isFinite(Number(v))
  );
  const minLastSeenTs = finiteLastSeen.length ? Math.min(...finiteLastSeen) : nowTs;
  const maxGapMsBase =
    Number.isFinite(nowTs) && Number.isFinite(minLastSeenTs)
      ? Math.max(1, nowTs - minLastSeenTs)
      : 1;

  const recentDraws = getRecentDrawsBefore(list, drawLast, 6);
  const recentMetrics = computeRecentPressureMetrics(recentDraws, TOP3_GROUPS_K);

  const recentMaxPrizePresence = Math.max(
    1,
    ...Array.from(recentMetrics.values()).map((x) => Number(x.recentPrizePresence || 0))
  );
  const recentMaxIndirect = Math.max(
    1,
    ...Array.from(recentMetrics.values()).map((x) => Number(x.recentIndirect || 0))
  );
  const recentMaxFirst = Math.max(
    1,
    ...Array.from(recentMetrics.values()).map((x) => Number(x.recentFirst || 0))
  );

  const ranked = Array.from({ length: safeInt(TOP3_GROUPS_K, 25) }, (_, idx) => {
    const grupo = idx + 1;
    const aparicoes = Number(freq.get(grupo) || 0);
    const primeiros = Number(firstFreq.get(grupo) || 0);
    const pCond = Number(probCond.get(grupo) || 0);
    const pBase = Number(probBase.get(grupo) || 0);
    const pFinal = (pCond * condWeight) + (pBase * baseWeight);

    const ls = lastSeen.get(grupo);
    const lastSeenTs = Number.isFinite(ls) ? ls : Number.POSITIVE_INFINITY;

    const gapMs =
      Number.isFinite(nowTs) &&
      Number.isFinite(lastSeenTs) &&
      lastSeenTs !== Number.POSITIVE_INFINITY
        ? Math.max(0, nowTs - lastSeenTs)
        : maxGapMsBase;

    const taxaPrimeiro = samples > 0 ? primeiros / samples : 0;
    const lateBonusRaw = Math.max(0, gapMs) / Math.max(1, maxGapMsBase);
    const lateBonus = Math.max(0, Math.min(1, lateBonusRaw));

    const rm = recentMetrics.get(grupo) || {
      recentPrizePresence: 0,
      recentIndirect: 0,
      recentFirst: 0,
      recentLast1First: 0,
      recentLast2PrizePresence: 0,
    };

    const recentPrizePresenceNorm = normalizeMetric(rm.recentPrizePresence, recentMaxPrizePresence);
    const recentIndirectNorm = normalizeMetric(rm.recentIndirect, recentMaxIndirect);
    const recentFirstNorm = normalizeMetric(rm.recentFirst, recentMaxFirst);
    const recentLast1FirstNorm = normalizeMetric(rm.recentLast1First, 1);
    const recentLast2PrizePresenceNorm = normalizeMetric(rm.recentLast2PrizePresence, 2);

    const recencyCoolingFactor =
      rm.recentLast1First > 0
        ? 0.72
        : rm.recentFirst >= 2
          ? 0.84
          : 1.0;

    const smartLateBoost =
      lateBonus *
      (0.45 + (recentIndirectNorm * 0.35) + (recentLast2PrizePresenceNorm * 0.2)) *
      recencyCoolingFactor;

    const recentComposite =
      (recentPrizePresenceNorm * 0.45) +
      (recentIndirectNorm * 0.35) +
      (recentFirstNorm * 0.2);

    const baseScore =
      key === "FEDERAL"
        ? (pFinal * 145) +
          (pBase * 85) +
          (primeiros * 42) +
          (aparicoes * 18) +
          (recentComposite * 26) +
          (smartLateBoost * 10)
        : useFirstFocusedRanking
          ? (pFinal * 125) +
            (aparicoes * 155) +
            (primeiros * 70) +
            (taxaPrimeiro * 34) +
            (recentComposite * 18) +
            (recentLast1FirstNorm * 10) +
            (smartLateBoost * 16)
          : (pFinal * 125) +
            (aparicoes * 135) +
            (primeiros * 62) +
            (recentComposite * 24) +
            (recentLast1FirstNorm * 8) +
            (smartLateBoost * 18);

    return {
      grupo,
      aparicoes,
      primeiros,
      taxaPrimeiro,
      scoreProb: pFinal,
      probCond: pCond,
      probBase: pBase,
      score: baseScore,
      lateBonus,
      smartLateBoost,
      recentPrizePresence: rm.recentPrizePresence,
      recentIndirect: rm.recentIndirect,
      recentFirst: rm.recentFirst,
      recentLast1First: rm.recentLast1First,
      recentLast2PrizePresence: rm.recentLast2PrizePresence,
      recentComposite,
      lastSeenTs,
      gapMs,
    };
  })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.scoreProb !== a.scoreProb) return b.scoreProb - a.scoreProb;
      if (b.primeiros !== a.primeiros) return b.primeiros - a.primeiros;
      if (b.aparicoes !== a.aparicoes) return b.aparicoes - a.aparicoes;
      return a.grupo - b.grupo;
    })
    .slice(0, Math.max(1, Number(topN || 3)));

  const reasonsBase = [
    `Camada usada: ${chosen?.label || "—"}`,
    `Amostra histórica condicional: ${samples}`,
    `Amostra estrutural: ${Number(structural?.totalSamples || 0)}`,
    `Pesos: condicional=${(condWeight * 100).toFixed(0)}% | estrutural=${(baseWeight * 100).toFixed(0)}%`,
    `Estado atual: prev=${String(prevGrupo).padStart(2, "0")} @ ${lastH} → alvo ${targetH}`,
    `Data alvo: ${targetY} | DOW=${targetDow} | dia=${String(targetDayOfMonth).padStart(2, "0")}`,
  ];

  const top = ranked.map((x, idx) => {
    const g2 = String(x.grupo).padStart(2, "0");
    const pct = (x.scoreProb * 100).toFixed(2);
    const pctCond = (x.probCond * 100).toFixed(2);
    const pctBase = (x.probBase * 100).toFixed(2);

    return {
      rank: idx + 1,
      title:
        idx === 0
          ? "Mais provável"
          : idx === 1
            ? "2º mais provável"
            : "3º mais provável",
      grupo: x.grupo,
      scoreProb: Number(x.scoreProb || 0),
      probCond: Number(x.probCond || 0),
      probBase: Number(x.probBase || 0),
      lateBonus: Number(x.lateBonus || 0),
      freq: x.aparicoes,
      freqCond: x.aparicoes,
      freqBase: 0,
      freqZeroWhy:
        x.aparicoes <= 0
          ? `Sem ocorrência nesta camada (${chosen?.label || "—"}).`
          : "",
      reasons: [
        ...reasonsBase,
        `Grupo G${g2}: aparições=${x.aparicoes} em ${samples} amostras do próximo sorteio`,
        `Grupo G${g2}: primeiros lugares=${x.primeiros}`,
        `Probabilidade final estimada no TOP3: ${pct}%`,
        `Composição da probabilidade: condicional=${pctCond}% | estrutural=${pctBase}%`,
        `Presença indireta recente (2º-4º): ${x.recentIndirect}`,
        `Persistência curta recente: ${x.recentPrizePresence}`,
        `Bônus de atraso ajustado: ${(Number(x.smartLateBoost || 0) * 100).toFixed(2)}%`,
      ],
      meta: {
        trigger: {
          ymd: lastY,
          hour: lastH,
          grupo: Number(prevGrupo),
        },
        next: {
          ymd: safeStr(targetY),
          hour: safeStr(targetH),
        },
        samples,
        scenario: chosen?.key || "NONE",
        explain: {
          layerKey: chosen?.key || "NONE",
          layerLabel: chosen?.label || "—",
          layerSamples: samples,
          baseSamples: Number(structural?.totalSamples || 0),
          condWeight,
          baseWeight,
          targetDow,
          targetDayOfMonth,
          prevHour: lastH,
          prevGrupo: Number(prevGrupo),
          recentPrizePresence: x.recentPrizePresence,
          recentIndirect: x.recentIndirect,
          recentFirst: x.recentFirst,
          recentLast1First: x.recentLast1First,
          recentLast2PrizePresence: x.recentLast2PrizePresence,
          allLayers: (layerOut?.layers || []).map((layer) => ({
            key: layer.key,
            label: layer.label,
            samples: layer.samples,
            minSamples: layer.minSamples,
          })),
        },
      },
    };
  });

  return {
    top,
    meta: {
      trigger: {
        ymd: lastY,
        hour: lastH,
        grupo: Number(prevGrupo),
      },
      next: {
        ymd: safeStr(targetY),
        hour: safeStr(targetH),
      },
      samples,
      scenario: chosen?.key || "NONE",
      explain: {
        layerKey: chosen?.key || "NONE",
        layerLabel: chosen?.label || "—",
        layerSamples: samples,
        baseSamples: Number(structural?.totalSamples || 0),
        condWeight,
        baseWeight,
        targetDow,
        targetDayOfMonth,
        prevHour: lastH,
        prevGrupo: Number(prevGrupo),
        allLayers: (layerOut?.layers || []).map((layer) => ({
          key: layer.key,
          label: layer.label,
          samples: layer.samples,
          minSamples: layer.minSamples,
        })),
      },
    },
  };
}

/* =========================
   V2 — helpers focados em BICHO
========================= */

function computeStructuralFirstDistribution(
  draws,
  lotteryKey,
  targetHour,
  targetDow,
  groupsK = TOP3_GROUPS_K
) {
  const list = Array.isArray(draws) ? draws : [];
  const key = safeStr(lotteryKey).toUpperCase();
  const target = toHourBucket(targetHour);
  const k = safeInt(groupsK, 25);

  const firstFreq = new Map();
  let totalSamples = 0;

  for (const d of list) {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    if (!isYMD(y) || !h) continue;

    if (key === "FEDERAL") {
      if (!isFederalDrawDay(y)) continue;
      if (Number(getDowKey(y)) !== Number(targetDow)) continue;
    } else {
      if (h !== target) continue;
    }

    const g = getFirstGrupoFromDraw(d);
    if (!Number.isFinite(Number(g)) || Number(g) < 1 || Number(g) > k) continue;

    totalSamples += 1;
    firstFreq.set(Number(g), Number(firstFreq.get(Number(g)) || 0) + 1);
  }

  const prob = new Map();
  const denom = Math.max(1, totalSamples);

  for (let g = 1; g <= k; g += 1) {
    prob.set(g, Number(firstFreq.get(g) || 0) / denom);
  }

  return { prob, firstFreq, totalSamples };
}

function getComparableDrawsForTargetContext(
  draws,
  lotteryKey,
  targetHour,
  targetDow
) {
  const list = sortDrawsAsc(draws);
  const key = safeStr(lotteryKey).toUpperCase();
  const target = toHourBucket(targetHour);

  return list.filter((d) => {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    if (!isYMD(y) || !h) return false;

    if (key === "FEDERAL") {
      return isFederalDrawDay(y) && Number(getDowKey(y)) === Number(targetDow);
    }

    return h === target;
  });
}

function buildComparableFirstSequence(
  draws,
  lotteryKey,
  targetHour,
  targetDow
) {
  return getComparableDrawsForTargetContext(
    draws,
    lotteryKey,
    targetHour,
    targetDow
  )
    .map((d) => {
      const y = pickDrawYMD(d);
      const h = toHourBucket(pickDrawHour(d));
      const grupo = getFirstGrupoFromDraw(d);
      return {
        draw: d,
        ymd: y,
        hour: h,
        ts: ymdHourToTs(y, h),
        grupo: Number(grupo),
      };
    })
    .filter((x) =>
      isYMD(x.ymd) &&
      x.hour &&
      Number.isFinite(Number(x.ts)) &&
      Number.isFinite(Number(x.grupo)) &&
      Number(x.grupo) >= 1 &&
      Number(x.grupo) <= 25
    );
}

function getStateFromComparableSequenceBeforeTs(seq, beforeTs, count = 3) {
  const list = Array.isArray(seq) ? seq : [];
  const n = Math.max(1, Number(count || 3));

  return list
    .filter((x) => Number.isFinite(Number(x.ts)) && Number(x.ts) < Number(beforeTs))
    .slice(-n)
    .reverse()
    .map((x) => Number(x.grupo))
    .filter((g) => Number.isFinite(g) && g >= 1 && g <= 25);
}

function getComparableRecentDrawsBeforeTs(seq, beforeTs, count = 6) {
  const list = Array.isArray(seq) ? seq : [];
  return list
    .filter((x) => Number.isFinite(Number(x.ts)) && Number(x.ts) < Number(beforeTs))
    .slice(-Math.max(1, Number(count || 6)));
}

function countLeadingStateMatches(currentState, histState) {
  const a = Array.isArray(currentState) ? currentState : [];
  const b = Array.isArray(histState) ? histState : [];
  const len = Math.min(a.length, b.length);

  let matched = 0;
  for (let i = 0; i < len; i += 1) {
    if (Number(a[i]) !== Number(b[i])) break;
    matched += 1;
  }
  return matched;
}

function buildMemoryStateDistribution({
  drawsRange,
  lotteryKey,
  targetHour,
  targetDow,
  currentState,
  groupsK = TOP3_GROUPS_K,
}) {
  const seq = buildComparableFirstSequence(
    drawsRange,
    lotteryKey,
    targetHour,
    targetDow
  );

  const k = safeInt(groupsK, 25);
  const freq = new Map();

  for (let g = 1; g <= k; g += 1) {
    freq.set(g, 0);
  }

  let totalWeight = 0;
  let matchedSamples = 0;

  for (let i = 0; i < seq.length; i += 1) {
    const target = seq[i];
    const histState = [];

    for (let j = i - 1; j >= 0 && histState.length < 3; j -= 1) {
      histState.push(Number(seq[j].grupo));
    }

    const matchDepth = countLeadingStateMatches(currentState, histState);
    if (matchDepth <= 0) continue;

    const weight =
      matchDepth >= 3 ? 4.0 :
      matchDepth === 2 ? 2.5 :
      1.0;

    const g = Number(target.grupo);
    if (!Number.isFinite(g) || g < 1 || g > k) continue;

    freq.set(g, Number(freq.get(g) || 0) + weight);
    totalWeight += weight;
    matchedSamples += 1;
  }

  const prob = new Map();
  const denom = Math.max(1, totalWeight);

  for (let g = 1; g <= k; g += 1) {
    prob.set(g, Number(freq.get(g) || 0) / denom);
  }

  return {
    prob,
    freq,
    totalWeight,
    matchedSamples,
    state: Array.isArray(currentState) ? currentState : [],
    sequenceSamples: seq.length,
  };
}

function detectRegimeFromComparableSequence(seqRecent) {
  const list = Array.isArray(seqRecent) ? seqRecent : [];
  const groups = list
    .map((x) => Number(x?.grupo))
    .filter((g) => Number.isFinite(g) && g >= 1 && g <= 25);

  if (groups.length <= 1) {
    return {
      regime: "neutral",
      repeatRate: 0,
      uniqueRate: groups.length ? 1 : 0,
      samples: groups.length,
    };
  }

  let repeats = 0;
  for (let i = 1; i < groups.length; i += 1) {
    if (groups[i] === groups[i - 1]) repeats += 1;
  }

  const repeatRate = repeats / Math.max(1, groups.length - 1);
  const uniqueRate = new Set(groups).size / Math.max(1, groups.length);

  let regime = "neutral";

  if (repeatRate >= 0.34 || uniqueRate <= 0.5) {
    regime = "repeat";
  } else if (repeatRate === 0 && uniqueRate >= 0.84) {
    regime = "spread";
  }

  return {
    regime,
    repeatRate,
    uniqueRate,
    samples: groups.length,
  };
}

function computeComparablePrizePresenceDistribution(
  draws,
  lotteryKey,
  targetHour,
  targetDow,
  groupsK = TOP3_GROUPS_K
) {
  const list = getComparableDrawsForTargetContext(
    draws,
    lotteryKey,
    targetHour,
    targetDow
  );

  const k = safeInt(groupsK, 25);
  const freq = new Map();
  let totalSamples = 0;

  for (let g = 1; g <= k; g += 1) {
    freq.set(g, 0);
  }

  for (const d of list) {
    const items = getAllPrizePresenceGroups(d);
    if (!items.length) continue;

    totalSamples += 1;

    for (const it of items) {
      const g = Number(it.grupo);
      if (!Number.isFinite(g) || g < 1 || g > k) continue;
      freq.set(g, Number(freq.get(g) || 0) + 1);
    }
  }

  const prob = new Map();
  const denom = Math.max(1, totalSamples * 5);

  for (let g = 1; g <= k; g += 1) {
    prob.set(g, Number(freq.get(g) || 0) / denom);
  }

  return { prob, freq, totalSamples };
}

function computeComparableDuplicationDistribution(
  draws,
  lotteryKey,
  targetHour,
  targetDow,
  groupsK = TOP3_GROUPS_K
) {
  const list = getComparableDrawsForTargetContext(
    draws,
    lotteryKey,
    targetHour,
    targetDow
  );

  const k = safeInt(groupsK, 25);
  const freq = new Map();
  let totalSamples = 0;

  for (let g = 1; g <= k; g += 1) {
    freq.set(g, 0);
  }

  for (const d of list) {
    const counts = countAparicoesByGrupoInDraw(d);
    if (!counts.size) continue;

    totalSamples += 1;

    for (let g = 1; g <= k; g += 1) {
      const c = Number(counts.get(g) || 0);
      if (c >= 2) {
        freq.set(g, Number(freq.get(g) || 0) + 1);
      }
    }
  }

  const prob = new Map();
  const denom = Math.max(1, totalSamples);

  for (let g = 1; g <= k; g += 1) {
    prob.set(g, Number(freq.get(g) || 0) / denom);
  }

  return { prob, freq, totalSamples };
}

function getComparableContextDrawsBeforeTs(
  draws,
  lotteryKey,
  targetHour,
  targetDow,
  beforeTs,
  count = 8
) {
  return getComparableDrawsForTargetContext(draws, lotteryKey, targetHour, targetDow)
    .filter((d) => {
      const y = pickDrawYMD(d);
      const h = toHourBucket(pickDrawHour(d));
      const ts = ymdHourToTs(y, h);
      return Number.isFinite(Number(ts)) && ts < Number(beforeTs);
    })
    .slice(-Math.max(1, Number(count || 8)));
}

function computeRecentBichoMetrics(draws, groupsK = TOP3_GROUPS_K) {
  const k = safeInt(groupsK, 25);
  const out = new Map();

  for (let g = 1; g <= k; g += 1) {
    out.set(g, {
      recentPrizePresence: 0,
      recentFirst: 0,
      recentDupDraws: 0,
      recentLast1PrizePresence: 0,
      recentLast2PrizePresence: 0,
      recentLast3PrizePresence: 0,
    });
  }

  const list = Array.isArray(draws) ? draws : [];
  const last1 = list.length ? [list[list.length - 1]] : [];
  const last2 = list.slice(-2);
  const last3 = list.slice(-3);

  for (const d of list) {
    const items = getAllPrizePresenceGroups(d);
    const perDrawCounts = new Map();

    for (const it of items) {
      const g = Number(it.grupo);
      if (!Number.isFinite(g) || g < 1 || g > k) continue;

      const row = out.get(g);
      row.recentPrizePresence += 1;

      if (Number(it.pos) === 1) {
        row.recentFirst += 1;
      }

      perDrawCounts.set(g, Number(perDrawCounts.get(g) || 0) + 1);
    }

    for (const [g, c] of perDrawCounts.entries()) {
      if (Number(c) >= 2) {
        out.get(Number(g)).recentDupDraws += 1;
      }
    }
  }

  for (const d of last1) {
    const seen = new Set();
    for (const it of getAllPrizePresenceGroups(d)) {
      const g = Number(it.grupo);
      if (!Number.isFinite(g) || g < 1 || g > k || seen.has(g)) continue;
      seen.add(g);
      out.get(g).recentLast1PrizePresence += 1;
    }
  }

  for (const d of last2) {
    const seen = new Set();
    for (const it of getAllPrizePresenceGroups(d)) {
      const g = Number(it.grupo);
      if (!Number.isFinite(g) || g < 1 || g > k || seen.has(g)) continue;
      seen.add(g);
      out.get(g).recentLast2PrizePresence += 1;
    }
  }

  for (const d of last3) {
    const seen = new Set();
    for (const it of getAllPrizePresenceGroups(d)) {
      const g = Number(it.grupo);
      if (!Number.isFinite(g) || g < 1 || g > k || seen.has(g)) continue;
      seen.add(g);
      out.get(g).recentLast3PrizePresence += 1;
    }
  }

  return out;
}

function getDayDrivenWeights(mode) {
  if (mode === "REPEAT") {
    return {
      transition: 0.25,
      pair: 0.25,
      memory: 0.2,
      recent: 0.15,
      structural: 0.1,
      late: 0.05,
    };
  }

  if (mode === "SPREAD") {
    return {
      transition: 0.2,
      pair: 0.1,
      memory: 0.1,
      recent: 0.2,
      structural: 0.3,
      late: 0.1,
    };
  }

  return {
    transition: 0.3,
    pair: 0.15,
    memory: 0.15,
    recent: 0.15,
    structural: 0.2,
    late: 0.05,
  };
}

function normalizeWeights(weights) {
  const safe = {
    transition: Number(weights?.transition || 0),
    pair: Number(weights?.pair || 0),
    memory: Number(weights?.memory || 0),
    recent: Number(weights?.recent || 0),
    structural: Number(weights?.structural || 0),
    late: Number(weights?.late || 0),
  };

  const total = Object.values(safe).reduce((acc, n) => acc + n, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return {
      transition: 0.3,
      pair: 0.15,
      memory: 0.15,
      recent: 0.15,
      structural: 0.2,
      late: 0.05,
    };
  }

  return {
    transition: safe.transition / total,
    pair: safe.pair / total,
    memory: safe.memory / total,
    recent: safe.recent / total,
    structural: safe.structural / total,
    late: safe.late / total,
  };
}

function computeComparableLastSeenByGrupo(
  draws,
  lotteryKey,
  targetHour,
  targetDow,
  groupsK = TOP3_GROUPS_K
) {
  const list = getComparableDrawsForTargetContext(
    draws,
    lotteryKey,
    targetHour,
    targetDow
  );

  const k = safeInt(groupsK, 25);
  const last = new Map();

  for (let g = 1; g <= k; g += 1) {
    last.set(g, Number.NEGATIVE_INFINITY);
  }

  for (const d of list) {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    const ts = ymdHourToTs(y, h);
    const items = getAllPrizePresenceGroups(d);

    for (const it of items) {
      const g = Number(it.grupo);
      if (!Number.isFinite(g) || g < 1 || g > k) continue;

      const prev = Number(last.get(g));
      if (!Number.isFinite(prev) || ts > prev) {
        last.set(g, ts);
      }
    }
  }

  return last;
}

function buildDayContext(drawsToday = []) {
  const list = sortDrawsAsc(Array.isArray(drawsToday) ? drawsToday : []);
  const freq = new Map();
  const firstFreq = new Map();
  const seq = [];

  for (const d of list) {
    const g = getFirstGrupoFromDraw(d);
    if (!Number.isFinite(Number(g)) || Number(g) < 1 || Number(g) > 25) continue;

    const gg = Number(g);
    seq.push(gg);
    freq.set(gg, Number(freq.get(gg) || 0) + 1);

    const items = getAllPrizePresenceGroups(d);
    if (items.some((it) => Number(it.grupo) === gg && Number(it.pos) === 1)) {
      firstFreq.set(gg, Number(firstFreq.get(gg) || 0) + 1);
    }
  }

  const total = seq.length;
  const unique = new Set(seq).size;
  const diversidade = total > 0 ? unique / total : 0;

  let dominante = null;
  let dominanteCount = -1;
  for (const [g, n] of freq.entries()) {
    if (Number(n) > dominanteCount) {
      dominante = Number(g);
      dominanteCount = Number(n);
    }
  }

  const last1 = total >= 1 ? seq[total - 1] : null;
  const last2 = total >= 2 ? seq[total - 2] : null;
  const repeatNow =
    Number.isFinite(Number(last1)) &&
    Number.isFinite(Number(last2)) &&
    Number(last1) === Number(last2);

  return {
    total,
    unique,
    diversidade,
    dominante,
    dominanteCount: Math.max(0, dominanteCount),
    repeatNow,
    freq,
    firstFreq,
    seq,
  };
}

function buildPairSequenceDistribution({
  drawsRange,
  lotteryKey,
  targetHour,
  targetDow,
  targetDayOfMonth,
  prevPair,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  groupsK = TOP3_GROUPS_K,
}) {
  const seq = buildComparableFirstSequence(
    Array.isArray(drawsRange) ? drawsRange : [],
    lotteryKey,
    targetHour,
    targetDow
  );

  const k = safeInt(groupsK, 25);
  const outFreq = new Map();

  for (let g = 1; g <= k; g += 1) outFreq.set(g, 0);

  const pair = Array.isArray(prevPair) ? prevPair : [];
  if (pair.length < 2) {
    return {
      prob: buildZeroProbMap(k),
      samples: 0,
      weightedSamples: 0,
      exactDomSamples: 0,
      freq: outFreq,
    };
  }

  const pA = Number(pair[0]);
  const pB = Number(pair[1]);
  const key = safeStr(lotteryKey).toUpperCase();

  let matchedSamples = 0;
  let weightedSamples = 0;
  let exactDomSamples = 0;

  for (let i = 2; i < seq.length; i += 1) {
    const a = Number(seq[i - 2]?.grupo);
    const b = Number(seq[i - 1]?.grupo);
    const g = Number(seq[i]?.grupo);
    const y = safeStr(seq[i]?.ymd);

    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(g)) continue;
    if (a !== pA || b !== pB) continue;
    if (!isYMD(y)) continue;

    matchedSamples += 1;

    let weight = 1;

    if (key !== "FEDERAL") {
      const dom = Number(getDayOfMonth(y));
      if (Number.isFinite(dom) && Number(dom) === Number(targetDayOfMonth)) {
        weight = 1.35;
        exactDomSamples += 1;
      }
    }

    weightedSamples += weight;
    outFreq.set(g, Number(outFreq.get(g) || 0) + weight);
  }

  const prob = new Map();
  const denom = Math.max(1, weightedSamples);

  for (let g = 1; g <= k; g += 1) {
    prob.set(g, Number(outFreq.get(g) || 0) / denom);
  }

  return {
    prob,
    samples: matchedSamples,
    weightedSamples,
    exactDomSamples,
    freq: outFreq,
  };
}

function buildSeq2FirstDistribution(
  comparableSeq,
  currentState,
  groupsK = TOP3_GROUPS_K
) {
  const seq = Array.isArray(comparableSeq) ? comparableSeq : [];
  const state = Array.isArray(currentState) ? currentState : [];
  const k = safeInt(groupsK, 25);

  const freq = new Map();
  for (let g = 1; g <= k; g += 1) freq.set(g, 0);

  if (state.length < 2) {
    const prob = new Map();
    for (let g = 1; g <= k; g += 1) prob.set(g, 0);
    return { prob, freq, samples: 0, prev2: null, prev1: null };
  }

  const prev1 = Number(state[0]);
  const prev2 = Number(state[1]);

  let samples = 0;

  for (let i = 2; i < seq.length; i += 1) {
    const gA = Number(seq[i - 2]?.grupo);
    const gB = Number(seq[i - 1]?.grupo);
    const gN = Number(seq[i]?.grupo);

    if (!Number.isFinite(gA) || !Number.isFinite(gB) || !Number.isFinite(gN)) continue;
    if (gA !== prev2 || gB !== prev1) continue;
    if (gN < 1 || gN > k) continue;

    samples += 1;
    freq.set(gN, Number(freq.get(gN) || 0) + 1);
  }

  const prob = new Map();
  const denom = Math.max(1, samples);

  for (let g = 1; g <= k; g += 1) {
    prob.set(g, Number(freq.get(g) || 0) / denom);
  }

  return { prob, freq, samples, prev2, prev1 };
}

function buildRecentRepeatBoostMap(
  comparableSeq,
  targetTs,
  windowSize = 4,
  groupsK = TOP3_GROUPS_K
) {
  const seq = getComparableRecentDrawsBeforeTs(
    Array.isArray(comparableSeq) ? comparableSeq : [],
    targetTs,
    windowSize
  );

  const k = safeInt(groupsK, 25);
  const counts = new Map();
  for (let g = 1; g <= k; g += 1) counts.set(g, 0);

  for (const item of seq) {
    const g = Number(item?.grupo);
    if (!Number.isFinite(g) || g < 1 || g > k) continue;
    counts.set(g, Number(counts.get(g) || 0) + 1);
  }

  const boost = new Map();
  const maxCount = Math.max(1, ...Array.from(counts.values()).map((n) => Number(n || 0)));

  for (let g = 1; g <= k; g += 1) {
    const c = Number(counts.get(g) || 0);
    boost.set(g, c >= 2 ? c / maxCount : 0);
  }

  return {
    boost,
    counts,
    windowSize,
    considered: Array.isArray(seq) ? seq.length : 0,
  };
}

/* =========================
   Motor principal V2 (FOCO = BICHO)
========================= */

export function computeConditionalNextTop3V2({
  lotteryKey,
  drawsRange,
  drawLast,
  drawsToday,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  topN = 3,
  targetYmdOverride = "",
  targetHourOverride = "",
}) {
  const list = Array.isArray(drawsRange) ? drawsRange : [];
  if (!list.length || !drawLast) {
    return { top: [], meta: null };
  }

  const key = safeStr(lotteryKey).toUpperCase();

  const lastY = pickDrawYMD(drawLast);
  const lastH = toHourBucket(pickDrawHour(drawLast));
  const prevGrupo = getFirstGrupoFromDraw(drawLast);

  if (
    !isYMD(lastY) ||
    !lastH ||
    !Number.isFinite(Number(prevGrupo)) ||
    Number(prevGrupo) <= 0
  ) {
    return { top: [], meta: null };
  }

  const nextSlot = getNextSlotForLottery({
    lotteryKey,
    ymd: lastY,
    hourBucket: lastH,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });

  const forcedTargetY = safeStr(targetYmdOverride);
  const forcedTargetH = toHourBucket(targetHourOverride);

  const targetY = isYMD(forcedTargetY) && forcedTargetH
    ? forcedTargetY
    : safeStr(nextSlot?.ymd);

  const targetH = isYMD(forcedTargetY) && forcedTargetH
    ? forcedTargetH
    : toHourBucket(nextSlot?.hour);
  const targetDow = getDowKey(targetY);
  const targetDayOfMonth = getDayOfMonth(targetY);

  if (!isYMD(targetY) || !targetH || !Number.isFinite(Number(targetDow))) {
    return { top: [], meta: null };
  }

  const targetTs = ymdHourToTs(targetY, targetH);

  const dayContext = buildDayContext(drawsToday);
  const prevPair =
    Array.isArray(dayContext?.seq) && dayContext.seq.length >= 2
      ? dayContext.seq.slice(-2)
      : [];

  const pairOut = buildPairSequenceDistribution({
    drawsRange: list,
    lotteryKey: key,
    targetHour: targetH,
    targetDow,
    targetDayOfMonth,
    prevPair,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
    groupsK: TOP3_GROUPS_K,
  });

  const pairConfidence = clamp01(
    (confidenceFromSamples(pairOut?.samples || 0, 6) * 0.7) +
    (confidenceFromSamples(pairOut?.exactDomSamples || 0, 3) * 0.3)
  );

  const layerOut = buildConditionalLayerDistribution({
    lotteryKey,
    drawsRange: list,
    targetHour: targetH,
    targetDow,
    targetDayOfMonth,
    prevHour: lastH,
    prevGrupo: Number(prevGrupo),
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });

  const chosen = layerOut?.chosen || null;
  const condSamples = Number(chosen?.samples || 0);
  const condFirstFreq = chosen?.firstFreq || new Map();

  const pTransitionFirst = new Map();
  for (let g = 1; g <= safeInt(TOP3_GROUPS_K, 25); g += 1) {
    pTransitionFirst.set(
      g,
      Number(condFirstFreq.get(g) || 0) / Math.max(1, condSamples)
    );
  }

  const structuralFirst = computeStructuralFirstDistribution(
    list,
    key,
    targetH,
    targetDow,
    TOP3_GROUPS_K
  );
  const pStructuralFirst = structuralFirst?.prob || new Map();

  const structuralPrizePresence = computeComparablePrizePresenceDistribution(
    list,
    key,
    targetH,
    targetDow,
    TOP3_GROUPS_K
  );
  const pStructuralPrizePresence = structuralPrizePresence?.prob || new Map();

  const duplication = computeComparableDuplicationDistribution(
    list,
    key,
    targetH,
    targetDow,
    TOP3_GROUPS_K
  );
  const pDuplication = duplication?.prob || new Map();

  const comparableSeq = buildComparableFirstSequence(
    list,
    key,
    targetH,
    targetDow
  );

  const currentState = getStateFromComparableSequenceBeforeTs(
    comparableSeq,
    targetTs,
    3
  );

  const memoryOut = buildMemoryStateDistribution({
    drawsRange: list,
    lotteryKey: key,
    targetHour: targetH,
    targetDow,
    currentState,
    groupsK: TOP3_GROUPS_K,
  });

  const pMemory = memoryOut?.prob || new Map();

  const seq2Out = buildSeq2FirstDistribution(
    comparableSeq,
    currentState,
    TOP3_GROUPS_K
  );
  const pSeq2 = seq2Out?.prob || new Map();

  const repeatBoostOut = buildRecentRepeatBoostMap(
    comparableSeq,
    targetTs,
    4,
    TOP3_GROUPS_K
  );
  const repeatBoostMap = repeatBoostOut?.boost || new Map();

  const regimeInfo = detectRegimeFromComparableSequence(
    getComparableRecentDrawsBeforeTs(comparableSeq, targetTs, 6)
  );

  const regime = safeStr(regimeInfo?.regime || "neutral");

  const mode =
    dayContext.repeatNow || Number(dayContext?.diversidade || 0) < 0.5
      ? "REPEAT"
      : Number(dayContext?.diversidade || 0) > 0.75
        ? "SPREAD"
        : "NEUTRAL";

  const weights = getDayDrivenWeights(mode);

  const recentContextDraws = getComparableContextDrawsBeforeTs(
    list,
    key,
    targetH,
    targetDow,
    targetTs,
    8
  );
  const recentMetrics = computeRecentBichoMetrics(recentContextDraws, TOP3_GROUPS_K);

  const recentMaxPrizePresence = Math.max(
    1,
    ...Array.from(recentMetrics.values()).map((x) => Number(x.recentPrizePresence || 0))
  );
  const recentMaxFirst = Math.max(
    1,
    ...Array.from(recentMetrics.values()).map((x) => Number(x.recentFirst || 0))
  );
  const recentMaxDup = Math.max(
    1,
    ...Array.from(recentMetrics.values()).map((x) => Number(x.recentDupDraws || 0))
  );

  const lateSeen = computeComparableLastSeenByGrupo(
    list,
    key,
    targetH,
    targetDow,
    TOP3_GROUPS_K
  );

  const finiteSeen = Array.from(lateSeen.values()).filter((x) =>
    Number.isFinite(Number(x))
  );
  const minSeenTs = finiteSeen.length ? Math.min(...finiteSeen) : targetTs;
  const maxGapMsBase =
    Number.isFinite(targetTs) && Number.isFinite(minSeenTs)
      ? Math.max(1, targetTs - minSeenTs)
      : 1;

  const dayFlowConfidence = confidenceFromSamples(dayContext?.total || 0, 4);
  const pairStrong = Number(pairOut?.samples || 0) >= 4;

  const confidence =
    (pairConfidence * 0.3) +
    (confidenceFromSamples(condSamples, 20) * 0.4) +
    (confidenceFromSamples(memoryOut?.matchedSamples || 0, 15) * 0.3);

  const adjustedWeights = normalizeWeights({
    transition: pairStrong ? weights.transition * 0.7 : weights.transition,
    pair: pairStrong ? weights.pair * 1.4 : weights.pair,
    memory: weights.memory,
    recent: weights.recent,
    structural: weights.structural,
    late: weights.late,
  });

  const ranked = Array.from({ length: safeInt(TOP3_GROUPS_K, 25) }, (_, idx) => {
    const grupo = idx + 1;

    const pT = Number(pTransitionFirst.get(grupo) || 0);
    const pSF = Number(pStructuralFirst.get(grupo) || 0);
    const pST = Number(pStructuralPrizePresence.get(grupo) || 0);
    const pM = Number(pMemory.get(grupo) || 0);
    const pD = Number(pDuplication.get(grupo) || 0);
    const pSeq = Number(pSeq2.get(grupo) || 0);
    const repeatBoost = Number(repeatBoostMap.get(grupo) || 0);
    const pPair = Number(pairOut?.prob?.get?.(grupo) || 0);

    const rm = recentMetrics.get(grupo) || {
      recentPrizePresence: 0,
      recentFirst: 0,
      recentDupDraws: 0,
      recentLast1PrizePresence: 0,
      recentLast2PrizePresence: 0,
      recentLast3PrizePresence: 0,
    };

    const recentPrizePresenceNorm = normalizeMetric(rm.recentPrizePresence, recentMaxPrizePresence);
    const recentFirstNorm = normalizeMetric(rm.recentFirst, recentMaxFirst);
    const recentDupNorm = normalizeMetric(rm.recentDupDraws, recentMaxDup);
    const recentLast1Norm = normalizeMetric(rm.recentLast1PrizePresence, 1);
    const recentLast2Norm = normalizeMetric(rm.recentLast2PrizePresence, 2);

    const recentComposite =
      (recentFirstNorm * 0.52) +
      (recentPrizePresenceNorm * 0.08) +
      (recentDupNorm * 0.18) +
      (recentLast2Norm * 0.14) +
      (recentLast1Norm * 0.1);

    const dominanceScore =
      (pT * 0.42) +
      (pSF * 0.26) +
      (pST * 0.18) +
      (pD * 0.14);

    const seenTs = Number(lateSeen.get(grupo));
    const gapMs =
      Number.isFinite(targetTs) && Number.isFinite(seenTs)
        ? Math.max(0, targetTs - seenTs)
        : maxGapMsBase;

    const lateNorm = Math.max(
      0,
      Math.min(1, gapMs / Math.max(1, maxGapMsBase))
    );

    const dayFreq = Number(dayContext?.freq?.get?.(grupo) || 0);
    const dayFirstFreq = Number(dayContext?.firstFreq?.get?.(grupo) || 0);
    const isDominantToday =
      Number.isFinite(Number(dayContext?.dominante)) &&
      Number(dayContext.dominante) === Number(grupo);

    let dayFlowRaw = 0;

    if (dayFreq >= 2) dayFlowRaw += 32;
    if (dayFreq >= 3) dayFlowRaw += 18;
    if (dayFirstFreq >= 1) dayFlowRaw += 20;
    if (dayFirstFreq >= 2) dayFlowRaw += 14;
    if (isDominantToday) dayFlowRaw += 24;

    if (Number(dayContext?.diversidade || 0) < 0.5) {
      dayFlowRaw += dayFreq > 0 ? 12 : -8;
    } else if (Number(dayContext?.diversidade || 0) > 0.75) {
      dayFlowRaw += dayFreq === 0 ? 10 : 0;
    }

    if (dayContext?.repeatNow && dayFreq > 0) {
      dayFlowRaw += 10;
    }

    const dayFlowScore = dayFlowRaw * dayFlowConfidence;

    const pairSequenceScore =
      Number(pairOut?.samples || 0) > 0
        ? ((pPair * 260) + Math.min(70, Number(pairOut.samples || 0) * 8)) * pairConfidence
        : 0;

    const structuralBlend =
      (pSF * 0.45) +
      (pST * 0.35) +
      (pD * 0.2);

    const memoryBlend =
      (pM * 0.75) +
      (pSeq * 0.25);

    const recentBlend =
      (recentComposite * 0.85) +
      (repeatBoost * 0.15);

    const prob =
      (pT * adjustedWeights.transition) +
      (pPair * adjustedWeights.pair * pairConfidence) +
      (memoryBlend * adjustedWeights.memory) +
      (recentBlend * adjustedWeights.recent) +
      (structuralBlend * adjustedWeights.structural) +
      (lateNorm * adjustedWeights.late);

    const score =
      (prob * 1000) +
      (dominanceScore * 180) +
      (pairSequenceScore * 0.6) +
      (dayFlowScore * 0.8) +
      (confidence * 50);

    return {
      grupo,
      prob,
      scoreProb: prob,
      score,
      probTransition: pT,
      probStructuralFirst: pSF,
      probStructuralPrizePresence: pST,
      probMemory: pM,
      probDuplication: pD,
      probSeq2: pSeq,
      probPair: pPair,
      pairProb: pPair,
      pairConfidence,
      repeatBoost,
      dominanceScore,
      recentComposite,
      recentPrizePresence: rm.recentPrizePresence,
      recentFirst: rm.recentFirst,
      recentDupDraws: rm.recentDupDraws,
      recentLast1PrizePresence: rm.recentLast1PrizePresence,
      recentLast2PrizePresence: rm.recentLast2PrizePresence,
      recentLast3PrizePresence: rm.recentLast3PrizePresence,
      lateNorm,
      gapMs,
      condFirstCount: Number(condFirstFreq.get(grupo) || 0),
      structuralFirstCount: Number(structuralFirst?.firstFreq?.get(grupo) || 0),
      structuralPrizePresenceCount: Number(structuralPrizePresence?.freq?.get(grupo) || 0),
      duplicationCount: Number(duplication?.freq?.get(grupo) || 0),
      memoryWeight: Number(memoryOut?.freq?.get(grupo) || 0),
      dayFreq,
      dayFirstFreq,
      isDominantToday,
      dayFlowConfidence,
      dayFlowScore,
      pairSamples: Number(pairOut?.samples || 0),
      pairWeightedSamples: Number(pairOut?.weightedSamples || 0),
      pairExactDomSamples: Number(pairOut?.exactDomSamples || 0),
      pairCount: Number(pairOut?.freq?.get?.(grupo) || 0),
      pairSequenceScore,
    };
  })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.scoreProb !== a.scoreProb) return b.scoreProb - a.scoreProb;
      if (b.dominanceScore !== a.dominanceScore) return b.dominanceScore - a.dominanceScore;
      if (b.probTransition !== a.probTransition) return b.probTransition - a.probTransition;
      if (b.probPair !== a.probPair) return b.probPair - a.probPair;
      if (b.probDuplication !== a.probDuplication) return b.probDuplication - a.probDuplication;
      if (b.probStructuralFirst !== a.probStructuralFirst) return b.probStructuralFirst - a.probStructuralFirst;
      if (b.probStructuralPrizePresence !== a.probStructuralPrizePresence) return b.probStructuralPrizePresence - a.probStructuralPrizePresence;
      return a.grupo - b.grupo;
    })
    .slice(0, Math.max(1, Number(topN || 3)));



  const reasonsBase = [
    `Motor: V2_BICHO`,
    `Regime detectado: ${regime}`,
    `RepeatRate=${Number(regimeInfo?.repeatRate || 0).toFixed(2)} | UniqueRate=${Number(regimeInfo?.uniqueRate || 0).toFixed(2)}`,
    `Pesos: mode=${mode} | transição=${(adjustedWeights.transition * 100).toFixed(0)}% | par=${(adjustedWeights.pair * 100).toFixed(0)}% | memória=${(adjustedWeights.memory * 100).toFixed(0)}% | recência=${(adjustedWeights.recent * 100).toFixed(0)}% | estrutural=${(adjustedWeights.structural * 100).toFixed(0)}% | atraso=${(adjustedWeights.late * 100).toFixed(0)}%`,
    `Estado atual: prev=${String(prevGrupo).padStart(2, "0")} @ ${lastH} → alvo ${targetH}`,
    `Estado curto comparável: [${currentState.map((g) => String(g).padStart(2, "0")).join(", ")}]`,
    `Camada condicional: ${chosen?.label || "—"} | amostras=${condSamples}`,
    `Amostra estrutural 1º=${Number(structuralFirst?.totalSamples || 0)} | PRIZE_PRESENCE=${Number(structuralPrizePresence?.totalSamples || 0)} | duplicação=${Number(duplication?.totalSamples || 0)}`,
    `Amostra memória: matches=${Number(memoryOut?.matchedSamples || 0)} | peso=${Number(memoryOut?.totalWeight || 0).toFixed(2)}`,
    `Par do dia: ${Array.isArray(prevPair) && prevPair.length === 2 ? prevPair.map((n) => String(n).padStart(2, "0")).join("→") : "--"} | matches=${Number(pairOut?.samples || 0)} | matches DOM=${Number(pairOut?.exactDomSamples || 0)} | confiança=${(pairConfidence * 100).toFixed(0)}%`,
    `Fluxo do dia: draws=${Number(dayContext?.total || 0)} | confiança=${(dayFlowConfidence * 100).toFixed(0)}%`,
    `Data alvo: ${targetY} | DOW=${targetDow} | dia=${String(targetDayOfMonth).padStart(2, "0")}`,
  ];

  const top = ranked.map((x, idx) => {
    const g2 = String(x.grupo).padStart(2, "0");

    return {
      rank: idx + 1,
      title:
        idx === 0
          ? "Mais provável"
          : idx === 1
            ? "2º mais provável"
            : "3º mais provável",
      grupo: x.grupo,
      scoreProb: Number(x.scoreProb || 0),
      probCond: Number(x.probTransition || 0),
      probBase: Number(x.probStructuralFirst || 0),
      lateBonus: Number(x.lateNorm || 0),
      freq: x.condFirstCount,
      freqCond: x.condFirstCount,
      freqBase: x.structuralFirstCount,
      freqZeroWhy:
        x.condFirstCount <= 0
          ? `Sem 1º lugar nesta camada (${chosen?.label || "—"}).`
          : "",
      reasons: [
        ...reasonsBase,
        `Grupo G${g2}: transição para 1º=${(x.probTransition * 100).toFixed(2)}%`,
        `Grupo G${g2}: estrutural de 1º=${(x.probStructuralFirst * 100).toFixed(2)}%`,
        `Grupo G${g2}: estrutural de TOP3=${(x.probStructuralPrizePresence * 100).toFixed(2)}%`,
        `Grupo G${g2}: duplicação histórica=${(x.probDuplication * 100).toFixed(2)}%`,
        `Grupo G${g2}: sequência ordem 2=${(x.probSeq2 * 100).toFixed(2)}%`,
        `Grupo G${g2}: par do dia=${(x.probPair * 100).toFixed(2)}% | confiança=${(x.pairConfidence * 100).toFixed(2)}%`,
        `Grupo G${g2}: boost de repetição=${(x.repeatBoost * 100).toFixed(2)}%`,
        `Grupo G${g2}: memória curta=${(x.probMemory * 100).toFixed(2)}%`,
        `Grupo G${g2}: recência composta=${(x.recentComposite * 100).toFixed(2)}%`,
        `Grupo G${g2}: atraso normalizado=${(x.lateNorm * 100).toFixed(2)}%`,
        `Grupo G${g2}: 1ºs na camada=${x.condFirstCount}`,
        `Grupo G${g2}: 1ºs estruturais=${x.structuralFirstCount}`,
        `Grupo G${g2}: TOP3 estruturais=${x.structuralPrizePresenceCount}`,
        `Grupo G${g2}: draws com duplicação=${x.duplicationCount}`,
        `Grupo G${g2}: peso de memória=${Number(x.memoryWeight || 0).toFixed(2)}`,
        `Grupo G${g2}: frequência no dia=${x.dayFreq}`,
        `Grupo G${g2}: 1ºs no dia=${x.dayFirstFreq}`,
        `Grupo G${g2}: dominante no dia=${x.isDominantToday ? "sim" : "não"}`,
        `Grupo G${g2}: score do fluxo do dia=${Number(x.dayFlowScore || 0).toFixed(2)} | confiança=${(Number(x.dayFlowConfidence || 0) * 100).toFixed(0)}%`,
        `Grupo G${g2}: sequência ${Array.isArray(prevPair) && prevPair.length === 2 ? prevPair.map((n) => String(n).padStart(2, "0")).join("→") : "--"} | amostras=${x.pairSamples} | amostras ponderadas=${Number(x.pairWeightedSamples || 0).toFixed(2)} | DOM exato=${x.pairExactDomSamples} | ocorrências=${Number(x.pairCount || 0).toFixed(2)} | prob=${(Number(x.pairProb || 0) * 100).toFixed(2)}% | score=${Number(x.pairSequenceScore || 0).toFixed(2)}`,
        `Probabilidade final BICHO=${(x.scoreProb * 100).toFixed(2)}%`,
      ],
      meta: {
        trigger: {
          ymd: lastY,
          hour: lastH,
          grupo: Number(prevGrupo),
        },
        next: {
          ymd: safeStr(targetY),
          hour: safeStr(targetH),
        },
        samples: condSamples,
        scenario: `V2_BICHO_${safeStr(regime).toUpperCase()}`,
        explain: {
          engine: "V2_BICHO",
          mode,
          regime,
          repeatRate: Number(regimeInfo?.repeatRate || 0),
          uniqueRate: Number(regimeInfo?.uniqueRate || 0),
          weights: adjustedWeights,
          layerKey: chosen?.key || "NONE",
          layerLabel: chosen?.label || "—",
          layerSamples: condSamples,
          structuralFirstSamples: Number(structuralFirst?.totalSamples || 0),
          structuralPrizePresenceSamples: Number(structuralPrizePresence?.totalSamples || 0),
          duplicationSamples: Number(duplication?.totalSamples || 0),
          memoryMatchedSamples: Number(memoryOut?.matchedSamples || 0),
          memoryTotalWeight: Number(memoryOut?.totalWeight || 0),
          seq2Samples: Number(seq2Out?.samples || 0),
          seq2Prev2: Number(seq2Out?.prev2 || 0),
          seq2Prev1: Number(seq2Out?.prev1 || 0),
          pairSamples: Number(pairOut?.samples || 0),
          pairWeightedSamples: Number(pairOut?.weightedSamples || 0),
          pairExactDomSamples: Number(pairOut?.exactDomSamples || 0),
          pairConfidence,
          repeatWindowSize: Number(repeatBoostOut?.windowSize || 0),
          repeatWindowConsidered: Number(repeatBoostOut?.considered || 0),
          currentState,
          targetDow,
          targetDayOfMonth,
          prevHour: lastH,
          prevGrupo: Number(prevGrupo),
          dayContextTotal: Number(dayContext?.total || 0),
          dayFlowConfidence,
          dominanceScore: x.dominanceScore,
          recentComposite: x.recentComposite,
          recentPrizePresence: x.recentPrizePresence,
          recentFirst: x.recentFirst,
          recentDupDraws: x.recentDupDraws,
          allLayers: (layerOut?.layers || []).map((layer) => ({
            key: layer.key,
            label: layer.label,
            samples: layer.samples,
            minSamples: layer.minSamples,
          })),
        },
      },
    };
  });

  return {
    top,
    meta: {
      trigger: {
        ymd: lastY,
        hour: lastH,
        grupo: Number(prevGrupo),
      },
      next: {
        ymd: safeStr(targetY),
        hour: safeStr(targetH),
      },
      samples: condSamples,
      scenario: `V2_BICHO_${safeStr(regime).toUpperCase()}`,
      explain: {
        engine: "V2_BICHO",
        mode,
        regime,
        repeatRate: Number(regimeInfo?.repeatRate || 0),
        uniqueRate: Number(regimeInfo?.uniqueRate || 0),
        weights: adjustedWeights,
        layerKey: chosen?.key || "NONE",
        layerLabel: chosen?.label || "—",
        layerSamples: condSamples,
        structuralFirstSamples: Number(structuralFirst?.totalSamples || 0),
        structuralPrizePresenceSamples: Number(structuralPrizePresence?.totalSamples || 0),
        duplicationSamples: Number(duplication?.totalSamples || 0),
        memoryMatchedSamples: Number(memoryOut?.matchedSamples || 0),
        memoryTotalWeight: Number(memoryOut?.totalWeight || 0),
        pairSamples: Number(pairOut?.samples || 0),
        pairWeightedSamples: Number(pairOut?.weightedSamples || 0),
        pairExactDomSamples: Number(pairOut?.exactDomSamples || 0),
        pairConfidence,
        currentState,
        targetDow,
        targetDayOfMonth,
        prevHour: lastH,
        prevGrupo: Number(prevGrupo),
        dayContextTotal: Number(dayContext?.total || 0),
        dayFlowConfidence,
        allLayers: (layerOut?.layers || []).map((layer) => ({
          key: layer.key,
          label: layer.label,
          samples: layer.samples,
          minSamples: layer.minSamples,
        })),
      },
    },
  };
}


/* =========================
   Motor principal V3 (ESTATISTICO AUDITAVEL)
========================= */

function incMap(map, key, value = 1) {
  const k = Number(key);
  if (!Number.isFinite(k) || k < 1 || k > TOP3_GROUPS_K) return;
  map.set(k, Number(map.get(k) || 0) + Number(value || 0));
}

function emptyGroupMap() {
  const out = new Map();
  for (let g = 1; g <= safeInt(TOP3_GROUPS_K, 25); g += 1) out.set(g, 0);
  return out;
}

function getPrizePresenceGroupSet(draw) {
  return new Set(
    getAllPrizePresenceGroups(draw)
      .map((x) => Number(x.grupo))
      .filter((g) => Number.isFinite(g) && g >= 1 && g <= TOP3_GROUPS_K)
  );
}

function layerProbability(freqMap, samples, alpha = TOP3_SMOOTH_ALPHA) {
  const out = new Map();
  const k = safeInt(TOP3_GROUPS_K, 25);
  const a = Math.max(0, Number(alpha || 0));
  const base = Math.max(0, Number(samples || 0));
  const denom = Math.max(1, base + (a * k));

  for (let g = 1; g <= k; g += 1) {
    const count = Math.max(0, Number(freqMap?.get?.(g) || 0));
    out.set(g, (count + a) / denom);
  }

  return out;
}

function sampleConfidence(samples, fullAt = 30) {
  const n = Number(samples || 0);
  const lim = Math.max(1, Number(fullAt || 30));
  return Math.max(0, Math.min(1, n / lim));
}

export function computeStatisticalTop3V3({
  lotteryKey,
  drawsRange,
  drawLast,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  topN = 3,
  targetYmdOverride = "",
  targetHourOverride = "",
  drawsAlreadySorted = false,
}) {
  const sourceList =
    Array.isArray(drawsRange)
      ? drawsRange
      : [];

  const list = drawsAlreadySorted
    ? sourceList
    : sortDrawsAsc(sourceList);
  if (!list.length || !drawLast) return { top: [], meta: null };

  const key = safeStr(lotteryKey).toUpperCase();

  const lastY = pickDrawYMD(drawLast);
  const lastH = toHourBucket(pickDrawHour(drawLast));
  const prevGrupo = getFirstGrupoFromDraw(drawLast);

  if (
    !isYMD(lastY) ||
    !lastH ||
    !Number.isFinite(Number(prevGrupo)) ||
    Number(prevGrupo) < 1 ||
    Number(prevGrupo) > TOP3_GROUPS_K
  ) {
    return { top: [], meta: null };
  }

  const nextSlot = getNextSlotForLottery({
    lotteryKey: key,
    ymd: lastY,
    hourBucket: lastH,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });

  const forcedTargetY = safeStr(targetYmdOverride);
  const forcedTargetH = toHourBucket(targetHourOverride);

  const targetY = isYMD(forcedTargetY) && forcedTargetH
    ? forcedTargetY
    : safeStr(nextSlot?.ymd);

  const targetH = isYMD(forcedTargetY) && forcedTargetH
    ? forcedTargetH
    : toHourBucket(nextSlot?.hour);
  const targetDow = getDowKey(targetY);
  const targetDayOfMonth = getDayOfMonth(targetY);
  const targetTs = ymdHourToTs(targetY, targetH);

  if (!isYMD(targetY) || !targetH || !Number.isFinite(Number(targetDow))) {
    return { top: [], meta: null };
  }

  const history = list.filter((d) => {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    const ts = ymdHourToTs(y, h);
    return isYMD(y) && h && Number.isFinite(ts) && ts < targetTs;
  });

  const layers = {
    hour: { label: `frequência no horário ${targetH}`, samples: 0, first: emptyGroupMap(), prizePresence: emptyGroupMap(), weight: 0.33 },
    dowHour: { label: `frequência no dia da semana + horário`, samples: 0, first: emptyGroupMap(), prizePresence: emptyGroupMap(), weight: 0.27 },
    dayMonth: { label: `frequência no dia ${String(targetDayOfMonth).padStart(2, "0")}`, samples: 0, first: emptyGroupMap(), prizePresence: emptyGroupMap(), weight: 0.04 },
    transition: { label: `transição G${String(prevGrupo).padStart(2, "0")} @ ${lastH} → ${targetH}`, samples: 0, first: emptyGroupMap(), prizePresence: emptyGroupMap(), weight: 0.26 },
    recent: { label: `recência comparável`, samples: 0, first: emptyGroupMap(), prizePresence: emptyGroupMap(), weight: 0.10 },
  };

  for (const d of history) {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    const dow = getDowKey(y);
    const dom = getDayOfMonth(y);
    const g1 = getFirstGrupoFromDraw(d);
    const prizePresenceSet = getPrizePresenceGroupSet(d);

    const addToLayer = (layer) => {
      layer.samples += 1;
      incMap(layer.first, g1, 1);
      for (const g of prizePresenceSet) incMap(layer.prizePresence, g, 1);
    };

    if (h === targetH) addToLayer(layers.hour);
    if (h === targetH && Number(dow) === Number(targetDow)) addToLayer(layers.dowHour);
    if (Number(dom) === Number(targetDayOfMonth)) addToLayer(layers.dayMonth);
  }

  const indexed = indexDrawsByYmdHour(history);

  for (const prev of history) {
    const py = pickDrawYMD(prev);
    const ph = toHourBucket(pickDrawHour(prev));
    const pg = getFirstGrupoFromDraw(prev);

    if (!isYMD(py) || !ph || Number(pg) !== Number(prevGrupo)) continue;

    const ns = getNextSlotForLottery({
      lotteryKey: key,
      ymd: py,
      hourBucket: ph,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });

    if (toHourBucket(ns?.hour) !== targetH) continue;
    if (ph !== lastH) continue;

    const nextDraw = indexed.get(`${safeStr(ns?.ymd)}|${toHourBucket(ns?.hour)}`) || null;
    if (!nextDraw) continue;

    const g1 = getFirstGrupoFromDraw(nextDraw);
    const prizePresenceSet = getPrizePresenceGroupSet(nextDraw);

    layers.transition.samples += 1;
    incMap(layers.transition.first, g1, 1);
    for (const g of prizePresenceSet) incMap(layers.transition.prizePresence, g, 1);
  }

  const recentComparable = history
    .filter((d) => {
      const y = pickDrawYMD(d);
      const h = toHourBucket(pickDrawHour(d));
      return h === targetH && Number(getDowKey(y)) === Number(targetDow);
    })
    .slice(-20);

  for (const d of recentComparable) {
    const g1 = getFirstGrupoFromDraw(d);
    const prizePresenceSet = getPrizePresenceGroupSet(d);

    layers.recent.samples += 1;
    incMap(layers.recent.first, g1, 1);
    for (const g of prizePresenceSet) incMap(layers.recent.prizePresence, g, 1);
  }

  const currentScene = buildSceneFromDraw(drawLast);
  const sceneRanking = buildHistoricalSceneRanking(history, currentScene, 80);
  const sceneHypothesis = buildSceneHypothesisDistribution(sceneRanking, TOP3_GROUPS_K);
  const sceneWeight =
    sampleConfidence(sceneHypothesis?.samples || 0, TOP3_SCENE_SAMPLE_TARGET) *
    TOP3_SCENE_WEIGHT;


  const activeWeights = {};
  let totalWeight = 0;

  for (const [keyLayer, layer] of Object.entries(layers)) {
    const conf =
      keyLayer === "transition"
        ? sampleConfidence(layer.samples, 8)
        : keyLayer === "recent"
          ? sampleConfidence(layer.samples, 12)
          : sampleConfidence(layer.samples, 30);

    const w = layer.samples > 0 ? layer.weight * conf : 0;
    activeWeights[keyLayer] = w;
    totalWeight += w;
  }

  if (totalWeight <= 0) {
    activeWeights.hour = 1;
    totalWeight = 1;
  }

  for (const keyLayer of Object.keys(activeWeights)) {
    activeWeights[keyLayer] = activeWeights[keyLayer] / totalWeight;
  }

  const ranked = Array.from({ length: safeInt(TOP3_GROUPS_K, 25) }, (_, idx) => {
    const grupo = idx + 1;

    let scoreProb = 0;
    const details = {};

    for (const [keyLayer, layer] of Object.entries(layers)) {
      const pFirst = Number(layerProbability(layer.first, layer.samples).get(grupo) || 0);
      const pPrizePresence = Number(layerProbability(layer.prizePresence, layer.samples).get(grupo) || 0);

      const pLayer = (pFirst * 0.92) + (pPrizePresence * 0.08);
      const w = Number(activeWeights[keyLayer] || 0);

      scoreProb += pLayer * w;

      details[keyLayer] = {
        label: layer.label,
        samples: layer.samples,
        firstCount: Number(layer.first.get(grupo) || 0),
        top3Count: Number(layer.prizePresence.get(grupo) || 0),
        probability: pLayer,
        weight: w,
      };
    }

    const pSceneRaw = Number(sceneHypothesis?.prob?.get?.(grupo) || 0);
    const pScene =
      (pSceneRaw * TOP3_SCENE_BLEND_SCENE) +
      ((1 / TOP3_GROUPS_K) * TOP3_SCENE_BLEND_UNIFORM);

    if (sceneWeight > 0) {
      scoreProb = (scoreProb * (1 - sceneWeight)) + (pScene * sceneWeight);
    }

    details.scene = {
      label: "analogia histórica de cena",
      samples: Number(sceneHypothesis?.samples || 0),
      firstCount: Number(sceneHypothesis?.freq?.get?.(grupo) || 0),
      top3Count: 0,
      probability: pScene,
      weight: sceneWeight,
    };

    return {
      grupo,
      scoreProb,
      score: scoreProb * 1000,
      details,
    };
  })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.grupo - b.grupo;
    })
    .slice(0, Math.max(1, Number(topN || 3)));

  const rankedScored = scoreRanking(
    ranked,
    {
      lotteryKey,
      targetYmd: targetY,
      targetHour: targetH,
      previousGroup: prevGrupo,
      totalDraws: history.length,
    }
  );

  const top = rankedScored.map((x, idx) => {
    const g2 = String(x.grupo).padStart(2, "0");
    const rawScoreProb = Number(x.scoreProb || 0);

    const strongest = Object.values(x.details)
      .filter((d) => Number(d.probability || 0) > 0)
      .sort((a, b) => (b.probability * b.weight) - (a.probability * a.weight))
      .slice(0, 3);

    return {
      rank: idx + 1,
      title:
        idx === 0
          ? "Mais provável"
          : idx === 1
            ? "2º mais provável"
            : "3º mais provável",
      grupo: x.grupo,
      scoreProb: Number(rawScoreProb || 0),
      rawScoreProb: Number(rawScoreProb || 0),
      probCond: Number(x.details.transition?.probability || 0),
      probBase: Number(x.details.hour?.probability || 0),
      lateBonus: 0,
      freq: Number(x.details.hour?.firstCount || 0),
      freqCond: Number(x.details.transition?.firstCount || 0),
      freqBase: Number(x.details.hour?.firstCount || 0),
      freqZeroWhy: "",
      reasons: [
        `Motor: V3_STATISTICAL`,
        `Alvo: ${targetY} ${targetH} | DOW=${targetDow} | dia=${String(targetDayOfMonth).padStart(2, "0")}`,
        `Base: G${String(prevGrupo).padStart(2, "0")} @ ${lastH}`,
        `Probabilidade final G${g2}: ${(Number(rawScoreProb || 0) * 100).toFixed(2)}%`,
        ...strongest.map((d) =>
          `${d.label}: ${d.firstCount}x em 1º | ${d.top3Count}x no TOP3 | amostras=${d.samples} | peso=${(d.weight * 100).toFixed(0)}%`
        ),
      ],
      meta: {
        trigger: {
          ymd: lastY,
          hour: lastH,
          grupo: Number(prevGrupo),
        },
        next: {
          ymd: safeStr(targetY),
          hour: safeStr(targetH),
        },
        samples: history.length,
        period: {
          from: pickDrawYMD(history[0]) || "",
          to: pickDrawYMD(history[history.length - 1]) || "",
        },
        scenario: "V3_STATISTICAL",
        explain: {
          engine: "V3_STATISTICAL",
          targetDow,
          targetDayOfMonth,
          prevHour: lastH,
          prevGrupo: Number(prevGrupo),
          activeWeights,
          scene: {
            samples: Number(sceneHypothesis?.samples || 0),
            totalWeight: Number(sceneHypothesis?.totalWeight || 0),
            weight: Number(sceneWeight || 0),
            currentSignature: currentScene?.signature || "",
          },
          layers: Object.fromEntries(
            Object.entries(layers).map(([k, v]) => [
              k,
              {
                label: v.label,
                samples: v.samples,
                weight: activeWeights[k],
              },
            ])
          ),
          details: x.details,
        },
      },
    };
  });

  return {
    top,
    meta: {
      trigger: {
        ymd: lastY,
        hour: lastH,
        grupo: Number(prevGrupo),
      },
      next: {
        ymd: safeStr(targetY),
        hour: safeStr(targetH),
      },
      samples: history.length,
      scenario: "V3_STATISTICAL",
      explain: {
        engine: "V3_STATISTICAL",
        targetDow,
        targetDayOfMonth,
        prevHour: lastH,
        prevGrupo: Number(prevGrupo),
        activeWeights,
        layers: Object.fromEntries(
          Object.entries(layers).map(([k, v]) => [
            k,
            {
              label: v.label,
              samples: v.samples,
              weight: activeWeights[k],
            },
          ])
        ),
      },
    },
  };
}



/* =========================
   TOP3 SCENE READER
========================= */

function scenePickMilhar4(prize) {
  const candidates = [
    prize?.milhar,
    prize?.milhar4,
    prize?.numero,
    prize?.number,
    prize?.value,
    prize?.result,
    prize?.resultado,
    prize?.premio,
  ];

  for (const v of candidates) {
    const dig = String(v ?? "").replace(/\D+/g, "");
    if (dig) return dig.length >= 4 ? dig.slice(-4) : dig.padStart(4, "0");
  }

  return "";
}

function sceneGrupoFromMilhar4(m4) {
  const s = String(m4 || "").replace(/\D+/g, "").padStart(4, "0").slice(-4);
  if (!/^\d{4}$/.test(s)) return null;

  const dzRaw = Number(s.slice(-2));
  if (!Number.isFinite(dzRaw)) return null;

  const dz = dzRaw === 0 ? 100 : dzRaw;
  const grupo = Math.ceil(dz / 4);

  return grupo >= 1 && grupo <= 25 ? grupo : null;
}

function buildSceneFromDraw(draw) {
  const prizes = Array.isArray(draw?.prizes) ? draw.prizes : [];

  const rows = prizes
    .map((p) => {
      const pos = Number(guessPrizePos(p));
      const milhar = scenePickMilhar4(p);
      const grupo = sceneGrupoFromMilhar4(milhar);

      return {
        pos,
        milhar: String(milhar || "").replace(/\D+/g, "").padStart(4, "0").slice(-4),
        centena: getCentena3(milhar),
        dezena: getDezena2(milhar),
        grupo,
      };
    })
    .filter((x) => Number.isFinite(x.pos) && x.pos >= 1 && x.pos <= 7)
    .sort((a, b) => a.pos - b.pos);

  const grupos = rows.map((x) => x.grupo).filter((x) => Number.isFinite(x));
  const dezenas = rows.map((x) => x.dezena).filter(Boolean);
  const centenas = rows.map((x) => x.centena).filter(Boolean);
  const milhares = rows.map((x) => x.milhar).filter(Boolean);

  const countMap = (arr) => {
    const m = new Map();
    for (const x of arr) m.set(String(x), (m.get(String(x)) || 0) + 1);
    return Array.from(m.entries())
      .filter(([, n]) => n > 1)
      .map(([value, count]) => ({ value, count }));
  };

  return {
    ymd: pickDrawYMD(draw),
    hour: toHourBucket(pickDrawHour(draw)),
    firstGrupo: grupos[0] ?? null,
    grupos,
    dezenas,
    centenas,
    milhares,
    repeatedGroups: countMap(grupos),
    repeatedDezenas: countMap(dezenas),
    repeatedCentenas: countMap(centenas),
    rows,
    signature: grupos.map((g) => String(g).padStart(2, "0")).join("-"),
  };
}



function compareScenes(a, b, explain = false) {
  if (!a || !b) return explain ? { score: 0, details: {} } : 0;

  let score = 0;
  const details = {};

  const add = (key, value) => {
    if (!value) return;
    score += value;
    details[key] = value;
  };

  const ag = Array.isArray(a.grupos) ? a.grupos : [];
  const bg = Array.isArray(b.grupos) ? b.grupos : [];

  const ad = Array.isArray(a.dezenas) ? a.dezenas : [];
  const bd = Array.isArray(b.dezenas) ? b.dezenas : [];

  const ac = Array.isArray(a.centenas) ? a.centenas : [];
  const bc = Array.isArray(b.centenas) ? b.centenas : [];

  if (Number(a.firstGrupo) === Number(b.firstGrupo))
    add("firstGrupo",45);

  for (let i = 0; i < Math.min(ag.length,bg.length,7); i++) {
    if (Number(ag[i]) === Number(bg[i]))
      add("order_"+i, i===0 ? 20 : 10);
  }

  add(
    "groupOverlap",
    new Set(ag.filter(g => bg.includes(g))).size * 6
  );

  add(
    "dezenaOverlap",
    new Set(ad.filter(d => bd.includes(d))).size * 3
  );

  add(
    "centenaOverlap",
    new Set(ac.filter(c => bc.includes(c))).size * 1.5
  );

  const repA = Array.isArray(a.repeatedGroups) ? a.repeatedGroups.length : 0;
  const repB = Array.isArray(b.repeatedGroups) ? b.repeatedGroups.length : 0;

  if (repA > 0 && repB > 0)
    add("repeatExists",8);

  if (repA === repB && repA > 0)
    add("repeatEqual",6);

  if (String(a.signature||"") === String(b.signature||""))
    add("signature",60);

  if (a.hour === b.hour)
    add("hour",8);

  return explain ? { score, details } : score;
}




function buildHistoricalSceneRanking(draws, currentScene, limit = 100) {
  const list = Array.isArray(draws) ? draws : [];
  if (!currentScene) return [];

  const ordered = list
    .map((draw) => ({
      draw,
      scene: buildSceneFromDraw(draw),
    }))
    .filter((x) => x.scene)
    .sort((a, b) => {
      const ta = ymdHourToTs(a.scene?.ymd, a.scene?.hour);
      const tb = ymdHourToTs(b.scene?.ymd, b.scene?.hour);
      return Number(ta || 0) - Number(tb || 0);
    });

  return ordered
    .map((item, idx) => {
      const next = ordered[idx + 1] || null;
      const score = compareScenes(currentScene, item.scene);

      return {
        draw: item.draw,
        scene: item.scene,
        nextDraw: next?.draw || null,
        nextScene: next?.scene || null,
        score,
      };
    })
    .filter((x) => x.scene && x.nextDraw && Number(x.score) > 0)
    .sort((a, b) => {
      if (Number(b.score) !== Number(a.score)) {
        return Number(b.score) - Number(a.score);
      }

      const ta = ymdHourToTs(a.scene?.ymd, a.scene?.hour);
      const tb = ymdHourToTs(b.scene?.ymd, b.scene?.hour);
      return Number(tb || 0) - Number(ta || 0);
    })
    .slice(0, Math.max(1, Number(limit || 100)));
}




function buildSceneHypothesisDistribution(sceneRanking, groupsK = TOP3_GROUPS_K) {
  const ranking = Array.isArray(sceneRanking) ? sceneRanking : [];
  const k = safeInt(groupsK, 25);

  const freq = new Map();
  for (let g = 1; g <= k; g += 1) freq.set(g, 0);

  let totalWeight = 0;

  for (const item of ranking) {
    const score = Math.max(0, Number(item?.score || 0));
    const nextGrupo = Number(item?.nextDraw ? pickPrize1GrupoFromDraw(item.nextDraw) : null);

    if (!Number.isFinite(nextGrupo) || nextGrupo < 1 || nextGrupo > k) continue;
    if (score <= 0) continue;

    freq.set(nextGrupo, Number(freq.get(nextGrupo) || 0) + score);
    totalWeight += score;
  }

  const prob = new Map();
  for (let g = 1; g <= k; g += 1) {
    prob.set(g, totalWeight > 0 ? Number(freq.get(g) || 0) / totalWeight : 0);
  }

  return {
    freq,
    prob,
    samples: ranking.length,
    totalWeight,
  };
}


/* =========================
   16/20 milhares (por grupo) — POR TERMINAÇÃO (CORRETO)
========================= */

function getDezenasFixasFromGrupo(grupo2) {
  const g = Number(grupo2);
  if (!Number.isFinite(g) || g < 1 || g > 25) return [];

  const start = (g - 1) * 4 + 1;
  const out = [];

  for (let i = 0; i < 4; i += 1) {
    out.push(wrapToDezena2(start + i));
  }

  return out.filter(Boolean);
}


export function buildMilharesForGrupo({
  rangeDraws,
  analysisHourBucket,
  schedule,
  grupo2,
  count = 20,
  targetYmd = "",
}) {
  const list = Array.isArray(rangeDraws) ? rangeDraws : [];
  const target = toHourBucket(analysisHourBucket);
  const schSet = scheduleSet(schedule);
  const targetDay = safeStr(targetYmd);
  const targetDow = isYMD(targetDay) ? getDowKey(targetDay) : null;

  const N = Number.isFinite(Number(count))
    ? Math.max(4, Math.trunc(Number(count)))
    : 20;

  const grupoNum = Number(grupo2);

  if (!Number.isFinite(grupoNum) || grupoNum < 1 || grupoNum > 25 || !list.length) {
    return { dezenas: [], slots: [] };
  }

  const dezenasFixas = getDezenasFixasFromGrupo(grupoNum);
  if (!dezenasFixas.length) return { dezenas: [], slots: [] };

  const perDezena = Math.max(1, Math.ceil(N / dezenasFixas.length));
  const byMilhar = new Map();

  for (const d of list) {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    if (!h) continue;

    const isTargetHour = target && h === target;
    const isScheduleHour = schSet.size && schSet.has(h);
    const isSameDow = targetDow !== null && Number(getDowKey(y)) === Number(targetDow);
    const ts = ymdHourToTs(y, h);

    const ps = Array.isArray(d?.prizes) ? d.prizes : [];

    for (const prize of ps) {
      const pos = Number(guessPrizePos(prize));
      if (!Number.isFinite(pos) || pos < 1 || pos > 7) continue;

      const g = Number(guessPrizeGrupo(prize));
      if (g !== grupoNum) continue;

      const m4 = String(pickPrizeMilhar4(prize) || "").replace(/\D+/g, "").padStart(4, "0").slice(-4);
      if (!/^\d{4}$/.test(m4)) continue;

      const dz = getDezena2(m4);
      const c3 = getCentena3(m4);

      if (!dz || !c3 || !dezenasFixas.includes(dz)) continue;

      const current = byMilhar.get(m4) || {
        milhar: m4,
        dezena: dz,
        centena: c3,
        freq: 0,
        score: 0,
        targetHits: 0,
        scheduleHits: 0,
        sameDowHits: 0,
        firstPrizeHits: 0,
        lastTs: 0,
      };

      let inc = 1;

      if (isTargetHour) {
        inc += 8;
        current.targetHits += 1;
      }

      if (isScheduleHour) {
        inc += 3;
        current.scheduleHits += 1;
      }

      if (isSameDow) {
        inc += 2;
        current.sameDowHits += 1;
      }

      if (pos === 1) {
        inc += 3;
        current.firstPrizeHits += 1;
      } else if (pos <= 3) {
        inc += 1;
      }

      current.freq += 1;
      current.score += inc;

      if (Number.isFinite(ts)) {
        current.lastTs = Math.max(Number(current.lastTs || 0), ts);
      }

      byMilhar.set(m4, current);
    }
  }

  const ranked = Array.from(byMilhar.values())
    .map((m) => {
      const freq = Number(m.freq || 0);
      const targetHits = Number(m.targetHits || 0);
      const scheduleHits = Number(m.scheduleHits || 0);
      const sameDowHits = Number(m.sameDowHits || 0);
      const firstPrizeHits = Number(m.firstPrizeHits || 0);
      const recencyBoost = Number(m.lastTs || 0) > 0 ? 1 : 0;

      return {
        ...m,
        score:
          freq * 100 +
          targetHits * 70 +
          scheduleHits * 35 +
          sameDowHits * 25 +
          firstPrizeHits * 45 +
          recencyBoost * 5,
      };
    })
    .sort((a, b) => {
      if (Number(b.score) !== Number(a.score)) return Number(b.score) - Number(a.score);
      if (Number(b.targetHits) !== Number(a.targetHits)) return Number(b.targetHits) - Number(a.targetHits);
      if (Number(b.freq) !== Number(a.freq)) return Number(b.freq) - Number(a.freq);
      if (Number(b.lastTs) !== Number(a.lastTs)) return Number(b.lastTs) - Number(a.lastTs);
      return milharCompareAsc(a.milhar, b.milhar);
    });

  const centenaStats = new Map();

  for (const item of ranked) {
    const centena = String(item?.centena || "").trim();
    if (!centena) continue;

    const current = centenaStats.get(centena) || {
      centena,
      freq: 0,
      score: 0,
      targetHits: 0,
      sameDowHits: 0,
      firstPrizeHits: 0,
      lastTs: 0,
    };

    current.freq += Number(item.freq || 0);
    current.score += Number(item.score || 0);
    current.targetHits += Number(item.targetHits || 0);
    current.sameDowHits += Number(item.sameDowHits || 0);
    current.firstPrizeHits += Number(item.firstPrizeHits || 0);
    current.lastTs = Math.max(Number(current.lastTs || 0), Number(item.lastTs || 0));

    centenaStats.set(centena, current);
  }

  const centenaScoreMap = new Map();

  for (const c of centenaStats.values()) {
    centenaScoreMap.set(
      c.centena,
      Number(c.score || 0) +
        Number(c.freq || 0) * 25 +
        Number(c.targetHits || 0) * 60 +
        Number(c.sameDowHits || 0) * 30 +
        Number(c.firstPrizeHits || 0) * 40 +
        (Number(c.lastTs || 0) > 0 ? 10 : 0)
    );
  }

  const usedMilhares = new Set();
  const slots = [];

  function pickDiversifiedMilharesForDezena(dz, limit) {
    const candidates = ranked
      .filter((x) => x.dezena === dz && !usedMilhares.has(x.milhar))
      .map((x) => {
        const milhar = String(x.milhar || "").padStart(4, "0").slice(-4);
        const prefix = milhar.slice(0, 1);
        const centena = milhar.slice(1);
        const centenaScore = Number(centenaScoreMap.get(centena) || 0);

        return {
          ...x,
          milhar,
          prefix,
          centena,
          centenaScore,
          adjustedScore:
            centenaScore * 2 +
            Number(x.score || 0) -
            (prefix === "0" ? 80 : 0),
        };
      });

    const byCentena = new Map();

    for (const item of candidates) {
      if (!byCentena.has(item.centena)) byCentena.set(item.centena, []);
      byCentena.get(item.centena).push(item);
    }

    const centenaGroups = Array.from(byCentena.entries())
      .map(([centena, items]) => {
        const sortedItems = items.slice().sort((a, b) => {
          if (Number(b.adjustedScore) !== Number(a.adjustedScore)) {
            return Number(b.adjustedScore) - Number(a.adjustedScore);
          }
          if (Number(b.score) !== Number(a.score)) return Number(b.score) - Number(a.score);
          if (Number(b.targetHits) !== Number(a.targetHits)) return Number(b.targetHits) - Number(a.targetHits);
          if (Number(b.freq) !== Number(a.freq)) return Number(b.freq) - Number(a.freq);
          return milharCompareAsc(a.milhar, b.milhar);
        });

        const top = sortedItems[0] || {};

        return {
          centena,
          centenaScore: Number(top.centenaScore || 0),
          bestScore: Number(top.adjustedScore || 0),
          items: sortedItems,
        };
      })
      .sort((a, b) => {
        if (Number(b.centenaScore) !== Number(a.centenaScore)) {
          return Number(b.centenaScore) - Number(a.centenaScore);
        }
        if (Number(b.bestScore) !== Number(a.bestScore)) {
          return Number(b.bestScore) - Number(a.bestScore);
        }
        return String(a.centena).localeCompare(String(b.centena));
      });

    const picked = [];
    const usedPrefixes = new Set();
    const usedCentenas = new Set();

    // Fase 1: uma melhor milhar por centena forte, evitando repetir prefixo.
    for (const group of centenaGroups) {
      if (picked.length >= limit) break;

      const item = group.items.find((x) => !usedPrefixes.has(x.prefix));
      if (!item) continue;

      picked.push(item);
      usedPrefixes.add(item.prefix);
      usedCentenas.add(item.centena);
    }

    // Fase 2: se faltar, pega novas centenas fortes mesmo repetindo prefixo.
    for (const group of centenaGroups) {
      if (picked.length >= limit) break;
      if (usedCentenas.has(group.centena)) continue;

      const item = group.items.find((x) => !picked.some((p) => p.milhar === x.milhar));
      if (!item) continue;

      picked.push(item);
      usedPrefixes.add(item.prefix);
      usedCentenas.add(item.centena);
    }

    // Fase 3: se ainda faltar, permite mais de uma milhar da mesma centena.
    for (const group of centenaGroups) {
      if (picked.length >= limit) break;

      for (const item of group.items) {
        if (picked.length >= limit) break;
        if (picked.some((p) => p.milhar === item.milhar)) continue;

        picked.push(item);
      }
    }

    return picked.slice(0, limit);
  }

  for (const dz of dezenasFixas) {
    const items = pickDiversifiedMilharesForDezena(dz, perDezena);

    let pushed = 0;

    for (const item of items) {
      usedMilhares.add(item.milhar);
      slots.push({
        dezena: dz,
        milhar: item.milhar,
        score: item.score,
        adjustedScore: item.adjustedScore,
        centena: item.centena,
        centenaScore: item.centenaScore,
        freq: item.freq,
        targetHits: item.targetHits,
        scheduleHits: item.scheduleHits,
        sameDowHits: item.sameDowHits,
        firstPrizeHits: item.firstPrizeHits,
      });
      pushed += 1;
    }

    while (pushed < perDezena) {
      slots.push({ dezena: dz, milhar: "" });
      pushed += 1;
    }
  }

  while (slots.length < N) slots.push({ dezena: "", milhar: "" });

  return { dezenas: dezenasFixas, slots: slots.slice(0, N) };
}

export function build16MilharesForGrupo(args) {
  return buildMilharesForGrupo({ ...(args || {}), count: 16 });
}

export function build20MilharesForGrupo(args) {
  return buildMilharesForGrupo({ ...(args || {}), count: 20 });
}

/* =========================
   TIMELINE DO DIA (CADEIA PREDITIVA)
========================= */



export function auditTop3Timeline({
  timeline,
  lotteryKey = "",
}) {
  const rows = Array.isArray(timeline) ? timeline : [];

  const validated = rows.filter((slot) => {
    const status = String(slot?.status || "").toLowerCase();

    return (
      status === "validated" &&
      Number.isFinite(Number(slot?.resultGrupo))
    );
  });

  function pct(n, d) {
    if (!d) return 0;

    return Number(
      ((Number(n || 0) / Number(d || 1)) * 100).toFixed(2)
    );
  }

  function normalizeResultTop3(slot) {
    const source = Array.isArray(slot?.resultTop3Groups)
      ? slot.resultTop3Groups
      : [];

    const normalized = source
      .slice(0, 3)
      .map((grupo) => {
        const value = Number(grupo);

        return Number.isFinite(value) &&
          value >= 1 &&
          value <= TOP3_GROUPS_K
          ? value
          : null;
      });

    while (normalized.length < 3) {
      normalized.push(null);
    }

    if (!Number.isFinite(Number(normalized[0]))) {
      const fallback = Number(slot?.resultGrupo);

      normalized[0] =
        Number.isFinite(fallback) &&
        fallback >= 1 &&
        fallback <= TOP3_GROUPS_K
          ? fallback
          : null;
    }

    return normalized;
  }

  function evaluateSlot(slot) {
    const picks = (Array.isArray(slot?.top3) ? slot.top3 : [])
      .slice(0, 3)
      .map((item) => Number(item?.grupo))
      .filter(
        (grupo) =>
          Number.isFinite(grupo) &&
          grupo >= 1 &&
          grupo <= TOP3_GROUPS_K
      );

    const resultTop3 = normalizeResultTop3(slot);
    const resultGrupo = Number(resultTop3[0]);

    const top1Hit =
      picks.length > 0 &&
      Number.isFinite(resultGrupo) &&
      Number(picks[0]) === resultGrupo;

    const top3Hit =
      Number.isFinite(resultGrupo) &&
      picks.some(
        (grupo) => Number(grupo) === resultGrupo
      );

    const prizePositionHits = resultTop3.map(
      (grupo) =>
        Number.isFinite(Number(grupo)) &&
        picks.some(
          (pick) => Number(pick) === Number(grupo)
        )
    );

    const predictionHits = picks.map((grupo) =>
      resultTop3.some(
        (result) =>
          Number.isFinite(Number(result)) &&
          Number(result) === Number(grupo)
      )
    );

    const matchedPrizePositions =
      prizePositionHits.filter(Boolean).length;

    const matchedPredictions =
      predictionHits.filter(Boolean).length;

    return {
      picks,
      resultTop3,
      resultGrupo,

      top1Hit,
      top3Hit,

      prize1Hit: Boolean(prizePositionHits[0]),
      prize2Hit: Boolean(prizePositionHits[1]),
      prize3Hit: Boolean(prizePositionHits[2]),

      top3PrizeHit: matchedPrizePositions > 0,

      matchedPrizePositions,
      matchedPredictions,

      prizePositionHits,
      predictionHits,
    };
  }

  const evaluated = validated.map((slot) => ({
    slot,
    metrics: evaluateSlot(slot),
  }));

  function summarize(items) {
    const summary = {
      total: items.length,

      top1Hits: 0,
      top3Hits: 0,

      prize1Hits: 0,
      prize2Hits: 0,
      prize3Hits: 0,

      top3PrizeHits: 0,

      matchedPrizePositions: 0,
      matchedPredictions: 0,
    };

    for (const item of items) {
      const metrics = item.metrics;

      if (metrics.top1Hit) summary.top1Hits += 1;
      if (metrics.top3Hit) summary.top3Hits += 1;

      if (metrics.prize1Hit) summary.prize1Hits += 1;
      if (metrics.prize2Hit) summary.prize2Hits += 1;
      if (metrics.prize3Hit) summary.prize3Hits += 1;

      if (metrics.top3PrizeHit) {
        summary.top3PrizeHits += 1;
      }

      summary.matchedPrizePositions +=
        Number(metrics.matchedPrizePositions || 0);

      summary.matchedPredictions +=
        Number(metrics.matchedPredictions || 0);
    }

    return {
      ...summary,

      top1Rate: pct(summary.top1Hits, summary.total),
      top3Rate: pct(summary.top3Hits, summary.total),

      prize1Rate: pct(summary.prize1Hits, summary.total),
      prize2Rate: pct(summary.prize2Hits, summary.total),
      prize3Rate: pct(summary.prize3Hits, summary.total),

      top3PrizeRate: pct(
        summary.top3PrizeHits,
        summary.total
      ),

      averageMatchedPrizePositions: summary.total
        ? Number(
            (
              summary.matchedPrizePositions /
              summary.total
            ).toFixed(4)
          )
        : 0,

      averageMatchedPredictions: summary.total
        ? Number(
            (
              summary.matchedPredictions /
              summary.total
            ).toFixed(4)
          )
        : 0,
    };
  }

  function groupBy(keyFn) {
    const map = new Map();

    for (const item of evaluated) {
      const key = keyFn(item.slot);

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key).push(item);
    }

    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        ...summarize(items),
      }))
      .sort((a, b) => {
        if (b.top3PrizeRate !== a.top3PrizeRate) {
          return b.top3PrizeRate - a.top3PrizeRate;
        }

        if (b.top3Rate !== a.top3Rate) {
          return b.top3Rate - a.top3Rate;
        }

        return b.total - a.total;
      });
  }

  const summary = summarize(evaluated);

  return {
    lotteryKey,
    ...summary,

    byHour: groupBy(
      (slot) => String(slot?.targetHour || "")
    ),

    byDate: groupBy(
      (slot) => String(slot?.targetYmd || "")
    ),

    rows: evaluated.map(({ slot, metrics }) => ({
      ymd: slot.targetYmd,
      hour: slot.targetHour,

      baseYmd: slot.baseYmd,
      baseHour: slot.baseHour,

      resultGrupo: metrics.resultGrupo,
      resultTop3: metrics.resultTop3,

      top3: metrics.picks,

      top1Hit: metrics.top1Hit,
      top3Hit: metrics.top3Hit,

      prize1Hit: metrics.prize1Hit,
      prize2Hit: metrics.prize2Hit,
      prize3Hit: metrics.prize3Hit,

      top3PrizeHit: metrics.top3PrizeHit,

      matchedPrizePositions:
        metrics.matchedPrizePositions,

      matchedPredictions:
        metrics.matchedPredictions,

      prizePositionHits:
        metrics.prizePositionHits,

      predictionHits:
        metrics.predictionHits,

      historyStats: slot.historyStats || null,
    })),
  };
}


function buildTimelineForDate({
  ymd,
  drawsToday,
  drawsRange,
  lotteryKey,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
}) {
  const targetYmd = safeStr(ymd);
  const day = Array.isArray(drawsToday) ? [...drawsToday] : [];
  const range = Array.isArray(drawsRange) ? [...drawsRange] : [];

  if (!isYMD(targetYmd) || !range.length) return [];

  const schedule = getScheduleForLottery({
    lotteryKey,
    ymd: targetYmd,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });

  const normalizedSchedule = (Array.isArray(schedule) ? schedule : [])
    .map(toHourBucket)
    .filter(Boolean);

  if (!normalizedSchedule.length) return [];

  const daySorted = day
    .filter((d) => isYMD(pickDrawYMD(d)) && toHourBucket(pickDrawHour(d)))
    .sort((a, b) => {
      const ta = ymdHourToTs(pickDrawYMD(a), toHourBucket(pickDrawHour(a)));
      const tb = ymdHourToTs(pickDrawYMD(b), toHourBucket(pickDrawHour(b)));
      return ta - tb;
    });

  const rangeSorted = range
    .filter((d) => isYMD(pickDrawYMD(d)) && toHourBucket(pickDrawHour(d)))
    .sort((a, b) => {
      const ta = ymdHourToTs(pickDrawYMD(a), toHourBucket(pickDrawHour(a)));
      const tb = ymdHourToTs(pickDrawYMD(b), toHourBucket(pickDrawHour(b)));
      return ta - tb;
    });

  const realizedTodayMap = new Map();

  for (const d of daySorted) {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    if (!isYMD(y) || !h) continue;
    if (y !== targetYmd) continue;
    realizedTodayMap.set(`${y}|${h}`, d);
  }


  const chainContextDraws = [];
  const timeline = [];
  let pendingPredictionAlreadyShown = false;

  for (const slotHour of normalizedSchedule) {
    const currentDraw = realizedTodayMap.get(`${targetYmd}|${slotHour}`) || null;
    const slotTs = ymdHourToTs(targetYmd, slotHour);


    if (!currentDraw && pendingPredictionAlreadyShown) {
      timeline.push({
        targetYmd,
        targetHour: slotHour,
        baseYmd: "",
        baseHour: "",
        top3: [],
        resultGrupo: null,
        hit: null,
        status: "pending",
      });
      continue;
    }

    let baseDraw = null;

    const priorChainDraw = [...chainContextDraws]
      .filter((d) => {
        const y = pickDrawYMD(d);
        const h = toHourBucket(pickDrawHour(d));
        const ts = ymdHourToTs(y, h);
        return isYMD(y) && h && Number.isFinite(ts) && ts < slotTs;
      })
      .sort((a, b) => {
        const ta = ymdHourToTs(pickDrawYMD(a), toHourBucket(pickDrawHour(a)));
        const tb = ymdHourToTs(pickDrawYMD(b), toHourBucket(pickDrawHour(b)));
        return tb - ta;
      })[0] || null;

    if (priorChainDraw) baseDraw = priorChainDraw;

    if (!baseDraw) {
      const prevSameDay = daySorted
        .filter((d) => {
          const y = pickDrawYMD(d);
          const h = toHourBucket(pickDrawHour(d));
          const ts = ymdHourToTs(y, h);
          return y === targetYmd && h && Number.isFinite(ts) && ts < slotTs;
        })
        .sort((a, b) => {
          const ta = ymdHourToTs(pickDrawYMD(a), toHourBucket(pickDrawHour(a)));
          const tb = ymdHourToTs(pickDrawYMD(b), toHourBucket(pickDrawHour(b)));
          return tb - ta;
        })[0] || null;

      if (prevSameDay) baseDraw = prevSameDay;
    }

    if (!baseDraw) {
      for (let i = rangeSorted.length - 1; i >= 0; i -= 1) {
        const d = rangeSorted[i];
        const y = pickDrawYMD(d);
        const h = toHourBucket(pickDrawHour(d));
        const ts = ymdHourToTs(y, h);

        if (!Number.isFinite(ts) || ts >= slotTs) continue;

        baseDraw = d;
        break;
      }
    }

    if (!baseDraw) {
      baseDraw = findPreviousValidDraw(rangeSorted, targetYmd, slotHour);
    }

    if (!baseDraw) {
      timeline.push({
        targetYmd,
        targetHour: slotHour,
        baseYmd: "",
        baseHour: "",
        top3: [],
        resultGrupo: null,
        hit: null,
        status: "pending",
      });
      continue;
    }

    const baseTs = ymdHourToTs(
      pickDrawYMD(baseDraw),
      toHourBucket(pickDrawHour(baseDraw))
    );

    const usableHistory = rangeSorted.filter((d) => {
      const ts = ymdHourToTs(
        pickDrawYMD(d),
        toHourBucket(pickDrawHour(d))
      );
      return Number.isFinite(ts) && ts <= baseTs;
    });

    const historyStats = (() => {
      const MS_DAY = 24 * 60 * 60 * 1000;

      let d30 = 0;
      let d90 = 0;
      let d180 = 0;
      let d365 = 0;

      for (const historicalDraw of usableHistory) {
        const historicalTs = ymdHourToTs(
          pickDrawYMD(historicalDraw),
          toHourBucket(pickDrawHour(historicalDraw))
        );

        if (!Number.isFinite(historicalTs)) continue;

        const diffDays = (baseTs - historicalTs) / MS_DAY;

        if (diffDays >= 0 && diffDays <= 30) d30 += 1;
        if (diffDays >= 0 && diffDays <= 90) d90 += 1;
        if (diffDays >= 0 && diffDays <= 180) d180 += 1;
        if (diffDays >= 0 && diffDays <= 365) d365 += 1;
      }

      return {
        total: usableHistory.length,
        d30,
        d90,
        d180,
        d365,
      };
    })();

    const usableTodayContext = [...chainContextDraws]
      .filter((d) => {
        const ts = ymdHourToTs(
          pickDrawYMD(d),
          toHourBucket(pickDrawHour(d))
        );
        return Number.isFinite(ts) && ts <= baseTs;
      })
      .sort((a, b) => {
        const ta = ymdHourToTs(pickDrawYMD(a), toHourBucket(pickDrawHour(a)));
        const tb = ymdHourToTs(pickDrawYMD(b), toHourBucket(pickDrawHour(b)));
        return ta - tb;
      });

    const computed = computeStatisticalTop3V3({
      lotteryKey,
      drawsRange: [...usableHistory, ...usableTodayContext],
      drawLast: baseDraw,
      drawsToday: usableTodayContext,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
      topN: 3,
      targetYmdOverride: targetYmd,
      targetHourOverride: slotHour,
    });


    const computedNextYmd = safeStr(computed?.meta?.next?.ymd || "");
    const computedNextHour = toHourBucket(computed?.meta?.next?.hour || "");
    const computedForSlot =
      computedNextYmd === targetYmd && computedNextHour === slotHour;

    const top3 =
      computedForSlot && Array.isArray(computed?.top)
        ? computed.top.slice(0, 3)
        : [];

    const resultTop3Groups = currentDraw
      ? getPrizeGroupsByPosition(currentDraw, 3)
      : [null, null, null];

    const resultGrupo = Number(resultTop3Groups[0]);

    const normalizedResultGrupo =
      Number.isFinite(resultGrupo) &&
      resultGrupo >= 1 &&
      resultGrupo <= TOP3_GROUPS_K
        ? resultGrupo
        : null;

    const hitPrizePositions = resultTop3Groups.map(
      (resultGroup) =>
        Number.isFinite(Number(resultGroup)) &&
        top3.some(
          (item) =>
            Number(item?.grupo) ===
            Number(resultGroup)
        )
    );

    const matchedPrizePositions =
      hitPrizePositions.filter(Boolean).length;

    const hit =
      top3.length > 0 &&
      resultTop3Groups.some(
        (resultGroup) =>
          Number.isFinite(Number(resultGroup))
      )
        ? matchedPrizePositions > 0
        : null;

    timeline.push({
      targetYmd,
      targetHour: slotHour,

      baseYmd: pickDrawYMD(baseDraw) || "",
      baseHour: toHourBucket(pickDrawHour(baseDraw)) || "",

      top3,

      resultGrupo: normalizedResultGrupo,
      resultTop3Groups,

      hit,
      top3PrizeHit: hit,
      hitPrizePositions,
      matchedPrizePositions,

      status: Number.isFinite(
        Number(normalizedResultGrupo)
      )
        ? "validated"
        : "pending",

      historyStats,
    });

    if (currentDraw) {
      chainContextDraws.push(currentDraw);
    } else {
      pendingPredictionAlreadyShown = true;
    }
  }

  return timeline;

}

export function buildTimelineTop3(args) {
  return buildTimelineForDate(args || {});
}

export function auditTop3Backtest({
  drawsRange,
  lotteryKey,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
}) {
  const range = Array.isArray(drawsRange) ? drawsRange : [];
  const dates = Array.from(
    new Set(
      range
        .map((d) => pickDrawYMD(d))
        .filter((ymd) => isYMD(ymd))
    )
  ).sort();

  const allTimeline = [];

  for (const ymd of dates) {
    const drawsToday = range.filter((d) => pickDrawYMD(d) === ymd);

    const dayTimeline = buildTimelineForDate({
      ymd,
      drawsToday,
      drawsRange: range,
      lotteryKey,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });

    allTimeline.push(...(Array.isArray(dayTimeline) ? dayTimeline : []));
  }

  return auditTop3Timeline({
    timeline: allTimeline,
    lotteryKey,
  });
}
