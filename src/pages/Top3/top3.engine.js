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
      // ✅ robustez: hour inválido não quebra sort
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
   ✅ NOVO: próximo DRAW REAL (não perde amostra)
========================= */

function safeInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

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
    const d = drawsIndex.get(`${y0}|${h0}`) || null;
    return d
      ? { slot: { ymd: y0, hour: h0 }, draw: d }
      : { slot: null, draw: null };
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
    // ✅ não sobrescreve (evita perder o primeiro válido)
    if (!map.has(key)) map.set(key, d);
  }
  return map;
}

export function computeLastSeenByGrupo(draws) {
  const last = new Map(); // grupo -> ts
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
    if (
      !Number.isFinite(Number(pos)) ||
      Number(pos) < 1 ||
      Number(pos) > 5
    )
      continue;
    const g = guessPrizeGrupo(p);
    if (!Number.isFinite(Number(g)) || Number(g) <= 0) continue;
    const gg = Number(g);
    counts.set(gg, (counts.get(gg) || 0) + 1);
  }
  return counts;
}

/* =========================
   ✅ Base model: horário (sem gatilho)
   - mesmo próximo slot (real)
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
  if (!list.length || !drawLast) return { samples: 0, freq: new Map() };

  const lastY = pickDrawYMD(drawLast);
  const lastH = toHourBucket(pickDrawHour(drawLast));
  const lastDow = getDowKey(lastY);

  if (!isYMD(lastY) || !lastH || lastDow == null)
    return { samples: 0, freq: new Map() };

  const drawsIndex = indexDrawsByYmdHour(list);

  let samples = 0;
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

    samples += 1;
    const c = countAparicoesByGrupoInDraw(nextDraw);

    for (const [gg, n] of c.entries()) {
      const prev = Number(freq.get(gg) || 0);
      const add = Number(n || 0);
      freq.set(gg, (Number.isFinite(prev) ? prev : 0) + (Number.isFinite(add) ? add : 0));
    }
  }

  return { samples, freq };
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

  return { prob: p, total, denom };
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
    const freq = new Map();

    for (const d of list) {
      const y = pickDrawYMD(d);
      const h = toHourBucket(pickDrawHour(d));
      if (!isYMD(y) || !h) continue;

      if (matchDow && getDowKey(y) !== lastDow) continue;
      if (matchHour && h !== lastH) continue;

      const g1 = pickPrize1GrupoFromDraw(d);
      if (Number(g1) !== Number(triggerGrupo)) continue;

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

      samples += 1;

      const c = countAparicoesByGrupoInDraw(nextDraw);
      for (const [gg, n] of c.entries()) {
        const prev = Number(freq.get(gg) || 0);
        const add = Number(n || 0);
        freq.set(gg, (Number.isFinite(prev) ? prev : 0) + (Number.isFinite(add) ? add : 0));
      }
    }

    return { label, samples, freq };
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

  const baseFreq = base?.freq || new Map();
  const baseSamples = safeInt(base?.samples, 0);

  const condProb = freqToProbMap(condFreq, alpha, groupsK).prob;
  const baseProb = freqToProbMap(baseFreq, alpha, groupsK).prob;

  const M = safeInt(TOP3_SHRINK_M, 40);
  const w = condSamples / (condSamples + M);

  const finalProb = mixProbMaps(condProb, baseProb, w);

  const ranked = Array.from(finalProb.entries())
    .map(([grupo, p]) => {
      const ls = lastSeen.get(Number(grupo));
      return {
        grupo: Number(grupo),
        prob: Number(p || 0),
        freq: Number(condFreq.get(Number(grupo)) || 0),
        lastSeenTs: Number.isFinite(ls) ? ls : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => {
      if (b.prob !== a.prob) return b.prob - a.prob;
      if (a.lastSeenTs !== b.lastSeenTs) return a.lastSeenTs - b.lastSeenTs;
      return a.grupo - b.grupo;
    })
    .slice(0, Math.max(1, Number(topN || 3)));

  const scenarioLabel = chosen?.label || "NONE";

  const top = ranked.map((x, idx) => ({
    rank: idx + 1,
    title:
      idx === 0
        ? "Mais provável"
        : idx === 1
        ? "2º mais provável"
        : "3º mais provável",
    grupo: x.grupo,
    prob: x.prob,
    freq: x.freq,
    reasons: [
      `Gatilho: 1º lugar = G${String(triggerGrupo).padStart(
        2,
        "0"
      )} (último sorteio)`,
      `Cenário (fallback): ${scenarioLabel}`,
      `Próximo slot (grade): ${nextSlot?.ymd ? nextSlot.ymd : "—"} ${
        nextSlot?.hour ? toHourBucket(nextSlot.hour) : ""
      }`,
      `Amostras condicional: ${condSamples} | Base horário: ${baseSamples}`,
      `Mistura: w=${w.toFixed(2)} (condicional) / ${(1 - w).toFixed(
        2
      )} (base)`,
      `Suavização: alpha=${alpha}`,
    ],
    meta: {
      trigger: {
        ymd: lastY,
        hour: lastH,
        dow: lastDow,
        grupo: Number(triggerGrupo),
      },
      next: {
        ymd: safeStr(nextSlot?.ymd),
        hour: safeStr(toHourBucket(nextSlot?.hour)),
      },
      samples: condSamples,
      baseSamples,
      scenario: scenarioLabel,
      shrinkW: w,
    },
  }));

  return {
    top,
    meta: {
      trigger: {
        ymd: lastY,
        hour: lastH,
        dow: lastDow,
        grupo: Number(triggerGrupo),
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
    },
  };
}

/* =========================
   16/20 milhares (por grupo) — POR TERMINAÇÃO (CORRETO)
   - fixa as 4 terminações do grupo (ex: G14 => 53/54/55/56)
   - rankeia por CENTENA (3 dígitos) dentro de cada terminação
   - ordena por frequência desc (e desempate asc)
========================= */

