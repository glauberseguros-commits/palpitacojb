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
} from "./top3.formatters";

import {
  TOP3_SMOOTH_ALPHA,
  TOP3_SHRINK_M,
  TOP3_NEXTDRAW_SCAN_MAX_STEPS,
  TOP3_NEXTDRAW_SCAN_MAX_DAYS,
  TOP3_GROUPS_K,
} from "./top3.constants";

/* =========================
   Draw helpers (robustos)
========================= */

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
  const g = Number.isFinite(Number(p?.grupo2))
    ? Number(p.grupo2)
    : Number.isFinite(Number(p?.group2))
    ? Number(p.group2)
    : Number.isFinite(Number(p?.grupo))
    ? Number(p.grupo)
    : Number.isFinite(Number(p?.group))
    ? Number(p.group)
    : Number.isFinite(Number(p?.animal_grupo))
    ? Number(p.animal_grupo)
    : null;
  return g;
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
   ✅ Helpers novos (recência / pesos / gatilho expandido)
========================= */

function safeInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function ymdToUtcDayTs(ymd) {
  if (!isYMD(ymd)) return Number.NaN;
  const [Y, M, D] = ymd.split("-").map((x) => Number(x));
  return Date.UTC(Y, M - 1, D);
}

function diffDaysYMD(a, b) {
  const ta = ymdToUtcDayTs(a);
  const tb = ymdToUtcDayTs(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((tb - ta) / (24 * 60 * 60 * 1000)));
}

function getRecencyWeight(sampleYmd, refYmd) {
  const days = diffDaysYMD(sampleYmd, refYmd);

  if (!Number.isFinite(days)) return 0.10;
  if (days <= 3) return 1.0;
  if (days <= 7) return 0.7;
  if (days <= 15) return 0.45;
  if (days <= 30) return 0.25;
  return 0.10;
}

function getPrizePosWeight(pos) {
  const p = Number(pos);
  if (p === 1) return 1.0;
  if (p === 2) return 0.8;
  if (p === 3) return 0.6;
  if (p === 4) return 0.4;
  if (p === 5) return 0.25;
  return 0;
}

function getTopTriggerEntries(draw, maxPos = 3) {
  const ps = Array.isArray(draw?.prizes) ? draw.prizes : [];
  const out = [];

  for (const p of ps) {
    const pos = guessPrizePos(p);
    if (!Number.isFinite(Number(pos)) || Number(pos) < 1 || Number(pos) > maxPos)
      continue;

    const g = guessPrizeGrupo(p);
    if (!Number.isFinite(Number(g)) || Number(g) <= 0) continue;

    out.push({
      grupo: Number(g),
      pos: Number(pos),
      weight: getPrizePosWeight(Number(pos)),
    });
  }

  return out.sort((a, b) => a.pos - b.pos);
}

function getTopTriggerMap(draw, maxPos = 3) {
  const map = new Map();
  const arr = getTopTriggerEntries(draw, maxPos);

  for (const x of arr) {
    if (!map.has(x.grupo)) {
      map.set(x.grupo, { pos: x.pos, weight: x.weight });
    }
  }

  return map;
}

function computeTriggerMatchWeight(drawCandidate, currentTriggerMap) {
  if (!(currentTriggerMap instanceof Map) || !currentTriggerMap.size) return 0;

  const candMap = getTopTriggerMap(drawCandidate, 3);
  if (!candMap.size) return 0;

  let sum = 0;

  for (const [grupo, cur] of currentTriggerMap.entries()) {
    const hit = candMap.get(grupo);
    if (!hit) continue;

    const samePosBonus = hit.pos === cur.pos ? 1.15 : 1.0;
    sum += cur.weight * hit.weight * samePosBonus;
  }

  return sum;
}

function countWeightedAparicoesByGrupoInDraw(draw, sampleWeight = 1) {
  const counts = new Map();
  const ps = Array.isArray(draw?.prizes) ? draw.prizes : [];
  const sampleW = Math.max(0, Number(sampleWeight || 0));

  if (sampleW <= 0) return counts;

  for (const p of ps) {
    const pos = guessPrizePos(p);
    if (!Number.isFinite(Number(pos)) || Number(pos) < 1 || Number(pos) > 5)
      continue;

    const g = guessPrizeGrupo(p);
    if (!Number.isFinite(Number(g)) || Number(g) <= 0) continue;

    const gg = Number(g);
    const posW = getPrizePosWeight(pos);
    if (posW <= 0) continue;

    counts.set(gg, (counts.get(gg) || 0) + posW * sampleW);
  }

  return counts;
}

