import { pickPrize1GrupoFromDraw } from "./top3.engine";

/*
TOP3+ — Cadeia de Bichos
Modelo de transição de grupos
*/

export function computeChainTransitions(draws) {
  const list = Array.isArray(draws) ? draws : [];
  const transitions = new Map();

  for (let i = 0; i < list.length - 1; i++) {
    const g1 = pickPrize1GrupoFromDraw(list[i]);
    const g2 = pickPrize1GrupoFromDraw(list[i + 1]);

    if (!g1 || !g2) continue;

    if (!transitions.has(g1)) {
      transitions.set(g1, new Map());
    }

    const map = transitions.get(g1);
    map.set(g2, (map.get(g2) || 0) + 1);
  }

  return transitions;
}

export function predictNextGrupoFromChain(draws, topN = 3) {
  const list = Array.isArray(draws) ? draws : [];
  if (!list.length) return [];

  const transitions = computeChainTransitions(list);

  const lastGrupo = pickPrize1GrupoFromDraw(list[list.length - 1]);

  const map = transitions.get(lastGrupo);

  if (!map) return [];

  const ranked = Array.from(map.entries())
    .sort((a,b)=> b[1]-a[1])
    .slice(0, topN)
    .map(([grupo,freq],i)=>({
      rank:i+1,
      grupo:Number(grupo),
      freq:Number(freq)
    }));

  return ranked;
}