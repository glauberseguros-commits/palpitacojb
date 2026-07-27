"use strict";

/**
 * Frequency Evidence V2
 *
 * Responsabilidade:
 * Produzir evidências relacionadas à frequência.
 * Não calcula score.
 */

function normalize(value) {
  const n = Number(value);

  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }

  return n;
}

function normalizePercent(value) {
  const n = Number(value);

  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }

  return Math.min(100, n);
}

function classifyFrequency(percent) {
  if (percent >= 70) return "very_high";
  if (percent >= 50) return "high";
  if (percent >= 30) return "medium";
  if (percent >= 15) return "low";
  return "very_low";
}

function buildReasons(frequency, percent, level) {
  const reasons = [];

  reasons.push(`Frequência histórica: ${frequency}`);

  if (percent > 0) {
    reasons.push(`Participação: ${percent.toFixed(1)}%`);
  }

  switch (level) {
    case "very_high":
      reasons.push("Frequência muito elevada.");
      break;

    case "high":
      reasons.push("Frequência elevada.");
      break;

    case "medium":
      reasons.push("Frequência intermediária.");
      break;

    case "low":
      reasons.push("Frequência baixa.");
      break;

    default:
      reasons.push("Pouca evidência de frequência.");
  }

  return reasons;
}

function buildFrequencyEvidence(item = {}, context = {}) {
  const frequency = normalize(
    item.frequency ??
    item.total ??
    item.count ??
    item.appearances
  );

  const totalUniverse = normalize(
    context.totalDraws ??
    context.windowSize ??
    context.sampleSize
  );

  const percent =
    totalUniverse > 0
      ? normalizePercent((frequency / totalUniverse) * 100)
      : normalizePercent(
          item.frequencyPercent ??
          item.frequencyRate
        );

  const level = classifyFrequency(percent);

  return {
    module: "frequency",

    value: percent,

    evidence: {
      frequency,
      percent,
      level,
      totalUniverse,

      window: context.window || null,
      lotteryKey: context.lotteryKey || null,
      position: context.position || null,
      weekday: context.weekday || null,
      hour: context.hour || null,
    },

    reasons: buildReasons(frequency, percent, level),
  };
}

export {
buildFrequencyEvidence,
};
