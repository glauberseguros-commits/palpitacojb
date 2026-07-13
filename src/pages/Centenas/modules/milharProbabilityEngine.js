// src/pages/Centenas/modules/milharProbabilityEngine.js

/*
==========================================================
Motor Probabilístico de Milhares — V1
==========================================================

Contrato:
- recebe uma centena de 3 dígitos;
- recebe os prêmios do recorte já filtrado;
- avalia os 10 prefixos possíveis (0 a 9);
- retorna uma única milhar vencedora;
- não altera nem repete as centenas;
- não depende de React ou da interface.

Score V1:
- 55% frequência exata da milhar;
- 25% força do prefixo na mesma dezena;
- 10% força geral do prefixo no recorte;
- 10% recência da milhar exata.
*/

const DEFAULT_WEIGHTS = Object.freeze({
  exactFrequency: 0.55,
  prefixSameDezena: 0.25,
  prefixOverall: 0.10,
  exactRecency: 0.10,
});

function digitsOnly(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

export function normalizeCentena3(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";

  return digits.slice(-3).padStart(3, "0");
}

export function normalizeMilhar4(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";

  return digits.slice(-4).padStart(4, "0");
}

export function pickMilharFromPrize(prize) {
  if (!prize || typeof prize !== "object") return "";

  const candidates = [
    prize.milhar4,
    prize.milhar,
    prize.numero,
    prize.number,
    prize.num,
    prize.n,
    prize.valor,
    prize.value,
    prize.resultado,
    prize.result,
    prize.raw,
  ];

  for (const candidate of candidates) {
    const milhar = normalizeMilhar4(candidate);
    if (milhar) return milhar;
  }

  return "";
}

export function buildMilharCandidates(centena) {
  const centena3 = normalizeCentena3(centena);
  if (!centena3) return [];

  return Array.from({ length: 10 }, (_, prefix) => ({
    prefix: String(prefix),
    centena: centena3,
    milhar: `${prefix}${centena3}`,
  }));
}

function normalizeRatio(value, maxValue) {
  const n = Number(value) || 0;
  const max = Number(maxValue) || 0;

  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, n / max));
}

function normalizeWeights(customWeights = {}) {
  const merged = {
    ...DEFAULT_WEIGHTS,
    ...(customWeights && typeof customWeights === "object"
      ? customWeights
      : {}),
  };

  const keys = Object.keys(DEFAULT_WEIGHTS);
  const total = keys.reduce(
    (sum, key) => sum + Math.max(0, Number(merged[key]) || 0),
    0
  );

  if (total <= 0) return { ...DEFAULT_WEIGHTS };

  return keys.reduce((out, key) => {
    out[key] = Math.max(0, Number(merged[key]) || 0) / total;
    return out;
  }, {});
}

export function rankMilharCandidates({
  centena,
  prizes = [],
  weights = DEFAULT_WEIGHTS,
} = {}) {
  const centena3 = normalizeCentena3(centena);
  const candidates = buildMilharCandidates(centena3);

  if (!centena3 || !candidates.length) return [];

  const dezena = centena3.slice(-2);
  const rows = [];

  for (let index = 0; index < prizes.length; index += 1) {
    const milhar = pickMilharFromPrize(prizes[index]);
    if (!milhar) continue;

    rows.push({
      milhar,
      prefix: milhar.slice(0, 1),
      centena: milhar.slice(-3),
      dezena: milhar.slice(-2),
      sequence: index + 1,
    });
  }

  const totalRows = rows.length;

  const exactCount = new Map();
  const exactLastSeen = new Map();
  const prefixSameDezenaCount = new Map();
  const prefixOverallCount = new Map();

  for (const row of rows) {
    exactCount.set(row.milhar, (exactCount.get(row.milhar) || 0) + 1);
    exactLastSeen.set(row.milhar, row.sequence);

    prefixOverallCount.set(
      row.prefix,
      (prefixOverallCount.get(row.prefix) || 0) + 1
    );

    if (row.dezena === dezena) {
      prefixSameDezenaCount.set(
        row.prefix,
        (prefixSameDezenaCount.get(row.prefix) || 0) + 1
      );
    }
  }

  const maxExact = Math.max(
    0,
    ...candidates.map((candidate) => exactCount.get(candidate.milhar) || 0)
  );

  const maxPrefixSameDezena = Math.max(
    0,
    ...candidates.map(
      (candidate) => prefixSameDezenaCount.get(candidate.prefix) || 0
    )
  );

  const maxPrefixOverall = Math.max(
    0,
    ...candidates.map(
      (candidate) => prefixOverallCount.get(candidate.prefix) || 0
    )
  );

  const normalizedWeights = normalizeWeights(weights);

  const ranking = candidates.map((candidate) => {
    const countExact = exactCount.get(candidate.milhar) || 0;
    const countPrefixSameDezena =
      prefixSameDezenaCount.get(candidate.prefix) || 0;
    const countPrefixOverall =
      prefixOverallCount.get(candidate.prefix) || 0;
    const lastSeen = exactLastSeen.get(candidate.milhar) || 0;

    const exactFrequency = normalizeRatio(countExact, maxExact);
    const prefixSameDezena = normalizeRatio(
      countPrefixSameDezena,
      maxPrefixSameDezena
    );
    const prefixOverall = normalizeRatio(
      countPrefixOverall,
      maxPrefixOverall
    );
    const exactRecency = normalizeRatio(lastSeen, totalRows);

    const score =
      exactFrequency * normalizedWeights.exactFrequency +
      prefixSameDezena * normalizedWeights.prefixSameDezena +
      prefixOverall * normalizedWeights.prefixOverall +
      exactRecency * normalizedWeights.exactRecency;

    return {
      ...candidate,
      score: Number((score * 100).toFixed(4)),
      evidence: {
        exactFrequency: {
          count: countExact,
          normalized: Number(exactFrequency.toFixed(6)),
        },
        prefixSameDezena: {
          count: countPrefixSameDezena,
          normalized: Number(prefixSameDezena.toFixed(6)),
        },
        prefixOverall: {
          count: countPrefixOverall,
          normalized: Number(prefixOverall.toFixed(6)),
        },
        exactRecency: {
          lastSeen,
          totalRows,
          normalized: Number(exactRecency.toFixed(6)),
        },
      },
    };
  });

  ranking.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    const aExact = a.evidence.exactFrequency.count;
    const bExact = b.evidence.exactFrequency.count;
    if (bExact !== aExact) return bExact - aExact;

    const aSame = a.evidence.prefixSameDezena.count;
    const bSame = b.evidence.prefixSameDezena.count;
    if (bSame !== aSame) return bSame - aSame;

    const aOverall = a.evidence.prefixOverall.count;
    const bOverall = b.evidence.prefixOverall.count;
    if (bOverall !== aOverall) return bOverall - aOverall;

    const aLastSeen = a.evidence.exactRecency.lastSeen;
    const bLastSeen = b.evidence.exactRecency.lastSeen;
    if (bLastSeen !== aLastSeen) return bLastSeen - aLastSeen;

    return Number(a.prefix) - Number(b.prefix);
  });

  return ranking.map((item, index) => ({
    position: index + 1,
    ...item,
  }));
}

export function chooseBestMilhar(args = {}) {
  const ranking = rankMilharCandidates(args);

  return {
    centena: normalizeCentena3(args.centena),
    winner: ranking[0] || null,
    ranking,
    sampleSize: Array.isArray(args.prizes) ? args.prizes.length : 0,
    weights: normalizeWeights(args.weights),
    model: "MILHAR_PROBABILITY_V1",
  };
}
