// src/pages/Centenas/modules/milharProbabilityEngineV3.js

/*
===============================================================================
Motor Contextual de Unidade de Milhar — V3
===============================================================================

Regras:

1. A centena recebida é sempre preservada.
2. São avaliadas somente as unidades de milhar 0 a 9.
3. A repetição histórica da milhar exata NÃO participa do cálculo.
4. A unidade é avaliada pelo comportamento contextual do prefixo.
5. O histórico amplo é apenas evidência auxiliar.
6. A diversificação atua somente na unidade de milhar.
7. A ordem e a frequência das 40 centenas não são alteradas.

Score contextual padrão:

- 50% frequência da unidade no recorte atual;
- 25% tendência recente no histórico;
- 15% recência cronológica da unidade;
- 10% regularidade/distribuição temporal;
- penalidade de fadiga aplicada após excesso recente.
*/

const DEFAULT_WEIGHTS_V3 = Object.freeze({
  contextualFrequency: 0.50,
  recentTrend: 0.25,
  chronologicalRecency: 0.15,
  temporalDistribution: 0.10,
});

const DEFAULT_RECENT_WINDOW = 120;
const DEFAULT_FATIGUE_WINDOW = 30;
const DEFAULT_FATIGUE_PENALTY = 0.18;

function digitsOnly(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCentena3V3(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  return digits.slice(-3).padStart(3, "0");
}

export function normalizeMilhar4V3(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  return digits.slice(-4).padStart(4, "0");
}

export function pickMilharFromPrizeV3(prize) {
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
    const milhar = normalizeMilhar4V3(candidate);
    if (milhar) return milhar;
  }

  return "";
}

function pickYmdFromPrize(prize) {
  const candidates = [
    prize?.dateYmd,
    prize?.ymd,
    prize?.date_ymd,
    prize?.drawYmd,
    prize?.draw_ymd,
    prize?.date,
    prize?.data,
    prize?.day,
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
  }

  return "";
}

function ymdToTimestamp(ymd) {
  const match = String(ymd || "").match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) return Number.NaN;

  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
}

function normalizeWeights(weights = {}) {
  const merged = {
    ...DEFAULT_WEIGHTS_V3,
    ...(weights && typeof weights === "object"
      ? weights
      : {}),
  };

  const sanitized = {};

  for (const key of Object.keys(DEFAULT_WEIGHTS_V3)) {
    sanitized[key] = Math.max(
      0,
      safeNumber(merged[key], 0)
    );
  }

  const total = Object.values(sanitized).reduce(
    (sum, value) => sum + value,
    0
  );

  if (total <= 0) {
    return { ...DEFAULT_WEIGHTS_V3 };
  }

  return Object.fromEntries(
    Object.entries(sanitized).map(
      ([key, value]) => [key, value / total]
    )
  );
}

function normalizeRatio(value, maximum) {
  const n = Math.max(0, safeNumber(value, 0));
  const max = Math.max(0, safeNumber(maximum, 0));

  if (max <= 0) return 0;

  return Math.max(0, Math.min(1, n / max));
}

