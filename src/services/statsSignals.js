// src/services/statsSignals.js

/* ============================================================
   PalPitaco JB — Motor de Sinais (Analytics)
   - Não prevê, não promete: pontua "candidatos" por camadas.
   - Camadas:
     (A) Base do horário (frequência do grupo no horário alvo)
     (B) Transição (prevGrupo -> nextGrupo no horário alvo)
     (C) Transição filtrada por Dia da Semana (DOW)
     (D) Transição filtrada por Dia do Mês (DOM)

   Entrada:
   - drawsRange: lista de draws (preferencialmente detailed), com prizes embutidos
   - schedule: grade válida do PT_RIO para a data analisada
   - ymdTarget: "YYYY-MM-DD"
   - hourBucket: "09:00" etc (alvo efetivo da análise)
   - prevGrupo: grupo do 1º prêmio do sorteio anterior (camada)

   Saída:
   - { top, scored, meta }  (top = 3 itens já com percentuais)
============================================================ */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function normalizeHourLike(value) {
  const s0 = safeStr(value);
  if (!s0) return "";
  const s = s0.replace(/\s+/g, "");

  const mhx = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (mhx) return `${pad2(mhx[1])}:00`;

  const mISO = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (mISO) return `${pad2(mISO[1])}:${pad2(mISO[2])}`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  return s0;
}

function toHourBucket(hhmm) {
  const s = normalizeHourLike(hhmm);
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return s;
  return `${m[1]}:00`;
}

function getDowKey(ymd) {
  if (!isYMD(ymd)) return null;
  const [Y, M, D] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Y, M - 1, D);
  // 0=Dom..6=Sáb
  return dt.getDay();
}

function getDomNumber(ymd) {
  if (!isYMD(ymd)) return null;
  const m = ymd.match(/^\d{4}-\d{2}-(\d{2})$/);
  if (!m) return null;
  return Number(m[1]);
}

function scheduleSet(schedule) {
  return new Set((Array.isArray(schedule) ? schedule : []).map(toHourBucket));
}

/* ===== prizes parsing (igual lógica do seu Top3 atual) ===== */

function guessPrizePos(p) {
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

function guessPrizeGrupo(p) {
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

function pickDrawHour(draw) {
  return normalizeHourLike(
    draw?.close_hour || draw?.closeHour || draw?.hour || draw?.hora || ""
  );
}

function pickDrawYMD(draw) {
  const y =
    draw?.ymd ||
    safeStr(draw?.date || "") ||
    safeStr(draw?.data || "") ||
    safeStr(draw?.dt || "") ||
    "";
  // se vier dd/mm/yyyy, deixa quieto (o Top3 já manda ymd correto normalmente)
  return y;
}

/**
 * Extrai grupo do 1º prêmio do draw:
 * - tenta prizes (modo detailed)
 * - tenta alguns campos comuns (fallback)
 */
function pickPrize1GrupoFromDraw(draw) {
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

function addDaysYMD(ymd, deltaDays) {
  if (!isYMD(ymd)) return ymd;
  const [Y, M, D] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Y, M - 1, D);
  dt.setDate(dt.getDate() + Number(deltaDays || 0));
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function prevHourFromSchedule(schedule, targetHour) {
  const sch = Array.isArray(schedule) && schedule.length ? schedule : [];
  const t = toHourBucket(targetHour);
  const idx = sch.findIndex((h) => toHourBucket(h) === t);
  if (idx < 0) return null;
  if (idx > 0) return sch[idx - 1];
  return null;
}

function prob(count, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(1, Number(count || 0) / total));
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, Number(x || 0)));
}

/**
 * Motor principal
 */
