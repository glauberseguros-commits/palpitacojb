import {
  pickPrize1GrupoFromDraw,
  pickDrawYMD,
  pickDrawHour,
} from "./top3.engine";
import { isYMD, toHourBucket, hourToInt } from "./top3.formatters";

/*
TOP3+ — Cadeia de Bichos
Modelo de transição de grupos
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

export function computeChainTransitions(draws) {
  const list = dedupeAndSortDraws(draws);
  const transitions = new Map();

  for (let i = 0; i < list.length - 1; i += 1) {
    const g1 = pickPrize1GrupoFromDraw(list[i]);
    const g2 = pickPrize1GrupoFromDraw(list[i + 1]);

    if (!Number.isFinite(Number(g1)) || !Number.isFinite(Number(g2))) continue;
    if (Number(g1) < 1 || Number(g1) > 25 || Number(g2) < 1 || Number(g2) > 25) continue;

    const from = Number(g1);
    const to = Number(g2);

    if (!transitions.has(from)) {
      transitions.set(from, new Map());
    }

    const map = transitions.get(from);
    map.set(to, safeInt(map.get(to), 0) + 1);
  }

  return transitions;
}

export function predictNextGrupoFromChain(draws, topN = 3) {
  const list = dedupeAndSortDraws(draws);
  if (!list.length) return [];

  const transitions = computeChainTransitions(list);
  const lastGrupo = pickPrize1GrupoFromDraw(list[list.length - 1]);

  if (!Number.isFinite(Number(lastGrupo))) return [];

  const map = transitions.get(Number(lastGrupo));
  if (!map || !map.size) return [];

  const total = Array.from(map.values()).reduce((acc, n) => acc + safeInt(n, 0), 0);

  return Array.from(map.entries())
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
      basedOnGrupo: Number(lastGrupo),
      totalTransitionsFromGrupo: total,
    }));
}