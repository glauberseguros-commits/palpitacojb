import {
  pickPrize1GrupoFromDraw,
  pickDrawYMD,
  pickDrawHour,
} from "./top3.engine";

import { isYMD, toHourBucket, hourToInt } from "./top3.formatters";

/*
TOP3+ — Cadeia de Bichos
Modelo de transição de grupos

- Entende targetYmd / targetHourBucket
- Encontra o draw imediatamente anterior ao alvo
- Separa transições por faixa de horário
- Evita ordenar sorteio sem hora como 00h
- Evita vazamento usando apenas histórico anterior ao alvo no modo target_aware
*/

function safeInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function drawSortTs(draw) {
  const y = pickDrawYMD(draw);
  const h = toHourBucket(pickDrawHour(draw));

  if (!isYMD(y) || !h) return Number.POSITIVE_INFINITY;

  const mins = hourToInt(h);
  if (!Number.isFinite(mins) || mins < 0) return Number.POSITIVE_INFINITY;

  const [Y, M, D] = y.split("-").map(Number);
  const base = Date.UTC(Y, M - 1, D);

  return base + mins * 60 * 1000;
}

function slotTs(ymd, hourBucket) {
  const safeYmd = String(ymd || "").trim();
  const h = toHourBucket(hourBucket);

  if (!isYMD(safeYmd) || !h) return Number.POSITIVE_INFINITY;

  const mins = hourToInt(h);
  if (!Number.isFinite(mins) || mins < 0) return Number.POSITIVE_INFINITY;

  const [Y, M, D] = safeYmd.split("-").map(Number);
  const base = Date.UTC(Y, M - 1, D);

  return base + mins * 60 * 1000;
}

function dedupeAndSortDraws(draws) {
  const list = Array.isArray(draws) ? draws : [];
  const map = new Map();

  for (const d of list) {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    const ts = drawSortTs(d);

    if (!Number.isFinite(ts)) continue;

    const key =
      String(d?.id || d?.drawId || "").trim() ||
      (isYMD(y) && h ? `${y}|${h}` : "");

    if (!key) continue;

    const prev = map.get(key);

    if (!prev || ts < drawSortTs(prev)) {
      map.set(key, d);
    }
  }

  return Array.from(map.values()).sort((a, b) => drawSortTs(a) - drawSortTs(b));
}

function makeEdgeKey(fromHour, toHour) {
  const from = toHourBucket(fromHour);
  const to = toHourBucket(toHour);

  if (!from || !to) return "";

  return `${from}->${to}`;
}

function getNestedMap(map, key) {
  if (!map.has(key)) map.set(key, new Map());
  return map.get(key);
}

function getHistoryBeforeTarget(draws, targetYmd, targetHourBucket) {
  const list = dedupeAndSortDraws(draws);
  const target = slotTs(targetYmd, targetHourBucket);

  if (!list.length || !Number.isFinite(target)) return [];

  return list.filter((d) => {
    const ts = drawSortTs(d);
    return Number.isFinite(ts) && ts < target;
  });
}

export function computeChainTransitions(draws) {
  const list = dedupeAndSortDraws(draws);
  const transitionsAny = new Map();
  const transitionsByEdge = new Map();

  for (let i = 0; i < list.length - 1; i += 1) {
    const fromDraw = list[i];
    const toDraw = list[i + 1];

    const fromGrupo = Number(pickPrize1GrupoFromDraw(fromDraw));
    const toGrupo = Number(pickPrize1GrupoFromDraw(toDraw));
    const fromHour = toHourBucket(pickDrawHour(fromDraw));
    const toHour = toHourBucket(pickDrawHour(toDraw));

    if (!Number.isFinite(fromGrupo) || !Number.isFinite(toGrupo)) continue;
    if (fromGrupo < 1 || fromGrupo > 25) continue;
    if (toGrupo < 1 || toGrupo > 25) continue;
    if (!fromHour || !toHour) continue;

    const anyRow = getNestedMap(transitionsAny, fromGrupo);
    anyRow.set(toGrupo, safeInt(anyRow.get(toGrupo), 0) + 1);

    const edgeKey = makeEdgeKey(fromHour, toHour);
    if (!edgeKey) continue;

    const edgeMap = getNestedMap(transitionsByEdge, edgeKey);
    const edgeRow = getNestedMap(edgeMap, fromGrupo);
    edgeRow.set(toGrupo, safeInt(edgeRow.get(toGrupo), 0) + 1);
  }

  return { transitionsAny, transitionsByEdge };
}