/* =========================
   Schedules
========================= */

export function isFederalDrawDay(ymd) {
  const dow = getDowKey(ymd);
  return dow === 3 || dow === 6; // qua/sáb
}

export function getPtRioScheduleForYmd(
  ymd,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT
) {
  const dow = getDowKey(ymd);
  if (dow === 3 || dow === 6) return PT_RIO_SCHEDULE_WED_SAT;
  return PT_RIO_SCHEDULE_NORMAL;
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
    return isFederalDrawDay(ymd) ? FEDERAL_SCHEDULE : [];
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
      const ha0 = hourToInt(pickDrawHour(a));
      const hb0 = hourToInt(pickDrawHour(b));
      const ha = Number.isFinite(ha0) && ha0 >= 0 ? ha0 : -1;
      const hb = Number.isFinite(hb0) && hb0 >= 0 ? hb0 : -1;
      return hb - ha;
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
    )
      continue;

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

function ymdHourToTs(ymd, hourBucket) {
  if (!isYMD(ymd)) return Number.POSITIVE_INFINITY;
  const [Y, M, D] = ymd.split("-").map((x) => Number(x));
  const base = Date.UTC(Y, M - 1, D);
  const mins = hourToInt(hourBucket);
  const add = mins >= 0 ? mins * 60 * 1000 : 0;
  return base + add;
}

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
      if (Array.isArray(sch) && sch.length)
        return { ymd: day, hour: toHourBucket(sch[0]) };
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
    if (Array.isArray(sch) && sch.length)
      return { ymd: day, hour: toHourBucket(sch[0]) };
  }

  return { ymd: "", hour: "" };
}

/* =========================
   ✅ Próximo DRAW REAL (não perde amostra)
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

  if (!isYMD(y0) || !h0 || !(drawsIndex instanceof Map))
    return { slot: null, draw: null };

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
    const d = drawsIndex.get(`${curY}|${toHourBucket(curH)}`) || null;
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
   Index + lastSeen
========================= */

export function indexDrawsByYmdHour(draws) {
  const map = new Map();
  const list = Array.isArray(draws) ? draws : [];
  for (const d of list) {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    if (!isYMD(y) || !h) continue;

    const key = `${y}|${h}`;
    if (!map.has(key)) map.set(key, d);
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
      const g = guessPrizeGrupo(p);
      if (!Number.isFinite(Number(g)) || Number(g) <= 0) continue;
      const gg = Number(g);
      const prev = last.get(gg);
      if (!Number.isFinite(prev) || ts > prev) last.set(gg, ts);
    }
  }
  return last;
}

export function countAparicoesByGrupoInDraw(draw) {
  const counts = new Map();
  const ps = Array.isArray(draw?.prizes) ? draw.prizes : [];
  for (const p of ps) {
    const pos = guessPrizePos(p);
    if (!Number.isFinite(Number(pos)) || Number(pos) < 1 || Number(pos) > 5)
      continue;
    const g = guessPrizeGrupo(p);
    if (!Number.isFinite(Number(g)) || Number(g) <= 0) continue;
    const gg = Number(g);
    counts.set(gg, (counts.get(gg) || 0) + 1);
  }
  return counts;
}

/* =========================
   ✅ Base model: horário (com recência + peso por posição)
========================= */

