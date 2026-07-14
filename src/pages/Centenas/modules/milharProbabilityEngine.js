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
  fallbackPrizes = [],
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

  const fallbackRows = [];

  for (
    let index = 0;
    index < fallbackPrizes.length;
    index += 1
  ) {
    const milhar = pickMilharFromPrize(
      fallbackPrizes[index]
    );

    if (!milhar) continue;

    fallbackRows.push({
      milhar,
      prefix: milhar.slice(0, 1),
      centena: milhar.slice(-3),
      dezena: milhar.slice(-2),
      sequence: index + 1,
    });
  }

  /*
   * Hierarquia da evidência:
   *
   * 1. ocorrências da própria centena no recorte atual;
   * 2. ocorrências históricas da própria centena;
   * 3. contexto de prefixos do recorte atual;
   * 4. contexto histórico, quando o recorte estiver vazio.
   *
   * Assim, todas as 40 centenas recebem uma milhar sem voltar
   * a aplicar mecanicamente um único prefixo ao grupo inteiro.
   */
  const currentCentenaRows = rows.filter(
    (row) => row.centena === centena3
  );

  const historicalCentenaRows = fallbackRows.filter(
    (row) => row.centena === centena3
  );

  const centenaRows = currentCentenaRows.length
    ? currentCentenaRows
    : historicalCentenaRows;

  const contextRows = rows.length
    ? rows
    : fallbackRows;

  if (
    centenaRows.length === 0 &&
    contextRows.length === 0
  ) {
    return [];
  }

  const totalRows = centenaRows.length;

  const exactCount = new Map();
  const exactLastSeen = new Map();
  const prefixSameDezenaCount = new Map();
  const prefixOverallCount = new Map();

  for (
    let index = 0;
    index < centenaRows.length;
    index += 1
  ) {
    const row = centenaRows[index];

    exactCount.set(
      row.milhar,
      (exactCount.get(row.milhar) || 0) + 1
    );

    exactLastSeen.set(
      row.milhar,
      index + 1
    );
  }

  for (const row of contextRows) {
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
    const exactRecency = totalRows > 0
      ? normalizeRatio(lastSeen, totalRows)
      : 0;

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

    /*
     * O prefixo já participa do score.
     * Não pode voltar a dominar o desempate.
     */
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
    sampleSize: (() => {
      const centena3 = normalizeCentena3(args.centena);

      const currentCount = Array.isArray(args.prizes)
        ? args.prizes.reduce((total, prize) => {
            const milhar = pickMilharFromPrize(prize);

            return milhar.slice(-3) === centena3
              ? total + 1
              : total;
          }, 0)
        : 0;

      if (currentCount > 0) return currentCount;

      return Array.isArray(args.fallbackPrizes)
        ? args.fallbackPrizes.reduce(
            (total, prize) => {
              const milhar = pickMilharFromPrize(prize);

              return milhar.slice(-3) === centena3
                ? total + 1
                : total;
            },
            0
          )
        : 0;
    })(),
    weights: normalizeWeights(args.weights),
    model: "MILHAR_PROBABILITY_V2",
  };
}
/*
==========================================================
Recomendação consolidada — V2
==========================================================

Esta função será a futura fonte única para:

- exibição na tabela;
- botão Copiar;
- envio para aposta.

Ela ainda não está conectada à interface.
*/

function classifySampleQuality(sampleSize) {
  const n = Number(sampleSize) || 0;

  if (n <= 0) return "none";
  if (n < 30) return "low";
  if (n < 100) return "medium";
  return "high";
}