function findPreviousDrawForTarget(draws, targetYmd, targetHourBucket) {
  const list = dedupeAndSortDraws(draws);
  if (!list.length) return null;

  const target = slotTs(targetYmd, targetHourBucket);
  if (!Number.isFinite(target)) return null;

  let prev = null;

  for (const d of list) {
    const ts = drawSortTs(d);
    if (!Number.isFinite(ts)) continue;

    if (ts < target) {
      prev = d;
    } else {
      break;
    }
  }

  return prev;
}

function rankTransitionMap(rowMap, basedOnGrupo, topN) {
  if (!rowMap || !rowMap.size) return [];

  const total = Array.from(rowMap.values()).reduce(
    (acc, n) => acc + safeInt(n, 0),
    0
  );

  if (total <= 0) return [];

  return Array.from(rowMap.entries())
    .sort((a, b) => {
      if (Number(b[1]) !== Number(a[1])) return Number(b[1]) - Number(a[1]);
      return Number(a[0]) - Number(b[0]);
    })
    .slice(0, Math.max(1, safeInt(topN, 3)))
    .map(([grupo, freq], i) => {
      const prob = Number(freq) / total;

      return {
        rank: i + 1,
        grupo: Number(grupo),
        freq: Number(freq),
        prob,
        probPct: Number((prob * 100).toFixed(2)),
        basedOnGrupo: Number(basedOnGrupo),
        totalTransitionsFromGrupo: total,
      };
    });
}

export function predictNextGrupoFromChain(arg1, arg2 = 3) {
  if (Array.isArray(arg1)) {
    const draws = arg1;
    const topN = arg2;

    const list = dedupeAndSortDraws(draws);
    if (!list.length) return [];

    const { transitionsAny } = computeChainTransitions(list);
    const lastDraw = list[list.length - 1];
    const lastGrupo = Number(pickPrize1GrupoFromDraw(lastDraw));

    if (!Number.isFinite(lastGrupo) || lastGrupo < 1 || lastGrupo > 25) {
      return [];
    }

    const rowMap = transitionsAny.get(lastGrupo);
    const ranked = rankTransitionMap(rowMap, lastGrupo, topN);

    return ranked.map((x) => ({
      ...x,
      mode: "legacy_any",
      basedOnHour: toHourBucket(pickDrawHour(lastDraw)),
      basedOnYmd: pickDrawYMD(lastDraw),
      targetHour: "",
      targetYmd: "",
      transitionType: "ANY",
      transitionEdge: "",
    }));
  }

  const { draws, targetYmd, targetHourBucket, topN = 3 } = arg1 || {};

  const targetHour = toHourBucket(targetHourBucket);
  const safeTargetYmd = String(targetYmd || "").trim();

  if (!isYMD(safeTargetYmd) || !targetHour) return [];

  const historyBeforeTarget = getHistoryBeforeTarget(
    draws,
    safeTargetYmd,
    targetHour
  );

  if (!historyBeforeTarget.length) return [];

  const prevDraw = historyBeforeTarget[historyBeforeTarget.length - 1];
  if (!prevDraw) return [];

  const prevGrupo = Number(pickPrize1GrupoFromDraw(prevDraw));
  const prevHour = toHourBucket(pickDrawHour(prevDraw));
  const prevYmd = pickDrawYMD(prevDraw);

  if (
    !Number.isFinite(prevGrupo) ||
    prevGrupo < 1 ||
    prevGrupo > 25 ||
    !prevHour ||
    !isYMD(prevYmd)
  ) {
    return [];
  }

  const { transitionsAny, transitionsByEdge } =
    computeChainTransitions(historyBeforeTarget);

  const edgeKey = makeEdgeKey(prevHour, targetHour);
  const edgeMap = edgeKey ? transitionsByEdge.get(edgeKey) || null : null;
  const edgeRow = edgeMap ? edgeMap.get(prevGrupo) : null;

  let ranked = rankTransitionMap(edgeRow, prevGrupo, topN);
  let transitionType = "EDGE";

  if (!ranked.length) {
    const anyRow = transitionsAny.get(prevGrupo) || null;
    ranked = rankTransitionMap(anyRow, prevGrupo, topN);
    transitionType = "ANY_FALLBACK";
  }

  return ranked.map((x) => ({
    ...x,
    mode: "target_aware",
    basedOnHour: prevHour,
    basedOnYmd: prevYmd,
    targetHour,
    targetYmd: safeTargetYmd,
    transitionType,
    transitionEdge: edgeKey,
  }));
}