export function computeTop3Signals({
  drawsRange,
  schedule,
  ymdTarget,
  hourBucket,
  prevGrupo,
  weights,
  mins,
}) {
  const list = Array.isArray(drawsRange) ? drawsRange : [];
  const schSet = scheduleSet(schedule);

  const target = toHourBucket(hourBucket);
  if (!target) {
    return {
      top: [],
      scored: [],
      meta: { reason: "no_target_hour" },
    };
  }

  const curYmd = safeStr(ymdTarget);
  const curDow = getDowKey(curYmd);
  const curDom = getDomNumber(curYmd);

  const prevG = Number.isFinite(Number(prevGrupo)) ? Number(prevGrupo) : null;

  // defaults (mantém seu comportamento atual, mas agora configurável)
  const W = {
    base: 1.0,
    trans: 0.65,
    dow: 0.35,
    dom: 0.25,
    ...(weights || {}),
  };

  const MIN = {
    trans: 6,
    dow: 4,
    dom: 3,
    ...(mins || {}),
  };

  // map `${ymd}__${hour}` -> grupo1
  const byKey = new Map();

  for (const d of list) {
    const y = pickDrawYMD(d);
    if (!isYMD(y)) continue;

    const h = toHourBucket(pickDrawHour(d));
    if (!h) continue;

    // ignora horas fora da grade (evita Federal/20h)
    if (!schSet.has(h)) continue;

    const g1 = pickPrize1GrupoFromDraw(d);
    if (!Number.isFinite(Number(g1))) continue;

    byKey.set(`${y}__${h}`, Number(g1));
  }

  // (A) Base counts no horário alvo
  const baseCounts = new Map();
  let baseTotal = 0;

  for (const [k, g] of byKey.entries()) {
    const hour = k.split("__")[1] || "";
    if (hour !== target) continue;
    baseTotal += 1;
    baseCounts.set(g, (baseCounts.get(g) || 0) + 1);
  }

  if (baseTotal <= 0) {
    return {
      top: [],
      scored: [],
      meta: {
        reason: "no_samples_base_hour",
        hour: target,
      },
    };
  }

  // transições: prevG -> nextG no horário alvo
  const prevHourSameDay = prevHourFromSchedule(schedule, target);
  const lastHourInDay =
    (Array.isArray(schedule) && schedule.length
      ? toHourBucket(schedule[schedule.length - 1])
      : "21:00") || "21:00";

  const transitions = [];
  for (const [k, nextG] of byKey.entries()) {
    const [y, hour] = k.split("__");
    if (hour !== target) continue;

    let pG = null;

    if (prevHourSameDay) {
      pG = byKey.get(`${y}__${toHourBucket(prevHourSameDay)}`) ?? null;
    } else {
      // primeira hora do dia: pega última do dia anterior
      const yPrev = addDaysYMD(y, -1);
      pG = byKey.get(`${yPrev}__${lastHourInDay}`) ?? null;
    }

    if (!Number.isFinite(Number(pG))) continue;

    transitions.push({
      ymd: y,
      dow: getDowKey(y),
      dom: getDomNumber(y),
      prevG: Number(pG),
      nextG: Number(nextG),
    });
  }

  const transCounts = new Map();
  const transCountsDow = new Map();
  const transCountsDom = new Map();

  let transTotal = 0;
  let transTotalDow = 0;
  let transTotalDom = 0;

  if (prevG != null) {
    for (const t of transitions) {
      if (t.prevG !== prevG) continue;

      transTotal += 1;
      transCounts.set(t.nextG, (transCounts.get(t.nextG) || 0) + 1);

      if (curDow != null && t.dow === curDow) {
        transTotalDow += 1;
        transCountsDow.set(t.nextG, (transCountsDow.get(t.nextG) || 0) + 1);
      }

      if (curDom != null && t.dom === curDom) {
        transTotalDom += 1;
        transCountsDom.set(t.nextG, (transCountsDom.get(t.nextG) || 0) + 1);
      }
    }
  }

  const useTrans = prevG != null && transTotal >= MIN.trans;
  const useDow = prevG != null && transTotalDow >= MIN.dow;
  const useDom = prevG != null && transTotalDom >= MIN.dom;

  const candidates = Array.from(baseCounts.keys());

  const scored = candidates.map((g) => {
    const baseHit = baseCounts.get(g) || 0;
    const pBase = prob(baseHit, baseTotal);

    const transHit = transCounts.get(g) || 0;
    const pTrans = prob(transHit, transTotal);

    const dowHit = transCountsDow.get(g) || 0;
    const pDow = prob(dowHit, transTotalDow);

    const domHit = transCountsDom.get(g) || 0;
    const pDom = prob(domHit, transTotalDom);

    // bônus capados (pra não “explodir” score em amostra pequena)
    const bonusTrans = useTrans ? clamp(pTrans, 0, 0.55) : 0;
    const bonusDow = useDow ? clamp(pDow, 0, 0.40) : 0;
    const bonusDom = useDom ? clamp(pDom, 0, 0.32) : 0;

    const finalScore =
      W.base * pBase + W.trans * bonusTrans + W.dow * bonusDow + W.dom * bonusDom;

    const reasons = [];

    reasons.push(
      `Base do horário ${target}: ${baseHit}/${baseTotal} (${Math.round(pBase * 100)}%)`
    );

    if (prevG == null) {
      reasons.push(`Transição: sem sorteio anterior válido (camada desligada)`);
    } else if (!useTrans) {
      reasons.push(
        `Transição (G${pad2(prevG)}→?): amostra pequena (${transTotal}), mínimo ${MIN.trans}`
      );
    } else {
      reasons.push(
        `Transição (G${pad2(prevG)}→G${pad2(g)}): ${transHit}/${transTotal} (${Math.round(
          pTrans * 100
        )}%)`
      );
    }

    if (useDow) {
      reasons.push(
        `DOW: ${dowHit}/${transTotalDow} (${Math.round(pDow * 100)}%)`
      );
    } else if (prevG != null) {
      reasons.push(`DOW: amostra pequena (${transTotalDow}), mínimo ${MIN.dow}`);
    }

    if (useDom) {
      reasons.push(
        `DOM: ${domHit}/${transTotalDom} (${Math.round(pDom * 100)}%)`
      );
    } else if (prevG != null) {
      reasons.push(`DOM: amostra pequena (${transTotalDom}), mínimo ${MIN.dom}`);
    }

    return {
      grupo: g,
      baseHit,
      baseTotal,
      prevGrupo: prevG,
      transHit,
      transTotal,
      dowHit,
      transTotalDow,
      domHit,
      transTotalDom,
      useTrans,
      useDow,
      useDom,
      pBase,
      pTrans,
      pDow,
      pDom,
      finalScore,
      reasons,
    };
  });

  scored.sort(
    (a, b) =>
      b.finalScore - a.finalScore ||
      b.baseHit - a.baseHit ||
      a.grupo - b.grupo
  );

  const best = scored.slice(0, 3);
  const sum = best.reduce((acc, x) => acc + (Number(x.finalScore) || 0), 0) || 1;

  const top = best.map((x, idx) => {
    const pct = Math.round(((Number(x.finalScore) || 0) / sum) * 100);
    return {
      ...x,
      rank: idx + 1,
      pct,
      title:
        idx === 0 ? "Principal" : idx === 1 ? "Alternativa" : "Terceira opção",
    };
  });

  return {
    top,
    scored,
    meta: {
      targetHour: target,
      baseTotal,
      prevGrupo: prevG,
      transTotal,
      transTotalDow,
      transTotalDom,
      useTrans,
      useDow,
      useDom,
      weights: W,
      mins: MIN,
      dayContext: { ymd: curYmd, dow: curDow, dom: curDom },
    },
  };
}
