/*
 * TOP3_V7_18_LAYERS_FOUNDATION_V1
 *
 * Contrato uniforme de saída das camadas do TOP3 V7.
 */

import {
  getTop3V7LayerDefinition,
  isTop3V7LayerKey,
} from "./top3.v7.catalog.js";

const UNIFORM_PROBABILITY = 1 / 25;

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(
    maximum,
    Math.max(minimum, finiteNumber(value, minimum))
  );
}

function normalizeReason(value) {
  const text = String(value || "").trim();

  return text || null;
}

export function createTop3V7LayerResult({
  key,
  probability = UNIFORM_PROBABILITY,
  samples = 0,
  reliability = 0,
  configuredWeight = 0,
  effectiveWeight = 0,
  contribution = 0,
  enabled = false,
  fallbackReason = null,
  metadata = null,
} = {}) {
  if (!isTop3V7LayerKey(key)) {
    throw new Error(
      `Camada V7 inválida: ${String(key || "—")}`
    );
  }

  const definition =
    getTop3V7LayerDefinition(key);

  const safeProbability =
    clamp(probability, 0, 1);

  const safeSamples =
    Math.max(
      0,
      Math.trunc(finiteNumber(samples, 0))
    );

  const safeReliability =
    clamp(reliability, 0, 1);

  const safeConfiguredWeight =
    Math.max(
      0,
      finiteNumber(configuredWeight, 0)
    );

  const safeEffectiveWeight =
    Math.max(
      0,
      finiteNumber(effectiveWeight, 0)
    );

  const safeContribution =
    finiteNumber(contribution, 0);

  return Object.freeze({
    key: definition.key,
    label: definition.label,
    order: definition.order,
    family: definition.family,

    enabled: Boolean(enabled),

    probability: safeProbability,
    samples: safeSamples,
    reliability: safeReliability,

    configuredWeight: safeConfiguredWeight,
    effectiveWeight: safeEffectiveWeight,
    contribution: safeContribution,

    fallbackReason:
      normalizeReason(fallbackReason),

    metadata:
      metadata &&
      typeof metadata === "object"
        ? Object.freeze({ ...metadata })
        : null,
  });
}

export function createDisabledTop3V7LayerResult(
  key,
  fallbackReason = "NOT_IMPLEMENTED"
) {
  return createTop3V7LayerResult({
    key,
    probability: UNIFORM_PROBABILITY,
    samples: 0,
    reliability: 0,
    configuredWeight: 0,
    effectiveWeight: 0,
    contribution: 0,
    enabled: false,
    fallbackReason,
  });
}

export function validateTop3V7LayerResult(result) {
  if (!result || typeof result !== "object") {
    return false;
  }

  if (!isTop3V7LayerKey(result.key)) {
    return false;
  }

  const numericFields = [
    "probability",
    "samples",
    "reliability",
    "configuredWeight",
    "effectiveWeight",
    "contribution",
  ];

  return numericFields.every(
    (field) =>
      Number.isFinite(Number(result[field]))
  );
}

export const TOP3_V7_UNIFORM_PROBABILITY =
  UNIFORM_PROBABILITY;

