import {
  pickPrize1GrupoFromDraw,
  pickDrawYMD,
  pickDrawHour,
} from "./top3.engine";
import { isYMD, toHourBucket, hourToInt } from "./top3.formatters";

/*
TOP3+ — Cadeia de Bichos
Modelo de transição de grupos
✅ Corrigido para funcionar por SLOT ALVO
- entende targetYmd / targetHourBucket
- encontra o draw imediatamente anterior ao alvo
- separa transições por faixa de horário
*/

function safeInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function drawSortTs(draw) {
  const y = pickDrawYMD(draw);
  const h = toHourBucket(pickDrawHour(draw));

  if (!isYMD(y)) return Number.POSITIVE_INFINITY;

  const [Y, M, D] = y.split("-").map(Number);
  const base = Date.UTC(Y, M - 1, D);
  const mins = hourToInt(h);
  const add = mins >= 0 ? mins * 60 * 1000 : 0;

  return base + add;
}

function slotTs(ymd, hourBucket) {
  if (!isYMD(ymd)) return Number.POSITIVE_INFINITY;

  const [Y, M, D] = String(ymd).split("-").map(Number);
  const base = Date.UTC(Y, M - 1, D);
  const mins = hourToInt(toHourBucket(hourBucket));
  const add = mins >= 0 ? mins * 60 * 1000 : 0;

  return base + add;
}

function dedupeAndSortDraws(draws) {
  const list = Array.isArray(draws) ? draws : [];
  const map = new Map();

  for (const d of list) {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    const key =
      String(d?.id || d?.drawId || "").trim() ||
      (isYMD(y) && h ? `${y}|${h}` : "");

    if (!key) continue;
    if (!map.has(key)) map.set(key, d);
  }

  return Array.from(map.values()).sort((a, b) => drawSortTs(a) - drawSortTs(b));
}

function makeEdgeKey(fromHour, toHour) {
  return `${String(fromHour || "").trim()}->${String(toHour || "").trim()}`;
}

function getNestedMap(map, key) {
  if (!map.has(key)) map.set(key, new Map());
  return map.get(key);
}

/**
 * Gera:
 * - transitionsAny: fromGrupo -> toGrupo
 * - transitionsByEdge: "fromHour->toHour" -> fromGrupo -> toGrupo
 */
export function computeChainTransitions(draws) {
  const list = dedupeAndSortDraws(draws);
  const transitionsAny = new Map();
  const transitionsByEdge = new Map();

  for (let i = 0; i < list.length - 1; i += 1) {
    const fromDraw = list[i];
    const toDraw = list[i + 1];

    const fromGrupo = pickPrize1GrupoFromDraw(fromDraw);
    const toGrupo = pickPrize1GrupoFromDraw(toDraw);
    const fromHour = toHourBucket(pickDrawHour(fromDraw));
    const toHour = toHourBucket(pickDrawHour(toDraw));

    if (!Number.isFinite(Number(fromGrupo)) || !Number.isFinite(Number(toGrupo))) continue;
    if (Number(fromGrupo) < 1 || Number(fromGrupo) > 25) continue;
    if (Number(toGrupo) < 1 || Number(toGrupo) > 25) continue;
    if (!fromHour || !toHour) continue;

    const from = Number(fromGrupo);
    const to = Number(toGrupo);

    // transição geral
    const anyRow = getNestedMap(transitionsAny, from);
    anyRow.set(to, safeInt(anyRow.get(to), 0) + 1);

    // transição por aresta horária
    const edgeKey = makeEdgeKey(fromHour, toHour);
    const edgeMap = getNestedMap(transitionsByEdge, edgeKey);
    const edgeRow = getNestedMap(edgeMap, from);
    edgeRow.set(to, safeInt(edgeRow.get(to), 0) + 1);
  }

  return { transitionsAny, transitionsByEdge };
}