function getDezenasFixasFromGrupo(grupo2) {
  const g = Number(grupo2);
  if (!Number.isFinite(g) || g < 1 || g > 25) return [];
  const start = (g - 1) * 4 + 1; // 1,5,9,...,53...
  const out = [];
  for (let i = 0; i < 4; i += 1)
    out.push(String(start + i).padStart(2, "0"));
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

  const N = Number.isFinite(Number(count)) ? Math.max(4, Math.trunc(Number(count))) : 16;

  if (!grupo2 || !list.length || !target) {
    return { dezenas: [], slots: [] };
  }

  const dezenasFixas = getDezenasFixasFromGrupo(grupo2);
  if (!dezenasFixas.length) return { dezenas: [], slots: [] };

  // ✅ Coleta milhares REAIS do histórico, sem inventar:
  // - usa somente prêmios 1º ao 5º (ignora 6º e 7º)
  // - respeita grade
  // - target_only = só no horário alvo; fallback = qualquer horário da grade
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
        if (!Number.isFinite(Number(pos)) || Number(pos) < 1 || Number(pos) > 5) continue;

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

  let prizes = collectMilhares("target_only");
  if (prizes.length < N) prizes = prizes.concat(collectMilhares("any_hour"));
  if (!prizes.length) return { dezenas: dezenasFixas, slots: [] };

  // ✅ prefixo (1 dígito) escolhido APENAS da base, para a centena (3 dígitos)
  function pickPrefixFromBaseForCentena(prizesList, centena3) {
    const pref = new Map(); // digit -> count
    for (const m4 of prizesList) {
      if (!m4 || !/^\d{4}$/.test(m4)) continue;
      if (getCentena3(m4) !== centena3) continue;
      const d = m4.slice(0, 1);
      pref.set(d, (pref.get(d) || 0) + 1);
    }
    if (!pref.size) return "";
    return Array.from(pref.entries())
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map((x) => x[0])[0];
  }

  // ✅ Regra final:
  // Para cada dezena fixa (coluna):
  // - conta CENTENAS (3 dígitos) cuja dezena final = dz
  // - pega TOP 5 (ou perDezena) por frequência (SEM peso)
  // - monta milhar = prefixoDaBase + centena (SEM inventar centena)
  const perDezena = Math.max(1, Math.ceil(N / dezenasFixas.length)); // 16=>4, 20=>5
  const slots = [];

  for (const dz of dezenasFixas) {
    const centCounts = new Map(); // c3 -> count

    for (const m4 of prizes) {
      if (!m4 || !/^\d{4}$/.test(m4)) continue;

      // trava por coluna
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
      const prefix = pickPrefixFromBaseForCentena(prizes, c3);
      const milhar = prefix ? `${prefix}${c3}` : ""; // sem prefixo na base => vazio (SEM inventar)
      slots.push({ dezena: dz, milhar });
    }

    while (slots.filter((s) => s.dezena === dz).length < perDezena) {
      slots.push({ dezena: dz, milhar: "" });
    }
  }

  while (slots.length < N) slots.push({ dezena: "", milhar: "" });

  return { dezenas: dezenasFixas, slots: slots.slice(0, N) };
}

// ✅ compat: mantém a API antiga (16)
export function build16MilharesForGrupo(args) {
  return buildMilharesForGrupo({ ...(args || {}), count: 16 });
}

// ✅ compat: 20 (nome corrigido)
export function build20MilharesForGrupo(args) {
  return buildMilharesForGrupo({ ...(args || {}), count: 20 });
}




