/*
 * TOP3_V7_18_LAYERS_FOUNDATION_V1
 *
 * Perfis independentes por loteria.
 *
 * Todos os pesos começam em zero porque o V7 ainda não foi calibrado.
 * Peso zero significa que a camada existe no catálogo, mas não influencia
 * o ranking experimental.
 */

import {
  TOP3_V7_LAYER_KEYS,
} from "./top3.v7.catalog";

export const TOP3_V7_LOTTERY_KEYS = Object.freeze([
  "PT_RIO",
  "LOOK",
  "NACIONAL",
  "FEDERAL",
]);

function createZeroWeights() {
  return Object.freeze(
    TOP3_V7_LAYER_KEYS.reduce(
      (output, layerKey) => {
        output[layerKey] = 0;
        return output;
      },
      {}
    )
  );
}

function createProfile(lotteryKey) {
  return Object.freeze({
    lotteryKey,

    enabled: false,
    experimentalOnly: true,

    minimumSamples: 1,
    maximumLayerInfluence: 0,

    weights: createZeroWeights(),
  });
}

export const TOP3_V7_PROFILES = Object.freeze({
  PT_RIO: createProfile("PT_RIO"),
  LOOK: createProfile("LOOK"),
  NACIONAL: createProfile("NACIONAL"),
  FEDERAL: createProfile("FEDERAL"),
});

export function normalizeTop3V7LotteryKey(value) {
  const normalized =
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_");

  if (
    normalized === "RJ" ||
    normalized === "RIO" ||
    normalized === "RIO_DE_JANEIRO"
  ) {
    return "PT_RIO";
  }

  return TOP3_V7_LOTTERY_KEYS.includes(normalized)
    ? normalized
    : null;
}

export function getTop3V7Profile(lotteryKey) {
  const normalized =
    normalizeTop3V7LotteryKey(lotteryKey);

  return normalized
    ? TOP3_V7_PROFILES[normalized]
    : null;
}
