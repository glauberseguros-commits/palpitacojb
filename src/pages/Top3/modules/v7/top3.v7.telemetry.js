/*
 * TOP3_V7_18_LAYERS_FOUNDATION_V1
 *
 * Telemetria auditável das 18 camadas.
 */

import {
  TOP3_V7_ENGINE_VERSION,
  TOP3_V7_LAYER_CATALOG,
} from "./top3.v7.catalog";

import {
  createDisabledTop3V7LayerResult,
  validateTop3V7LayerResult,
} from "./top3.v7.contract";

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

export function normalizeTop3V7LayerResults(
  layerResults = []
) {
  const byKey = new Map(
    safeArray(layerResults)
      .filter(validateTop3V7LayerResult)
      .map((result) => [
        result.key,
        result,
      ])
  );

  return TOP3_V7_LAYER_CATALOG.map(
    (layer) =>
      byKey.get(layer.key) ||
      createDisabledTop3V7LayerResult(
        layer.key,
        "LAYER_RESULT_NOT_PROVIDED"
      )
  );
}

export function buildTop3V7CandidateTelemetry({
  lotteryKey,
  targetYmd,
  targetHour,
  group,
  layerResults = [],
  finalScore = 0,
  finalRank = null,
} = {}) {
  const normalizedLayers =
    normalizeTop3V7LayerResults(
      layerResults
    );

  const enabledLayers =
    normalizedLayers.filter(
      (layer) => layer.enabled
    );

  const activeLayers =
    enabledLayers.filter(
      (layer) =>
        layer.effectiveWeight > 0
    );

  return Object.freeze({
    engineVersion:
      TOP3_V7_ENGINE_VERSION,

    experimental:
      true,

    lotteryKey:
      String(lotteryKey || ""),

    targetYmd:
      String(targetYmd || ""),

    targetHour:
      String(targetHour || ""),

    group:
      Number(group || 0),

    finalScore:
      Number(finalScore || 0),

    finalRank:
      Number.isFinite(Number(finalRank))
        ? Number(finalRank)
        : null,

    layerCount:
      normalizedLayers.length,

    enabledLayerCount:
      enabledLayers.length,

    activeLayerCount:
      activeLayers.length,

    layers:
      Object.freeze(normalizedLayers),
  });
}

export function summarizeTop3V7Telemetry(
  candidates = []
) {
  const safeCandidates =
    safeArray(candidates);

  return Object.freeze({
    engineVersion:
      TOP3_V7_ENGINE_VERSION,

    experimental:
      true,

    candidateCount:
      safeCandidates.length,

    expectedLayerCount:
      TOP3_V7_LAYER_CATALOG.length,

    candidatesWith18Layers:
      safeCandidates.filter(
        (candidate) =>
          candidate?.layerCount === 18
      ).length,
  });
}