function buildRows(prizes = []) {
  return (Array.isArray(prizes) ? prizes : [])
    .map((prize, index) => {
      const milhar = pickMilharFromPrizeV3(prize);

      if (!milhar) return null;

      const ymd = pickYmdFromPrize(prize);

      return {
        milhar,
        prefixo: milhar.slice(0, 1),
        centena: milhar.slice(-3),
        ymd,
        timestamp: ymdToTimestamp(ymd),
        originalIndex: index,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aValid = Number.isFinite(a.timestamp);
      const bValid = Number.isFinite(b.timestamp);

      if (aValid && bValid && a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }

      if (aValid !== bValid) {
        return aValid ? -1 : 1;
      }

      return a.originalIndex - b.originalIndex;
    })
    .map((row, index) => ({
      ...row,
      sequence: index + 1,
    }));
}

function countByPrefix(rows = []) {
  const counts = new Map();

  for (const row of rows) {
    counts.set(
      row.prefixo,
      (counts.get(row.prefixo) || 0) + 1
    );
  }

  return counts;
}

function lastSequenceByPrefix(rows = []) {
  const output = new Map();

  for (const row of rows) {
    output.set(row.prefixo, row.sequence);
  }

  return output;
}

function temporalDistributionByPrefix(rows = []) {
  const datesByPrefix = new Map();

  for (const row of rows) {
    if (!row.ymd) continue;

    if (!datesByPrefix.has(row.prefixo)) {
      datesByPrefix.set(row.prefixo, new Set());
    }

    datesByPrefix.get(row.prefixo).add(row.ymd);
  }

  const result = new Map();

  for (const [prefixo, dates] of datesByPrefix.entries()) {
    result.set(prefixo, dates.size);
  }

  return result;
}

export function buildPrefixRankingV3({
  prizes = [],
  fallbackPrizes = [],
  recentWindow = DEFAULT_RECENT_WINDOW,
  fatigueWindow = DEFAULT_FATIGUE_WINDOW,
  fatiguePenalty = DEFAULT_FATIGUE_PENALTY,
  weights = DEFAULT_WEIGHTS_V3,
} = {}) {
  const currentRows = buildRows(prizes);
  const historicalRows = buildRows(fallbackPrizes);

  const contextRows = currentRows.length
    ? currentRows
    : historicalRows;

  if (!contextRows.length) {
    return [];
  }

  const historicalContext = historicalRows.length
    ? historicalRows
    : contextRows;

  const recentSize = Math.max(
    10,
    Math.floor(
      safeNumber(recentWindow, DEFAULT_RECENT_WINDOW)
    )
  );

  const fatigueSize = Math.max(
    5,
    Math.floor(
      safeNumber(fatigueWindow, DEFAULT_FATIGUE_WINDOW)
    )
  );

  const recentRows = historicalContext.slice(-recentSize);
  const fatigueRows = historicalContext.slice(-fatigueSize);

  const contextualCounts = countByPrefix(contextRows);
  const recentCounts = countByPrefix(recentRows);
  const fatigueCounts = countByPrefix(fatigueRows);
  const lastSeen = lastSequenceByPrefix(historicalContext);
  const distribution =
    temporalDistributionByPrefix(historicalContext);

  const maxContextual = Math.max(
    0,
    ...contextualCounts.values()
  );

  const maxRecent = Math.max(
    0,
    ...recentCounts.values()
  );

  const maxFatigue = Math.max(
    0,
    ...fatigueCounts.values()
  );

  const maxLastSeen = Math.max(
    0,
    ...lastSeen.values()
  );

  const maxDistribution = Math.max(
    0,
    ...distribution.values()
  );

  const normalizedWeights = normalizeWeights(weights);

  const ranking = Array.from(
    { length: 10 },
    (_, index) => {
      const prefixo = String(index);

      const contextualRaw =
        contextualCounts.get(prefixo) || 0;

      const recentRaw =
        recentCounts.get(prefixo) || 0;

      const fatigueRaw =
        fatigueCounts.get(prefixo) || 0;

      const lastSeenRaw =
        lastSeen.get(prefixo) || 0;

      const distributionRaw =
        distribution.get(prefixo) || 0;

      const contextualFrequency = normalizeRatio(
        contextualRaw,
        maxContextual
      );

      const recentTrend = normalizeRatio(
        recentRaw,
        maxRecent
      );

      const chronologicalRecency = normalizeRatio(
        lastSeenRaw,
        maxLastSeen
      );

      const temporalDistribution = normalizeRatio(
        distributionRaw,
        maxDistribution
      );

      /*
       * Fadiga:
       * somente unidades acima da média recente recebem penalidade.
       */
      const expectedFatigue =
        fatigueRows.length / 10;

      const fatigueExcess =
        expectedFatigue > 0
          ? Math.max(
              0,
              (fatigueRaw - expectedFatigue) /
                expectedFatigue
            )
          : 0;

      const fatigueNormalized =
        maxFatigue > 0
          ? Math.min(
              1,
              fatigueExcess /
                Math.max(1, maxFatigue)
            )
          : 0;

      const baseScore =
        contextualFrequency *
          normalizedWeights.contextualFrequency +
        recentTrend *
          normalizedWeights.recentTrend +
        chronologicalRecency *
          normalizedWeights.chronologicalRecency +
        temporalDistribution *
          normalizedWeights.temporalDistribution;

      const penalty =
        fatigueNormalized *
        Math.max(
          0,
          safeNumber(
            fatiguePenalty,
            DEFAULT_FATIGUE_PENALTY
          )
        );

      const score = Math.max(0, baseScore - penalty);

      return {
        prefixo,
        score: Number((score * 100).toFixed(4)),
        evidence: {
          contextualFrequency: {
            count: contextualRaw,
            normalized: Number(
              contextualFrequency.toFixed(6)
            ),
          },
          recentTrend: {
            count: recentRaw,
            window: recentSize,
            normalized: Number(
              recentTrend.toFixed(6)
            ),
          },
          chronologicalRecency: {
            lastSeenSequence: lastSeenRaw,
            maxSequence: maxLastSeen,
            normalized: Number(
              chronologicalRecency.toFixed(6)
            ),
          },
          temporalDistribution: {
            distinctDates: distributionRaw,
            normalized: Number(
              temporalDistribution.toFixed(6)
            ),
          },
          fatigue: {
            count: fatigueRaw,
            window: fatigueSize,
            expected: Number(
              expectedFatigue.toFixed(6)
            ),
            normalized: Number(
              fatigueNormalized.toFixed(6)
            ),
            penalty: Number(
              (penalty * 100).toFixed(4)
            ),
          },
        },
      };
    }
  );

  ranking.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    const bContext =
      b.evidence.contextualFrequency.count;
    const aContext =
      a.evidence.contextualFrequency.count;

    if (bContext !== aContext) {
      return bContext - aContext;
    }

    const bRecent =
      b.evidence.recentTrend.count;
    const aRecent =
      a.evidence.recentTrend.count;

    if (bRecent !== aRecent) {
      return bRecent - aRecent;
    }

    return Number(a.prefixo) - Number(b.prefixo);
  });

  return ranking.map((item, index) => ({
    position: index + 1,
    ...item,
  }));
}