export function buildMilharRecommendation(args = {}) {
  const result = chooseBestMilhar(args);
  const winner = result?.winner || null;
  const sampleSize = Number(result?.sampleSize || 0);

  if (!winner) {
    return {
      ok: false,
      status: "insufficient_evidence",
      model: "MILHAR_PROBABILITY_V2",
      centena: normalizeCentena3(args?.centena),
      milhar: null,
      prefixo: null,
      score: 0,
      confidence: 0,
      sampleSize,
      sampleQuality: classifySampleQuality(sampleSize),
      evidence: null,
      alternatives: [],
      candidates: [],
    };
  }

  const candidates = (result.ranking || [])
    .map((item) => ({
      position: item.position,
      milhar: item.milhar,
      prefixo: item.prefix,
      score: item.score,
    }));

  const alternatives = candidates.slice(0, 3);

  return {
    ok: true,
    status: "recommended",
    model: "MILHAR_PROBABILITY_V2",

    centena: result.centena,
    milhar: winner.milhar,
    prefixo: winner.prefix,

    score: winner.score,
    confidence: Number((winner.score / 100).toFixed(6)),

    sampleSize,
    sampleQuality: classifySampleQuality(sampleSize),

    evidence: {
      exactFrequency: {
        count: Number(
          winner?.evidence?.exactFrequency?.count || 0
        ),
        normalized: Number(
          winner?.evidence?.exactFrequency?.normalized || 0
        ),
      },

      prefixSameDezena: {
        count: Number(
          winner?.evidence?.prefixSameDezena?.count || 0
        ),
        normalized: Number(
          winner?.evidence?.prefixSameDezena?.normalized || 0
        ),
      },

      prefixOverall: {
        count: Number(
          winner?.evidence?.prefixOverall?.count || 0
        ),
        normalized: Number(
          winner?.evidence?.prefixOverall?.normalized || 0
        ),
      },

      exactRecency: {
        lastSeen: Number(
          winner?.evidence?.exactRecency?.lastSeen || 0
        ),
        totalRows: Number(
          winner?.evidence?.exactRecency?.totalRows || 0
        ),
        normalized: Number(
          winner?.evidence?.exactRecency?.normalized || 0
        ),
      },
    },

    alternatives,
    candidates,
  };
}

/*
==========================================================
Diversificação global das 40 recomendações
==========================================================

- preserva a centena de cada linha;
- prioriza o score individual;
- penaliza prefixos já utilizados;
- evita concentração mecânica em poucas famílias;
- mantém resultado determinístico.
*/

export function diversifyMilharRecommendations(
  rows = [],
  {
    maxPerPrefix = 4,
    repeatPenalty = 12,
  } = {}
) {
  const source = Array.isArray(rows) ? rows : [];
  const usage = new Map();

  return source.map((row) => {
    const centena = normalizeCentena3(row?.centena);

    const candidatesRaw = Array.isArray(
      row?.recommendation?.candidates
    )
      ? row.recommendation.candidates
      : [];

    const candidates = candidatesRaw
      .filter((item) => {
        const milhar = normalizeMilhar4(item?.milhar);

        return (
          milhar &&
          milhar.slice(-3) === centena
        );
      })
      .map((item) => ({
        ...item,
        milhar: normalizeMilhar4(item.milhar),
        prefixo: String(
          item?.prefixo ??
          normalizeMilhar4(item.milhar).slice(0, 1)
        ),
        score: Number(item?.score || 0),
      }));

    if (!candidates.length) {
      return row;
    }

    const ranked = candidates
      .map((candidate) => {
        const used = Number(
          usage.get(candidate.prefixo) || 0
        );

        return {
          ...candidate,
          used,
          adjustedScore:
            candidate.score -
            used * Number(repeatPenalty || 0),
        };
      })
      .sort((a, b) => {
        const aBelowLimit =
          a.used < Number(maxPerPrefix || 4);
        const bBelowLimit =
          b.used < Number(maxPerPrefix || 4);

        if (aBelowLimit !== bBelowLimit) {
          return aBelowLimit ? -1 : 1;
        }

        if (b.adjustedScore !== a.adjustedScore) {
          return b.adjustedScore - a.adjustedScore;
        }

        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return Number(a.prefixo) - Number(b.prefixo);
      });

    const selected = ranked[0];

    usage.set(
      selected.prefixo,
      Number(usage.get(selected.prefixo) || 0) + 1
    );

    return {
      ...row,
      milhar: selected.milhar,
      recommendation: {
        ...(row?.recommendation || {}),
        milhar: selected.milhar,
        prefixo: selected.prefixo,
        diversified: true,
        originalMilhar:
          row?.recommendation?.milhar || null,
        diversity: {
          prefixUsageBefore: selected.used,
          adjustedScore: Number(
            selected.adjustedScore.toFixed(4)
          ),
          maxPerPrefix: Number(maxPerPrefix || 4),
          repeatPenalty: Number(repeatPenalty || 0),
        },
      },
    };
  });
}

