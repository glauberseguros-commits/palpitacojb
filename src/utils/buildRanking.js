/**
 * Constrói ranking a partir dos draws KingApostas
 *
 * Entrada:
 * [
 *   {
 *     drawId,
 *     close_hour,
 *     prizes: [
 *       { group|grupo, animal, number?, position? }
 *     ]
 *   }
 * ]
 *
 * Saída:
 * {
 *   ranking: [
 *     { grupo, animal, total }
 *   ],
 *   top3: [...],
 *   totalOcorrencias
 * }
 */

export function buildRanking(draws) {
  const map = new Map();
  let totalOcorrencias = 0;

  for (const draw of draws || []) {
    const prizes = Array.isArray(draw?.prizes) ? draw.prizes : [];

    for (const prize of prizes) {
      const grupoRaw = prize?.grupo ?? prize?.group; // aceita ambos
      const animalRaw = prize?.animal;

      if (!grupoRaw || !animalRaw) continue;

      const grupo = String(grupoRaw).padStart(2, "0");
      const animal = String(animalRaw).toUpperCase();

      const key = `${grupo}|${animal}`;

      if (!map.has(key)) {
        map.set(key, { grupo, animal, total: 0 });
      }

      map.get(key).total += 1;
      totalOcorrencias += 1;
    }
  }

  const ranking = Array.from(map.values()).sort((a, b) => b.total - a.total);

  return {
    ranking,
    top3: ranking.slice(0, 3),
    totalOcorrencias,
  };
}