function findPreviousDrawForTarget(draws, targetYmd, targetHourBucket) {
  const list = dedupeAndSortDraws(draws);
  if (!list.length) return null;

  const targetTs = slotTs(targetYmd, targetHourBucket);
  if (!Number.isFinite(targetTs)) return null;

  let prev = null;

  for (const d of list) {
    const ts = drawSortTs(d);
    if (!Number.isFinite(ts)) continue;

    if (ts < targetTs) prev = d;
    else break;
  }

  return prev;
}

function rankTransitionMap(rowMap, basedOnGrupo, topN) {
  if (!rowMap || !rowMap.size) return [];

  const total = Array.from(rowMap.values()).reduce(
    (acc, n) => acc + safeInt(n, 0),
    0
  );

  return Array.from(rowMap.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return Number(a[0]) - Number(b[0]);
    })
    .slice(0, Math.max(1, safeInt(topN, 3)))
    .map(([grupo, freq], i) => ({
      rank: i + 1,
      grupo: Number(grupo),
      freq: Number(freq),
      prob: total > 0 ? Number(freq) / total : 0,
      probPct: total > 0 ? Number(((Number(freq) / total) * 100).toFixed(2)) : 0,
      basedOnGrupo: Number(basedOnGrupo),
      totalTransitionsFromGrupo: total,
    }));
}

/**
 * Compatível com 2 modos:
 *
 * Antigo:
 * predictNextGrupoFromChain(draws, topN)
 *
 * Novo:
 * predictNextGrupoFromChain({
 *   draws,
 *   targetYmd,
 *   targetHourBucket,
 *   topN
 * })
 */
export function predictNextGrupoFromChain(arg1, arg2 = 3) {
  // modo legado
  if (Array.isArray(arg1)) {
    const draws = arg1;
    const topN = arg2;

    const list = dedupeAndSortDraws(draws);
    if (!list.length) return [];

    const { transitionsAny } = computeChainTransitions(list);
    const lastDraw = list[list.length - 1];
    const lastGrupo = pickPrize1GrupoFromDraw(lastDraw);

    if (!Number.isFinite(Number(lastGrupo))) return [];

    const rowMap = transitionsAny.get(Number(lastGrupo));
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

  // modo correto por slot alvo
  const {
    draws,
    targetYmd,
    targetHourBucket,
    topN = 3,
  } = arg1 || {};

  const list = dedupeAndSortDraws(draws);
  if (!list.length) return [];

  const targetHour = toHourBucket(targetHourBucket);
  if (!isYMD(targetYmd) || !targetHour) return [];

  const prevDraw = findPreviousDrawForTarget(list, targetYmd, targetHour);
  if (!prevDraw) return [];

  const prevGrupo = pickPrize1GrupoFromDraw(prevDraw);
  const prevHour = toHourBucket(pickDrawHour(prevDraw));
  const prevYmd = pickDrawYMD(prevDraw);

  if (!Number.isFinite(Number(prevGrupo)) || !prevHour || !isYMD(prevYmd)) {
    return [];
  }

  const { transitionsAny, transitionsByEdge } = computeChainTransitions(list);

  const edgeKey = makeEdgeKey(prevHour, targetHour);
  const edgeMap = transitionsByEdge.get(edgeKey) || null;
  const edgeRow = edgeMap ? edgeMap.get(Number(prevGrupo)) : null;

  let ranked = rankTransitionMap(edgeRow, prevGrupo, topN);
  let transitionType = "EDGE";

  if (!ranked.length) {
    const anyRow = transitionsAny.get(Number(prevGrupo)) || null;
    ranked = rankTransitionMap(anyRow, prevGrupo, topN);
    transitionType = "ANY_FALLBACK";
  }

  return ranked.map((x) => ({
    ...x,
    mode: "target_aware",
    basedOnHour: prevHour,
    basedOnYmd: prevYmd,
    targetHour,
    targetYmd,
    transitionType,
    transitionEdge: edgeKey,
  }));
}