export function buildMilharRecommendationV3({
  centena,
  prizes = [],
  fallbackPrizes = [],
  ...options
} = {}) {
  const centena3 = normalizeCentena3V3(centena);

  if (!centena3) {
    return {
      ok: false,
      status: "invalid_centena",
      model: "MILHAR_CONTEXTUAL_V3",
      centena: "",
      milhar: null,
      prefixo: null,
      score: 0,
      confidence: 0,
      evidence: null,
      alternatives: [],
      candidates: [],
    };
  }

  const prefixRanking = buildPrefixRankingV3({
    prizes,
    fallbackPrizes,
    ...options,
  });

  if (!prefixRanking.length) {
    return {
      ok: false,
      status: "insufficient_evidence",
      model: "MILHAR_CONTEXTUAL_V3",
      centena: centena3,
      milhar: null,
      prefixo: null,
      score: 0,
      confidence: 0,
      evidence: null,
      alternatives: [],
      candidates: [],
    };
  }

  const candidates = prefixRanking.map((item) => ({
    position: item.position,
    prefixo: item.prefixo,
    milhar: `${item.prefixo}${centena3}`,
    score: item.score,
    evidence: item.evidence,
  }));

  const winner = candidates[0];

  return {
    ok: true,
    status: "recommended",
    model: "MILHAR_CONTEXTUAL_V3",
    centena: centena3,
    milhar: winner.milhar,
    prefixo: winner.prefixo,
    score: winner.score,
    confidence: Number(
      (winner.score / 100).toFixed(6)
    ),
    evidence: winner.evidence,
    alternatives: candidates.slice(0, 3),
    candidates,
  };
}

export function diversifyMilharRecommendationsV3(
  rows = [],
  {
    maxPerPrefix = 4,
    repeatPenalty = 12,
  } = {}
) {
  const source = Array.isArray(rows) ? rows : [];
  const usage = new Map();

  return source.map((row) => {
    const centena =
      normalizeCentena3V3(row?.centena);

    const candidates = Array.isArray(
      row?.recommendation?.candidates
    )
      ? row.recommendation.candidates
          .filter((candidate) => {
            const milhar =
              normalizeMilhar4V3(candidate?.milhar);

            return (
              milhar &&
              milhar.slice(-3) === centena
            );
          })
          .map((candidate) => ({
            ...candidate,
            milhar: normalizeMilhar4V3(
              candidate.milhar
            ),
            prefixo: String(
              candidate?.prefixo ??
                normalizeMilhar4V3(
                  candidate.milhar
                ).slice(0, 1)
            ),
            score: safeNumber(
              candidate?.score,
              0
            ),
          }))
      : [];

    if (!candidates.length) {
      return row;
    }

    const ranked = candidates
      .map((candidate) => {
        const used =
          usage.get(candidate.prefixo) || 0;

        const overLimitPenalty =
          used >= Number(maxPerPrefix || 4)
            ? Number(repeatPenalty || 0) * 2
            : 0;

        const adjustedScore =
          candidate.score -
          used * Number(repeatPenalty || 0) -
          overLimitPenalty;

        return {
          ...candidate,
          used,
          adjustedScore,
        };
      })
      .sort((a, b) => {
        if (
          b.adjustedScore !==
          a.adjustedScore
        ) {
          return (
            b.adjustedScore -
            a.adjustedScore
          );
        }

        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return (
          Number(a.prefixo) -
          Number(b.prefixo)
        );
      });

    const selected = ranked[0];

    usage.set(
      selected.prefixo,
      (usage.get(selected.prefixo) || 0) + 1
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
          maxPerPrefix: Number(
            maxPerPrefix || 4
          ),
          repeatPenalty: Number(
            repeatPenalty || 0
          ),
        },
      },
    };
  });
}

export const MILHAR_V3_DEFAULT_WEIGHTS =
  DEFAULT_WEIGHTS_V3;
