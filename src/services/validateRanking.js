// src/services/validateRanking.js

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normaliza qualquer formato de grupo para "01".."25".
 * Aceita:
 * - 7, "7", "07"
 * - "Grupo 7", "GRUPO 07", "G7", "G-07"
 * - "25 - VACA", "grupo:25"
 *
 * Retorna "00" se inválido.
 */
function normalizeGrupo(g) {
  const s0 = String(g ?? "").trim();
  if (!s0) return "00";

  // 1) se já vier exatamente "07"
  if (/^\d{2}$/.test(s0)) {
    const n = Number(s0);
    if (!Number.isFinite(n) || n < 1 || n > 25) return "00";
    return pad2(n);
  }

  // 2) se vier "7"
  if (/^\d{1,2}$/.test(s0)) {
    const n = Number(s0);
    if (!Number.isFinite(n) || n < 1 || n > 25) return "00";
    return pad2(n);
  }

  // 3) extrai 1-2 dígitos de dentro do texto (ex.: "Grupo 25", "25 - VACA")
  const m = s0.match(/(\d{1,2})/);
  if (m) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1 || n > 25) return "00";
    return pad2(n);
  }

  return "00";
}

export function validateRankingLineByLine(expectedCounts, rankingRows) {
  const issues = [];
  const gotMap = new Map();

  const ignoredExpectedKeys = [];
  const ignoredRows = [];

  // expectedCounts normalizado
  const expectedNorm = {};
  for (const [k, v] of Object.entries(expectedCounts || {})) {
    const g = normalizeGrupo(k);
    if (g === "00") {
      ignoredExpectedKeys.push(String(k));
      continue;
    }
    expectedNorm[g] = toNumber(v);
  }

  // soma rows por grupo
  for (const r of rankingRows || []) {
    const rawG = r?.grupo ?? r?.group;
    const g = normalizeGrupo(rawG);
    if (g === "00") {
      ignoredRows.push({ rawGrupo: rawG, row: r });
      continue;
    }

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

    issues.push({ grupo: g, esperado: expected, obtido: got, delta, status });
  }

  const totalEsperado = allGroups.reduce(
    (acc, g) => acc + toNumber(expectedNorm?.[g] ?? 0),
    0
  );

  const totalObtido = Array.from(gotMap.values()).reduce(
    (acc, v) => acc + toNumber(v),
    0
  );

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

    // extras p/ debug
    ignoredExpectedKeys,
    ignoredRowsCount: ignoredRows.length,
  };
}