/*
==========================================================
Auditoria interna do Motor de Milhares
==========================================================

Uso exclusivo das áreas administrativas e de desenvolvimento.

Esta saída não deve ser consumida pela interface pública.
*/

function auditEvidence(item) {
  if (!item) return null;

  return {
    exactFrequency: {
      count: Number(
        item?.evidence?.exactFrequency?.count || 0
      ),
      normalized: Number(
        item?.evidence?.exactFrequency?.normalized || 0
      ),
    },

    prefixSameDezena: {
      count: Number(
        item?.evidence?.prefixSameDezena?.count || 0
      ),
      normalized: Number(
        item?.evidence?.prefixSameDezena?.normalized || 0
      ),
    },

    prefixOverall: {
      count: Number(
        item?.evidence?.prefixOverall?.count || 0
      ),
      normalized: Number(
        item?.evidence?.prefixOverall?.normalized || 0
      ),
    },

    exactRecency: {
      lastSeen: Number(
        item?.evidence?.exactRecency?.lastSeen || 0
      ),
      totalRows: Number(
        item?.evidence?.exactRecency?.totalRows || 0
      ),
      normalized: Number(
        item?.evidence?.exactRecency?.normalized || 0
      ),
    },
  };
}

function auditCandidate(item) {
  return {
    position: Number(item?.position || 0),
    prefixo: String(item?.prefix ?? ""),
    milhar: String(item?.milhar || ""),
    score: Number(item?.score || 0),
    evidence: auditEvidence(item),
  };
}

export function buildMilharAudit(args = {}) {
  const result = chooseBestMilhar(args);
  const recommendation = buildMilharRecommendation(args);

  const ranking = Array.isArray(result?.ranking)
    ? result.ranking.map(auditCandidate)
    : [];

  const winner = ranking[0] || null;
  const runnerUp = ranking[1] || null;

  const scoreGap =
    winner && runnerUp
      ? Number(
          (
            Number(winner.score || 0) -
            Number(runnerUp.score || 0)
          ).toFixed(6)
        )
      : 0;

  return {
    scope: "internal_developer_only",
    publicExposureAllowed: false,

    ok: recommendation.ok === true,
    status: recommendation.status,

    model: String(
      recommendation.model ||
      result?.model ||
      "MILHAR_PROBABILITY_V2"
    ),

    centena: recommendation.centena,
    selectedMilhar: recommendation.milhar,
    selectedPrefixo: recommendation.prefixo,

    score: Number(recommendation.score || 0),
    confidence: Number(recommendation.confidence || 0),
    scoreGap,

    sample: {
      size: Number(recommendation.sampleSize || 0),
      quality: String(
        recommendation.sampleQuality || "none"
      ),
    },

    weights: {
      ...(result?.weights || {}),
    },

    winner,
    runnerUp,
    ranking,

    alternatives: Array.isArray(
      recommendation.alternatives
    )
      ? recommendation.alternatives.map((item) => ({
          position: Number(item?.position || 0),
          milhar: String(item?.milhar || ""),
          prefixo: String(item?.prefixo ?? ""),
          score: Number(item?.score || 0),
        }))
      : [],
  };
}
