"use strict";

import scoreConfig from "./scoreConfig";
import { collectEvidence } from "./evidenceEngine";

/**
 * Score Engine V2 inicial
 *
 * Consome evidências.
 * Não aplica regra cega isolada.
 */

function normalizeEvidenceValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function calculateEvidenceStrength(evidenceList = []) {
  const list = Array.isArray(evidenceList) ? evidenceList : [];

  if (!list.length) {
    return {
      score: 0,
      confidence: 0,
      reasons: ["Sem evidências suficientes."],
      signals: {},
    };
  }

  const values = list.map((e) => normalizeEvidenceValue(e.value));
  const total = values.reduce((acc, v) => acc + v, 0);
  const max = Math.max(...values, 1);

  const score = Math.min(100, Math.round((total / max) * 50));
  const confidence = Math.min(100, Math.round(score * Math.min(1, list.length / 3)));

  const reasons = list.flatMap((e) => Array.isArray(e.reasons) ? e.reasons : []);

  const signals = {};
  for (const e of list) {
    signals[e.module] = e.evidence || {};
  }

  return {
    score,
    confidence,
    reasons,
    signals,
  };
}

function scoreItem(item = {}, context = {}) {
  const collected = collectEvidence({
    item,
    context,
    config: scoreConfig,
  });

  const strength = calculateEvidenceStrength(collected.evidence);

  const probability = Math.max(
    0,
    Math.min(
      100,
      Number(item.scoreProb || item.rawScoreProb || 0) * 100
    )
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
    },

    evidenceCount: collected.count,

    evidenceModules: collected.modules,
  };
}

function scoreRanking(items = [], context = {}) {

  return (Array.isArray(items) ? items : [])
    .map(item => scoreItem(item, context))
    .sort((a, b) => {

      if (b.score !== a.score)
        return b.score - a.score;

      if (b.confidence !== a.confidence)
        return b.confidence - a.confidence;

      return (Number(b.scoreProb || 0) - Number(a.scoreProb || 0));

    });

}

export {
scoreItem,
  scoreRanking,
  calculateEvidenceStrength,
};
