/**
 * Constrói ranking a partir dos draws KingApostas
 *
 * Entrada:
 * [
 *   {
 *     drawId,
 *     close_hour,
 *     prizes: [
 *       { grupo|group, animal, position? }
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

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Normaliza texto para evitar split indevido (ÁGUIA vs AGUIA etc.)
function normalizeAnimal(a) {
  return String(a || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/\s+/g, " "); // colapsa espaços
}

export function buildRanking(draws) {
  const map = new Map(); // key = "01".."25"
  let totalOcorrencias = 0;

  for (const draw of draws || []) {
    const prizes = Array.isArray(draw?.prizes) ? draw.prizes : [];

    for (const prize of prizes) {
      const grupoRaw = prize?.grupo ?? prize?.group;
      const animalRaw = prize?.animal;

      if (grupoRaw == null) continue;

      const grupoNum = Number(grupoRaw);
      if (!Number.isFinite(grupoNum)) continue;
      if (grupoNum < 1 || grupoNum > 25) continue;

      const grupo = pad2(grupoNum);

      // animal é “label”; se não vier, não impede contar o grupo
      const animal = animalRaw ? normalizeAnimal(animalRaw) : "";

      if (!map.has(grupo)) {
        map.set(grupo, { grupo, animal, total: 0 });
      } else {
        // Se o animal vier em branco num prize e preenchido em outro, preserva o preenchido.
        const curr = map.get(grupo);
        if (!curr.animal && animal) curr.animal = animal;
      }

      map.get(grupo).total += 1;
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