function computeBaseNextDistribution({
  lotteryKey,
  drawsRange,
  drawLast,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
}) {
  const list = Array.isArray(drawsRange) ? drawsRange : [];
  if (!list.length || !drawLast) return { samples: 0, freq: new Map(), weightSum: 0 };

  const lastY = pickDrawYMD(drawLast);
  const lastH = toHourBucket(pickDrawHour(drawLast));
  const lastDow = getDowKey(lastY);

  if (!isYMD(lastY) || !lastH || lastDow == null) {
    return { samples: 0, freq: new Map(), weightSum: 0 };
  }

  const drawsIndex = indexDrawsByYmdHour(list);

  let samples = 0;
  let weightSum = 0;
  const freq = new Map();

  for (const d of list) {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    if (!isYMD(y) || !h) continue;

    if (getDowKey(y) !== lastDow) continue;
    if (h !== lastH) continue;

    const ns = getNextSlotForLottery({
      lotteryKey,
      ymd: y,
      hourBucket: h,
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
    if (!nextDraw) continue;

    const recencyW = getRecencyWeight(y, lastY);
    if (recencyW <= 0) continue;

    samples += 1;
    weightSum += recencyW;

    const c = countWeightedAparicoesByGrupoInDraw(nextDraw, recencyW);

    for (const [gg, n] of c.entries()) {
      const prev = Number(freq.get(gg) || 0);
      const add = Number(n || 0);
      freq.set(
        gg,
        (Number.isFinite(prev) ? prev : 0) + (Number.isFinite(add) ? add : 0)
      );
    }
  }

  return { samples, freq, weightSum };
}

/* =========================
   ✅ Suavização + Probabilidades
========================= */

function freqToProbMap(
  freq,
  alpha = TOP3_SMOOTH_ALPHA,
  groupsK = TOP3_GROUPS_K
) {
  const a = safeInt(alpha, 1);
  const k = safeInt(groupsK, 25);

  let total = 0;
  for (const v of freq.values()) total += Number(v || 0);

  const denom = total + a * k;
  const p = new Map();

  for (let g = 1; g <= k; g += 1) {
    const n = Number(freq.get(g) || 0);
    p.set(g, (n + a) / denom);
  }

  return { prob: p, total, denom, alpha: a, k };
}

function mixProbMaps(pCond, pBase, w) {
  const out = new Map();
  const keys = new Set();

  for (const k of pCond.keys()) keys.add(k);
  for (const k of pBase.keys()) keys.add(k);

  const ww = Math.max(0, Math.min(1, Number(w || 0)));

  for (const k of keys) {
    const pc = Number(pCond.get(k) || 0);
    const pb = Number(pBase.get(k) || 0);
    out.set(Number(k), ww * pc + (1 - ww) * pb);
  }
  return out;
}

function driverFromMixW(w) {
  const ww = Math.max(0, Math.min(1, Number(w || 0)));
  if (ww >= 0.65) return { key: "COND", label: "Condicional (gatilho + recorte)" };
  if (ww <= 0.35) return { key: "BASE", label: "Base (horário/DOW, sem gatilho)" };
  return { key: "MIXED", label: "Mistura equilibrada" };
}

/* =========================
   Motor principal (condicional + base)
========================= */

export function computeConditionalNextTop3({
  lotteryKey,
  drawsRange,
  drawLast,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  topN = 3,
}) {
  const list = Array.isArray(drawsRange) ? drawsRange : [];
  if (!list.length || !drawLast) {
    return { top: [], meta: null };
  }

  const lastY = pickDrawYMD(drawLast);
  const lastH = toHourBucket(pickDrawHour(drawLast));
  const lastDow = getDowKey(lastY);
  const triggerGrupo = pickPrize1GrupoFromDraw(drawLast);
  const currentTriggerMap = getTopTriggerMap(drawLast, 3);
  const currentTriggerEntries = getTopTriggerEntries(drawLast, 3);

  if (
    !isYMD(lastY) ||
    !lastH ||
    lastDow == null ||
    !Number.isFinite(Number(triggerGrupo))
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

  const drawsIndex = indexDrawsByYmdHour(list);
  const lastSeen = computeLastSeenByGrupo(list);

  function runScenario({ label, matchDow, matchHour }) {
    let samples = 0;
    let weightSum = 0;
    const freq = new Map();

    for (const d of list) {
      const y = pickDrawYMD(d);
      const h = toHourBucket(pickDrawHour(d));
      if (!isYMD(y) || !h) continue;

      if (matchDow && getDowKey(y) !== lastDow) continue;
      if (matchHour && h !== lastH) continue;

      const triggerMatchW = computeTriggerMatchWeight(d, currentTriggerMap);
      if (triggerMatchW <= 0) continue;

      const ns = getNextSlotForLottery({
        lotteryKey,
        ymd: y,
        hourBucket: h,
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
      if (!nextDraw) continue;

      const recencyW = getRecencyWeight(y, lastY);
      const sampleW = recencyW * triggerMatchW;
      if (sampleW <= 0) continue;

      samples += 1;
      weightSum += sampleW;

      const c = countWeightedAparicoesByGrupoInDraw(nextDraw, sampleW);
      for (const [gg, n] of c.entries()) {
        const prev = Number(freq.get(gg) || 0);
        const add = Number(n || 0);
        freq.set(
          gg,
          (Number.isFinite(prev) ? prev : 0) + (Number.isFinite(add) ? add : 0)
        );
      }
    }

    return { label, samples, freq, weightSum };
  }

  const tries = [
    { label: "DOW+HORA", matchDow: true, matchHour: true },
    { label: "HORA", matchDow: false, matchHour: true },
    { label: "DOW", matchDow: true, matchHour: false },
    { label: "QUALQUER", matchDow: false, matchHour: false },
  ];

  let chosen = null;
  for (const t of tries) {
    const out = runScenario(t);
    if (out.samples > 0 && out.freq.size > 0) {
      chosen = out;
      break;
    }
  }

  const base = computeBaseNextDistribution({
    lotteryKey,
    drawsRange: list,
    drawLast,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });

  const alpha = TOP3_SMOOTH_ALPHA;
  const groupsK = TOP3_GROUPS_K;

  const condFreq = chosen?.freq || new Map();
  const condSamples = safeInt(chosen?.samples, 0);
  const condWeightSum = Number(chosen?.weightSum || 0);

  const baseFreq = base?.freq || new Map();
  const baseSamples = safeInt(base?.samples, 0);
  const baseWeightSum = Number(base?.weightSum || 0);

  const condStats = freqToProbMap(condFreq, alpha, groupsK);
  const baseStats = freqToProbMap(baseFreq, alpha, groupsK);

  const condProb = condStats.prob;
  const baseProb = baseStats.prob;

  const M = safeInt(TOP3_SHRINK_M, 40);
  const effectiveCond = Math.max(condSamples, condWeightSum);
  const w = effectiveCond / (effectiveCond + M);

  const finalProb = mixProbMaps(condProb, baseProb, w);

  const driver = driverFromMixW(w);

  const dominantReason =
    driver.key === "BASE"
      ? `Puxou mais para BASE porque a janela condicional ficou curta/fraca (samples cond=${condSamples}, peso cond=${condWeightSum.toFixed(
          2
        )}) e o shrink M=${M} segurou o gatilho.`
      : driver.key === "COND"
      ? `Puxou mais para CONDICIONAL porque houve evidência suficiente no recorte (samples cond=${condSamples}, peso cond=${condWeightSum.toFixed(
          2
        )}), aumentando o peso do gatilho expandido.`
      : `Puxou para uma mistura porque o peso w=${w.toFixed(
          2
        )} ficou intermediário (samples cond=${condSamples}, peso cond=${condWeightSum.toFixed(
          2
        )}, M=${M}).`;

  const nowTs = ymdHourToTs(lastY, lastH);

  const LATE_BONUS_MAX = 0.02;
  const LATE_CAP_DAYS = 30;

  const ranked = Array.from(finalProb.entries())
    .map(([grupo, p]) => {
      const g = Number(grupo);
      const probFinal = Number(p || 0);

      const probCond = Number(condProb.get(g) || 0);
      const probBase = Number(baseProb.get(g) || 0);

      const freqCond = Number(condFreq.get(g) || 0);
      const freqBase = Number(baseFreq.get(g) || 0);

      const ls = lastSeen.get(g);
      const lastSeenTs = Number.isFinite(ls) ? ls : Number.POSITIVE_INFINITY;

      const gapMs =
        Number.isFinite(nowTs) &&
        Number.isFinite(lastSeenTs) &&
        lastSeenTs !== Number.POSITIVE_INFINITY
          ? Math.max(0, nowTs - lastSeenTs)
          : 0;

      const gapDays = gapMs / (24 * 60 * 60 * 1000);
      const gapNorm = Math.max(0, Math.min(1, gapDays / LATE_CAP_DAYS));
      const lateBonus = gapNorm * LATE_BONUS_MAX;

      let freqZeroWhy = "";
      if (freqCond <= 0) {
        if (freqBase > 0) {
          freqZeroWhy = `freq condicional=0, mas entrou via BASE (horário/DOW) + mistura (w=${w.toFixed(
            2
          )}).`;
        } else {
          freqZeroWhy = `freq condicional=0 e freq base=0: entrou por suavização (alpha=${condStats.alpha}) e/ou ajuste de atraso (lateBonus).`;
        }
      }

      return {
        grupo: g,
        probCond,
        probBase,
        prob: probFinal,
        score: probFinal + lateBonus,
        lateBonus,
        freqCond,
        freqBase,
        freqZeroWhy,
        lastSeenTs,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.prob !== a.prob) return b.prob - a.prob;
      return a.grupo - b.grupo;
    })
    .slice(0, Math.max(1, Number(topN || 3)));

  const scenarioLabel = chosen?.label || "NONE";
  const triggerText =
    currentTriggerEntries.length > 0
      ? currentTriggerEntries
          .map((x) => `P${x.pos}=G${String(x.grupo).padStart(2, "0")}`)
          .join(" | ")
      : `P1=G${String(triggerGrupo).padStart(2, "0")}`;

  const top = ranked.map((x, idx) => {
    const g2 = String(x.grupo).padStart(2, "0");

    const whyLine =
      x.freqZeroWhy ||
      (driver.key === "BASE"
        ? "Base (horário/DOW) dominou nesta rodada."
        : driver.key === "COND"
        ? "Condicional (gatilho expandido) dominou nesta rodada."
        : "Mistura entre condicional e base nesta rodada.");

    return {
      rank: idx + 1,
      title:
        idx === 0
          ? "Mais provável"
          : idx === 1
          ? "2º mais provável"
          : "3º mais provável",
      grupo: x.grupo,
      prob: x.prob,
      probCond: x.probCond,
      probBase: x.probBase,
      lateBonus: x.lateBonus,
      freq: x.freqCond,
      freqCond: x.freqCond,
      freqBase: x.freqBase,
      freqZeroWhy: x.freqZeroWhy,
      reasons: [
        `Gatilho expandido do último sorteio: ${triggerText}`,
        `Cenário (fallback): ${scenarioLabel}`,
        `Dominante: ${driver.label} (w=${w.toFixed(2)})`,
        dominantReason,
        `Grupo G${g2}: probFinal=${(x.prob * 100).toFixed(2)}% (cond=${(
          x.probCond * 100
        ).toFixed(2)}%, base=${(x.probBase * 100).toFixed(2)}%)`,
        x.lateBonus > 0
          ? `Ajuste atraso: +${(x.lateBonus * 100).toFixed(
              2
            )}% no score (cap ${(LATE_BONUS_MAX * 100).toFixed(2)}%)`
          : `Ajuste atraso: 0 (sem impacto relevante)`,
        `Amostras: cond=${condSamples} | base=${baseSamples} | pesoCond=${condWeightSum.toFixed(
          2
        )} | pesoBase=${baseWeightSum.toFixed(2)} | shrink M=${M}`,
        `Suavização: alpha=${condStats.alpha} | K=${condStats.k}`,
        `Peso por posição habilitado: P1=1.00 | P2=0.80 | P3=0.60 | P4=0.40 | P5=0.25`,
        `Recência habilitada: 0-3d=1.00 | 4-7d=0.70 | 8-15d=0.45 | 16-30d=0.25 | >30d=0.10`,
        whyLine,
        `Próximo slot (grade): ${nextSlot?.ymd ? nextSlot.ymd : "—"} ${
          nextSlot?.hour ? toHourBucket(nextSlot.hour) : ""
        }`,
      ],
      meta: {
        trigger: {
          ymd: lastY,
          hour: lastH,
          dow: lastDow,
          grupo: Number(triggerGrupo),
          top3: currentTriggerEntries.map((x) => ({
            grupo: x.grupo,
            pos: x.pos,
            weight: x.weight,
          })),
        },
        next: {
          ymd: safeStr(nextSlot?.ymd),
          hour: safeStr(toHourBucket(nextSlot?.hour)),
        },
        samples: condSamples,
        baseSamples,
        scenario: scenarioLabel,
        shrinkW: w,
        explain: {
          dominantDriver: driver.key,
          dominantLabel: driver.label,
          dominantReason,
          scenario: scenarioLabel,
          wCond: w,
          wBase: 1 - w,
          condSamples,
          baseSamples,
          condWeightSum,
          baseWeightSum,
          shrinkM: M,
          condTotal: condStats.total,
          baseTotal: baseStats.total,
          condDenom: condStats.denom,
          baseDenom: baseStats.denom,
          alpha: condStats.alpha,
          k: condStats.k,
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
        dow: lastDow,
        grupo: Number(triggerGrupo),
        top3: currentTriggerEntries.map((x) => ({
          grupo: x.grupo,
          pos: x.pos,
          weight: x.weight,
        })),
      },
      next: {
        ymd: safeStr(nextSlot?.ymd),
        hour: safeStr(toHourBucket(nextSlot?.hour)),
      },
      samples: condSamples,
      baseSamples,
      scenario: scenarioLabel,
      shrinkW: w,
      alpha,
      explain: {
        dominantDriver: driver.key,
        dominantLabel: driver.label,
        dominantReason,
        scenario: scenarioLabel,
        wCond: w,
        wBase: 1 - w,
        condSamples,
        baseSamples,
        condWeightSum,
        baseWeightSum,
        shrinkM: M,
        condTotal: condStats.total,
        baseTotal: baseStats.total,
        condDenom: condStats.denom,
        baseDenom: baseStats.denom,
        alpha: condStats.alpha,
        k: condStats.k,
      },
    },
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
    const dz = (start + i) % 100;
    out.push(String(dz).padStart(2, "0"));
  }
  return out;
}

function pickRepresentativeMilharForCentena(prizes, centena3) {
  const counts = new Map();
  for (const m4 of prizes) {
    if (!m4) continue;
    const c3 = getCentena3(m4);
    if (c3 !== centena3) continue;
    counts.set(m4, (counts.get(m4) || 0) + 1);
  }
  if (!counts.size) return "";
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || milharCompareAsc(a[0], b[0]))
    .map((x) => x[0])[0];
}

export function buildMilharesForGrupo({
  rangeDraws,
  analysisHourBucket,
  schedule,
  grupo2,
  count = 16,
}) {
  const list = Array.isArray(rangeDraws) ? rangeDraws : [];
  const target = toHourBucket(analysisHourBucket);
  const schSet = scheduleSet(schedule);

  const N = Number.isFinite(Number(count))
    ? Math.max(4, Math.trunc(Number(count)))
    : 16;

  if (!grupo2 || !list.length || !target) {
    return { dezenas: [], slots: [] };
  }

  const dezenasFixas = getDezenasFixasFromGrupo(grupo2);
  if (!dezenasFixas.length) return { dezenas: [], slots: [] };

  const collectMilhares = (mode) => {
    const out = [];
    for (const d of list) {
      const h = toHourBucket(pickDrawHour(d));
      if (!h) continue;
      if (!schSet.has(h)) continue;
      if (mode === "target_only" && h !== target) continue;

      const ps = Array.isArray(d?.prizes) ? d.prizes : [];
      if (!ps.length) continue;

      for (const p of ps) {
        const pos = guessPrizePos(p);
        if (!Number.isFinite(Number(pos)) || Number(pos) < 1 || Number(pos) > 5)
          continue;

        const g = guessPrizeGrupo(p);
        if (!Number.isFinite(Number(g)) || Number(g) !== Number(grupo2)) continue;

        const m4 = pickPrizeMilhar4(p);
        if (!m4 || !/^\d{4}$/.test(String(m4))) continue;

        const dz = getDezena2(m4);
        if (!dz || !dezenasFixas.includes(dz)) continue;

        out.push(String(m4));
      }
    }
    return out;
  };

  const prizes = collectMilhares("target_only");

  if (!prizes.length) return { dezenas: dezenasFixas, slots: [] };

  const perDezena = Math.max(1, Math.ceil(N / dezenasFixas.length));
  const slots = [];

  for (const dz of dezenasFixas) {
    const centCounts = new Map();

    for (const m4 of prizes) {
      if (!m4 || !/^\d{4}$/.test(m4)) continue;
      if (getDezena2(m4) !== dz) continue;

      const c3 = getCentena3(m4);
      if (!c3) continue;

      centCounts.set(c3, (centCounts.get(c3) || 0) + 1);
    }

    const rankedCentenas = Array.from(centCounts.entries())
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map((x) => x[0])
      .slice(0, perDezena);

    for (const c3 of rankedCentenas) {
      const milharRep = pickRepresentativeMilharForCentena(prizes, c3);
      slots.push({ dezena: dz, milhar: milharRep || "" });
    }

    while (slots.filter((s) => s.dezena === dz).length < perDezena) {
      slots.push({ dezena: dz, milhar: "" });
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