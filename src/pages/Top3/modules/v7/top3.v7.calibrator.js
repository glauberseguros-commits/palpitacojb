/*
 * TOP3_V7_CALIBRATOR_FOUNDATION_V1
 *
 * Núcleo matemático experimental do calibrador V7.
 *
 * Regras:
 * - recebe telemetria produzida pelo bridge V7;
 * - aceita pesos experimentais explicitamente informados;
 * - não altera os perfis oficiais;
 * - não altera o V3;
 * - não persiste previsões;
 * - não acessa Firestore;
 * - pesos ausentes ou inválidos são tratados como zero;
 * - somente camadas habilitadas e com probabilidade válida contribuem;
 * - o score-base do candidato é usado apenas como desempate final.
 */

import {
  TOP3_V7_LAYER_KEYS,
} from "./top3.v7.catalog.js";

export const TOP3_V7_CALIBRATOR_VERSION =
  "TOP3_V7_CALIBRATOR_FOUNDATION_V1";

const EPSILON = 1e-12;

function finiteNumber(
  value,
  fallback = 0
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function clamp01(value) {
  return Math.max(
    0,
    Math.min(
      1,
      finiteNumber(value, 0)
    )
  );
}

function normalizeGroup(value) {
  const group =
    Math.trunc(
      finiteNumber(value, 0)
    );

  return (
    group >= 1 &&
    group <= 25
  )
    ? group
    : 0;
}

function normalizeLayerWeight(value) {
  return Math.max(
    0,
    finiteNumber(value, 0)
  );
}

export function normalizeTop3V7ExperimentalWeights(
  weights = {}
) {
  const source =
    weights &&
    typeof weights === "object"
      ? weights
      : {};

  return TOP3_V7_LAYER_KEYS.reduce(
    (output, layerKey) => {
      output[layerKey] =
        normalizeLayerWeight(
          source[layerKey]
        );

      return output;
    },
    {}
  );
}

export function summarizeTop3V7ExperimentalWeights(
  weights = {}
) {
  const normalized =
    normalizeTop3V7ExperimentalWeights(
      weights
    );

  const activeLayers =
    TOP3_V7_LAYER_KEYS.filter(
      (layerKey) =>
        normalized[layerKey] > 0
    );

  const totalWeight =
    activeLayers.reduce(
      (total, layerKey) =>
        total +
        normalized[layerKey],
      0
    );

  return {
    activeLayerCount:
      activeLayers.length,

    inactiveLayerCount:
      TOP3_V7_LAYER_KEYS.length -
      activeLayers.length,

    totalWeight,

    activeLayers,

    normalizedWeights:
      normalized,
  };
}

function findLayer(
  candidate,
  layerKey
) {
  const layers =
    Array.isArray(candidate?.layers)
      ? candidate.layers
      : [];

  return (
    layers.find(
      (layer) =>
        String(layer?.key || "") ===
        layerKey
    ) || null
  );
}

export function scoreTop3V7Candidate({
  candidate = {},
  weights = {},
} = {}) {
  const normalizedWeights =
    normalizeTop3V7ExperimentalWeights(
      weights
    );

  const layerContributions =
    TOP3_V7_LAYER_KEYS.map(
      (layerKey) => {
        const layer =
          findLayer(
            candidate,
            layerKey
          );

        const configuredWeight =
          normalizedWeights[layerKey];

        const enabled =
          layer?.enabled === true;

        const probability =
          clamp01(
            layer?.probability
          );

        const reliability =
          clamp01(
            layer?.reliability
          );

        const effectiveWeight =
          enabled
            ? configuredWeight *
              reliability
            : 0;

        const contribution =
          probability *
          effectiveWeight;

        return {
          key:
            layerKey,

          enabled,

          probability,

          reliability,

          configuredWeight,

          effectiveWeight,

          contribution,

          fallbackReason:
            layer?.fallbackReason ||
            null,
        };
      }
    );

  const activeLayers =
    layerContributions.filter(
      (layer) =>
        layer.effectiveWeight > 0
    );

  const totalEffectiveWeight =
    activeLayers.reduce(
      (total, layer) =>
        total +
        layer.effectiveWeight,
      0
    );

  const rawContribution =
    activeLayers.reduce(
      (total, layer) =>
        total +
        layer.contribution,
      0
    );

  const calibratedProbability =
    totalEffectiveWeight > EPSILON
      ? rawContribution /
        totalEffectiveWeight
      : 0;

  const group =
    normalizeGroup(
      candidate?.group ??
      candidate?.grupo
    );

  const baselineScore =
    finiteNumber(
      candidate?.finalScore ??
      candidate?.scoreProb ??
      candidate?.score,
      0
    );

  const baselineRank =
    Math.max(
      0,
      Math.trunc(
        finiteNumber(
          candidate?.finalRank ??
          candidate?.rank,
          0
        )
      )
    );

  return {
    calibratorVersion:
      TOP3_V7_CALIBRATOR_VERSION,

    lotteryKey:
      candidate?.lotteryKey ||
      null,

    targetYmd:
      candidate?.targetYmd ||
      null,

    targetHour:
      candidate?.targetHour ||
      null,

    group,

    baselineScore,

    baselineRank,

    calibratedProbability,

    rawContribution,

    totalEffectiveWeight,

    activeLayerCount:
      activeLayers.length,

    activeLayers:
      activeLayers.map(
        (layer) => layer.key
      ),

    layerContributions,
  };
}

function compareCalibratedCandidates(
  left,
  right
) {
  const probabilityDifference =
    right.calibratedProbability -
    left.calibratedProbability;

  if (
    Math.abs(
      probabilityDifference
    ) > EPSILON
  ) {
    return probabilityDifference;
  }

  const activeLayerDifference =
    right.activeLayerCount -
    left.activeLayerCount;

  if (activeLayerDifference !== 0) {
    return activeLayerDifference;
  }

  const baselineScoreDifference =
    right.baselineScore -
    left.baselineScore;

  if (
    Math.abs(
      baselineScoreDifference
    ) > EPSILON
  ) {
    return baselineScoreDifference;
  }

  if (
    left.baselineRank > 0 &&
    right.baselineRank > 0 &&
    left.baselineRank !==
      right.baselineRank
  ) {
    return (
      left.baselineRank -
      right.baselineRank
    );
  }

  return left.group - right.group;
}

export function calibrateTop3V7Ranking({
  telemetry = [],
  weights = {},
  topN = 3,
} = {}) {
  const safeTelemetry =
    Array.isArray(telemetry)
      ? telemetry
      : [];

  const scoredCandidates =
    safeTelemetry
      .map(
        (candidate) =>
          scoreTop3V7Candidate({
            candidate,
            weights,
          })
      )
      .filter(
        (candidate) =>
          candidate.group >= 1 &&
          candidate.group <= 25
      )
      .sort(
        compareCalibratedCandidates
      )
      .map(
        (candidate, index) => ({
          ...candidate,

          calibratedRank:
            index + 1,
        })
      );

  const requestedTopN =
    Math.max(
      1,
      Math.trunc(
        finiteNumber(topN, 3)
      )
    );

  return {
    calibratorVersion:
      TOP3_V7_CALIBRATOR_VERSION,

    candidateCount:
      scoredCandidates.length,

    weightsSummary:
      summarizeTop3V7ExperimentalWeights(
        weights
      ),

    ranking:
      scoredCandidates,

    top:
      scoredCandidates.slice(
        0,
        requestedTopN
      ),

    topGroups:
      scoredCandidates
        .slice(
          0,
          requestedTopN
        )
        .map(
          (candidate) =>
            candidate.group
        ),
  };
}

