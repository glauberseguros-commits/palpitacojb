// src/services/validateRanking.js

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normaliza grupo para "01".."25"
 * Aceita: 1, "1", "01", " 01 ", etc.
 * Se vier fora do range 1..25, retorna "00".
 */
function normalizeGrupo(g) {
  const s = String(g ?? "").trim();
  if (!s) return "00";

  // se já vier com 2 dígitos (ex: "01", " 01 ")
  if (/^\d{2}$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 1 || n > 25) return "00";
    return pad2(n); // ✅ garante "01".."25" SEM espaços / formatação consistente
  }

  // se vier "1" etc
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1 || n > 25) return "00";
  return pad2(n);
}

/**
 * expectedCounts: { "01": 161, "02": 194, ... } (ou pode vir "1": 161)
 * rankingRows: [{ grupo|group, animal, total|apar|count }, ...]
 *
 * Saída:
 * - issues: 25 linhas (01..25) com esperado/obtido/delta/status
 * - okCount/diffCount
 * - totais (esperado/obtido/delta)
 * - gotMapObj: mapa obtido (serializável)
 */
export function validateRankingLineByLine(expectedCounts, rankingRows) {
  const issues = [];
  const gotMap = new Map();

  // ✅ Normaliza expectedCounts para garantir chaves "01".."25"
  const expectedNorm = {};
  for (const [k, v] of Object.entries(expectedCounts || {})) {
    const g = normalizeGrupo(k);
    if (g !== "00") expectedNorm[g] = toNumber(v);
  }

  // Agrupa por grupo (soma), para o caso de rankingRows vir com duplicados por grupo
  for (const r of rankingRows || []) {
    const g = normalizeGrupo(r?.grupo ?? r?.group);
    if (g === "00") continue; // ignora lixo/fora do range

    // aceita total/apar/count/value (fallback)
    const val = toNumber(r?.apar ?? r?.total ?? r?.count ?? r?.value ?? 0);
    gotMap.set(g, toNumber(gotMap.get(g)) + val);
  }

  const allGroups = Array.from({ length: 25 }, (_, i) => pad2(i + 1));

  let okCount = 0;
  let diffCount = 0;

  for (const g of allGroups) {
    const expected = toNumber(expectedNorm?.[g] ?? 0);
    const got = toNumber(gotMap.get(g) ?? 0);
    const delta = got - expected;

    const status = delta === 0 ? "OK" : "DIF";
    if (status === "OK") okCount += 1;
    else diffCount += 1;

    issues.push({
      grupo: g,
      esperado: expected,
      obtido: got,
      delta,
      status,
    });
  }

  // Total esperado: soma apenas 01..25
  const totalEsperado = allGroups.reduce(
    (acc, g) => acc + toNumber(expectedNorm?.[g] ?? 0),
    0
  );

  const totalObtido = Array.from(gotMap.values()).reduce(
    (acc, v) => acc + toNumber(v),
    0
  );

  // Versão serializável do gotMap (útil para console.log / JSON)
  const gotMapObj = {};
  for (const g of allGroups) gotMapObj[g] = toNumber(gotMap.get(g) ?? 0);

  return {
    issues,
    okCount,
    diffCount,
    totalEsperado,
    totalObtido,
    totalDelta: totalObtido - totalEsperado,
    gotMapObj,
  };
}
