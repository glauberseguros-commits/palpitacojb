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
  dezenaCompareAsc,
  milharCompareByCentenaAsc,
} from "./top3.formatters";

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
      const ha = hourToInt(pickDrawHour(a));
      const hb = hourToInt(pickDrawHour(b));
      return hb - ha;
    });

  return sorted[0] || null;
}

export function findPrevDrawBeforeTargetInSameDay(draws, targetHourBucket, schedule) {
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

    if (safeStr(lotteryKey).toUpperCase() === "FEDERAL" && !daySchedule.length) continue;

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
   ✅ NOVO: Próximo sorteio (slot válido)
========================= */

function ymdHourToTs(ymd, hourBucket) {
  if (!isYMD(ymd)) return Number.POSITIVE_INFINITY;
  const [Y, M, D] = ymd.split("-").map((x) => Number(x));
  const base = Date.UTC(Y, M - 1, D);
  const mins = hourToInt(hourBucket);
  const add = mins >= 0 ? mins * 60 * 1000 : 0;
  return base + add;
}

/**
 * Retorna o próximo slot (ymd/hour) respeitando a grade REAL da loteria.
 * - Se houver próximo horário no mesmo dia -> (ymd, próximo horário)
 * - Se for o último horário do dia -> pula para o próximo dia COM SORTEIO e pega o primeiro horário
 * - Federal: pula para o próximo dia de concurso (qua/sáb) às 20h
 */
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

  // Federal: só um horário (20h) em qua/sáb -> próximo concurso
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
      if (Array.isArray(sch) && sch.length) return { ymd: day, hour: toHourBucket(sch[0]) };
    }
    return { ymd: "", hour: "" };
  }

  // PT_RIO: tenta no mesmo dia
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

  // próximo dia com grade
  for (let i = 1; i <= maxForwardDays; i += 1) {
    const day = addDaysYMD(y0, i);
    const sch = getScheduleForLottery({
      lotteryKey: key,
      ymd: day,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });
    if (Array.isArray(sch) && sch.length) return { ymd: day, hour: toHourBucket(sch[0]) };
  }

  return { ymd: "", hour: "" };
}

/* =========================
   ✅ NOVO: ranking condicionado (1º do último sorteio -> próximo sorteio)
========================= */

/**
 * Cria índice rápido: "YYYY-MM-DD|HHh" -> draw
 */
export function indexDrawsByYmdHour(draws) {
  const map = new Map();
  const list = Array.isArray(draws) ? draws : [];
  for (const d of list) {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    if (!isYMD(y) || !h) continue;
    map.set(`${y}|${h}`, d);
  }
  return map;
}

/**
 * Última aparição (timestamp) por grupo considerando TODAS as aparições do range.
 * Isso alimenta o desempate "mais atrasado".
 */
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

/**
 * Conta aparições (1º..7º) por grupo em um draw.
 */
export function countAparicoesByGrupoInDraw(draw) {
  const counts = new Map();
  const ps = Array.isArray(draw?.prizes) ? draw.prizes : [];
  for (const p of ps) {
    const pos = guessPrizePos(p);
    if (!Number.isFinite(Number(pos)) || Number(pos) < 1 || Number(pos) > 7) continue;
    const g = guessPrizeGrupo(p);
    if (!Number.isFinite(Number(g)) || Number(g) <= 0) continue;
    const gg = Number(g);
    counts.set(gg, (counts.get(gg) || 0) + 1);
  }
  return counts;
}

