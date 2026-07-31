import scoreConfig from "./scoreConfig";
import { collectEvidence } from "./evidenceEngine";

/**
 * Score Engine V2
 *
 * Consome a probabilidade estatística V3 e evidências complementares.
 *
 * Regras:
 * - evidências inválidas não entram no cálculo;
 * - pesos configurados são respeitados;
 * - força é calculada por média ponderada;
 * - confiança considera a quantidade mínima de evidências;
 * - scoreProb permanece como principal componente do ranking.
 */

function clampPercent(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Math.max(0, Math.min(100, n));
}

function normalizeWeight(value) {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return 1;
  }

  return n;
}

function calculateEvidenceStrength(
  evidenceList = [],
  scoringConfig = {}
) {
  const minimumEvidence = Math.max(
    1,
    Math.trunc(Number(scoringConfig.minimumEvidence) || 1)
  );

  const list = (Array.isArray(evidenceList) ? evidenceList : [])
    .filter((evidence) => {
      if (!evidence || evidence.error) {
        return false;
      }

      const value = Number(evidence.value);

      return Number.isFinite(value) && value > 0;
    })
    .map((evidence) => ({
      ...evidence,
      normalizedValue: clampPercent(evidence.value),
      normalizedWeight: normalizeWeight(evidence.weight),
    }));

  if (!list.length) {
    return {
      score: 0,
      confidence: 0,
      reasons: ["Sem evidências complementares válidas."],
      signals: {},
      evidenceCount: 0,
      minimumEvidence,
      coverage: 0,
    };
  }

  const weightedTotal = list.reduce(
    (acc, evidence) =>
      acc +
      (evidence.normalizedValue * evidence.normalizedWeight),
    0
  );

  const totalWeight = list.reduce(
    (acc, evidence) =>
      acc + evidence.normalizedWeight,
    0
  );

  const weightedAverage =
    totalWeight > 0
      ? weightedTotal / totalWeight
      : 0;

  const score = Math.round(
    clampPercent(weightedAverage)
  );

  const coverage = Math.min(
    1,
    list.length / minimumEvidence
  );

  const confidence = Math.round(
    score * coverage
  );

  const reasons = list.flatMap((evidence) =>
    Array.isArray(evidence.reasons)
      ? evidence.reasons
      : []
  );

  const signals = {};

  for (const evidence of list) {
    signals[evidence.module] = {
      ...(evidence.evidence || {}),
      value: evidence.normalizedValue,
      weight: evidence.normalizedWeight,
    };
  }

  return {
    score,
    confidence,
    reasons,
    signals,
    evidenceCount: list.length,
    minimumEvidence,
    coverage,
  };
}

function scoreItem(item = {}, context = {}) {
  const collected = collectEvidence({
    item,
    context,
    config: scoreConfig,
  });

  const strength = calculateEvidenceStrength(
    collected.evidence,
    scoreConfig.scoring
  );

  const probability = clampPercent(
    Number(
      item.scoreProb ??
      item.rawScoreProb ??
      0
    ) * 100
  );

  const finalScore = Math.round(
    (strength.score * 0.45) +
    (probability * 0.55)
  );

  const finalConfidence = Math.round(
    (strength.confidence * 0.40) +
    (probability * 0.60)
  );

  return {
    ...item,

    score: finalScore,

    confidence: finalConfidence,

    reasons: [
      ...strength.reasons,
      `Probabilidade V3: ${probability.toFixed(2)}%`,
    ],

    signals: {
      ...strength.signals,

      probability,

      evidenceSummary: {
        validCount: strength.evidenceCount,
        minimumEvidence: strength.minimumEvidence,
        coverage: strength.coverage,
        score: strength.score,
        confidence: strength.confidence,
      },

      evidenceErrors: collected.errors,
    },

    evidenceCount: strength.evidenceCount,

    evidenceModules: collected.modules,
  };
}

function scoreRanking(items = [], context = {}) {
  return (Array.isArray(items) ? items : [])
    .map((item) => scoreItem(item, context))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }

      return (
        Number(b.scoreProb || 0) -
        Number(a.scoreProb || 0)
      );
    });
}

export {
  scoreItem,
  scoreRanking,
  calculateEvidenceStrength,
};