/**
 * Motor principal:
 * - Pega o último draw (drawLast)
 * - Usa o grupo do 1º lugar desse último draw como "gatilho"
 * - Procura no histórico todos os draws que têm:
 *   - 1º lugar == grupo gatilho
 *   - mesmo DOW do drawLast
 *   - mesmo horário do drawLast
 * - Para cada ocorrência, pega o "próximo sorteio" (slot válido) e soma aparições
 * - Ordena por:
 *   - freq desc
 *   - atraso (lastSeen mais antigo) asc
 *   - grupo asc (estável)
 */
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

  if (!isYMD(lastY) || !lastH || lastDow == null || !Number.isFinite(Number(triggerGrupo))) {
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
      const nextDraw = drawsIndex.get(`${ns.ymd}|${toHourBucket(ns.hour)}`) || null;
      if (!nextDraw) continue;

      samples += 1;

      const c = countAparicoesByGrupoInDraw(nextDraw);
      for (const [gg, n] of c.entries()) {
        freq.set(gg, (freq.get(gg) || 0) + Number(n || 0));
      }
    }

    return { label, samples, freq };
  }

  // 🔥 fallback progressivo (evita Top3 vazio por cenário raro)
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

  if (!chosen) {
    return {
      top: [],
      meta: {
        trigger: { ymd: lastY, hour: lastH, dow: lastDow, grupo: Number(triggerGrupo) },
        next: { ymd: safeStr(nextSlot?.ymd), hour: safeStr(toHourBucket(nextSlot?.hour)) },
        samples: 0,
        scenario: "NONE",
      },
    };
  }

  const ranked = Array.from(chosen.freq.entries())
    .map(([grupo, n]) => {
      const ls = lastSeen.get(Number(grupo));
      return {
        grupo: Number(grupo),
        freq: Number(n || 0),
        lastSeenTs: Number.isFinite(ls) ? ls : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => {
      if (b.freq !== a.freq) return b.freq - a.freq;
      if (a.lastSeenTs !== b.lastSeenTs) return a.lastSeenTs - b.lastSeenTs;
      return a.grupo - b.grupo;
    })
    .slice(0, Math.max(1, Number(topN || 3)));

  const top = ranked.map((x, idx) => ({
    rank: idx + 1,
    title: idx === 0 ? "Mais frequente" : idx === 1 ? "2º mais frequente" : "3º mais frequente",
    grupo: x.grupo,
    freq: x.freq,
    reasons: [
      `Condição base: 1º lugar = G${String(triggerGrupo).padStart(2, "0")} (gatilho do último sorteio)`,
      `Filtro usado (fallback): ${chosen.label}`,
      `Próximo sorteio (slot válido): ${nextSlot?.ymd ? nextSlot.ymd : "—"} ${nextSlot?.hour ? toHourBucket(nextSlot.hour) : ""}`,
      `Amostras no histórico: ${chosen.samples}`,
      `Desempate: empate em frequência → mais atrasado (última aparição mais antiga)`,
    ],
    meta: {
      trigger: { ymd: lastY, hour: lastH, dow: lastDow, grupo: Number(triggerGrupo) },
      next: { ymd: safeStr(nextSlot?.ymd), hour: safeStr(toHourBucket(nextSlot?.hour)) },
      samples: chosen.samples,
      scenario: chosen.label,
    },
  }));

  return {
    top,
    meta: {
      trigger: { ymd: lastY, hour: lastH, dow: lastDow, grupo: Number(triggerGrupo) },
      next: { ymd: safeStr(nextSlot?.ymd), hour: safeStr(toHourBucket(nextSlot?.hour)) },
      samples: chosen.samples,
      scenario: chosen.label,
    },
  };
}
/* =========================
   16 milhares (por grupo)
========================= */

export function build16MilharesForGrupo({
  rangeDraws,
  analysisHourBucket,
  schedule,
  grupo2,
}) {
  const list = Array.isArray(rangeDraws) ? rangeDraws : [];
  const target = toHourBucket(analysisHourBucket);
  const schSet = scheduleSet(schedule);

  if (!grupo2 || !list.length || !target) {
    return { dezenas: [], slots: [] };
  }

  const collect = (mode) => {
    const prizes = [];
    for (const d of list) {
      const h = toHourBucket(pickDrawHour(d));
      if (!h) continue;
      if (!schSet.has(h)) continue;
      if (mode === "target_only" && h !== target) continue;

      const ps = Array.isArray(d?.prizes) ? d.prizes : [];
      if (!ps.length) continue;

      const p1 = ps.find((p) => guessPrizePos(p) === 1) || null;
      if (!p1) continue;

      const g = guessPrizeGrupo(p1);
      if (!Number.isFinite(Number(g)) || Number(g) !== Number(grupo2)) continue;

      const m4 = pickPrizeMilhar4(p1);
      if (!m4) continue;

      prizes.push(m4);
    }
    return prizes;
  };

  let prizes = collect("target_only");

  if (prizes.length < 16) {
    const extra = collect("any_hour");
    const set = new Set(prizes);
    for (const m of extra) {
      if (set.has(m)) continue;
      prizes.push(m);
      set.add(m);
    }
  }

  if (!prizes.length) return { dezenas: [], slots: [] };

  const dezCounts = new Map();
  for (const m4 of prizes) {
    const dz = getDezena2(m4);
    if (!dz) continue;
    dezCounts.set(dz, (dezCounts.get(dz) || 0) + 1);
  }

  let topDezenas = Array.from(dezCounts.entries())
    .sort((a, b) => b[1] - a[1] || dezenaCompareAsc(a[0], b[0]))
    .slice(0, 4)
    .map((x) => x[0])
    .sort(dezenaCompareAsc);

  if (topDezenas.length < 4) {
    const allDz = Array.from(dezCounts.entries())
      .sort((a, b) => b[1] - a[1] || dezenaCompareAsc(a[0], b[0]))
      .map((x) => x[0]);

    for (const dz of allDz) {
      if (topDezenas.length >= 4) break;
      if (!topDezenas.includes(dz)) topDezenas.push(dz);
    }
    topDezenas = topDezenas.slice(0, 4).sort(dezenaCompareAsc);
  }

  const usedCentenas = new Set();

  const pickForDezena = (dz, allowRepeatCentena) => {
    const countsMilhar = new Map();
    for (const m4 of prizes) {
      if (getDezena2(m4) !== dz) continue;
      countsMilhar.set(m4, (countsMilhar.get(m4) || 0) + 1);
    }

    const ranked = Array.from(countsMilhar.entries())
      .sort((a, b) => b[1] - a[1] || milharCompareAsc(a[0], b[0]))
      .map((x) => x[0]);

    const picked = [];

    for (const m4 of ranked) {
      if (picked.length >= 4) break;
      const cent = getCentena3(m4);
      if (!cent) continue;
      if (!allowRepeatCentena && usedCentenas.has(cent)) continue;
      if (!allowRepeatCentena) usedCentenas.add(cent);
      picked.push(m4);
    }

    if (picked.length < 4) {
      for (const m4 of ranked) {
        if (picked.length >= 4) break;
        if (picked.includes(m4)) continue;
        const cent = getCentena3(m4);
        if (!cent) continue;
        if (!allowRepeatCentena && usedCentenas.has(cent)) continue;
        if (!allowRepeatCentena) usedCentenas.add(cent);
        picked.push(m4);
      }
    }

    picked.sort(milharCompareByCentenaAsc);
    return picked.map((m4) => ({ dezena: dz, milhar: m4 }));
  };

  const byDezena = new Map();
  for (const dz of topDezenas) {
    byDezena.set(dz, pickForDezena(dz, false));
  }

  let slots = [];
  for (const dz of topDezenas) {
    const arr = byDezena.get(dz) || [];
    for (let i = 0; i < 4; i += 1) slots.push(arr[i] || { dezena: dz, milhar: "" });
  }

  const emptyCount = slots.filter((s) => !safeStr(s.milhar)).length;
  if (emptyCount > 0) {
    const byDezena2 = new Map();
    for (const dz of topDezenas) {
      byDezena2.set(dz, pickForDezena(dz, true));
    }

    const slots2 = [];
    for (const dz of topDezenas) {
      const arr = byDezena2.get(dz) || [];
      for (let i = 0; i < 4; i += 1) slots2.push(arr[i] || { dezena: dz, milhar: "" });
    }
    slots = slots2;
  }

  while (slots.length < 16) slots.push({ dezena: "", milhar: "" });
  return { dezenas: topDezenas, slots: slots.slice(0, 16) };
}





