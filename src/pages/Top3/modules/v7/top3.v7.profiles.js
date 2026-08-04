/*
 * TOP3_V7_CONFIG_2026_08_04_PASSAGEM_1
 *
 * Primeira configuração ativa do motor TOP3 V7.
 *
 * Objetivo principal:
 * - maximizar cobertura do pódio;
 * - preservar três oportunidades de acerto;
 * - manter configurações independentes por loteria;
 * - permitir recalibrações futuras sem alteração estrutural.
 *
 * Esta passagem não é definitiva.
 */

import {
  TOP3_V7_LAYER_KEYS,
} from "./top3.v7.catalog.js";

export const TOP3_V7_CONFIG_VERSION =
  "V7_CONFIG_2026_08_04_PASSAGEM_1";

export const TOP3_V7_LOTTERY_KEYS = Object.freeze([
  "PT_RIO",
  "LOOK",
  "NACIONAL",
  "FEDERAL",
]);

const PROFILE_SOURCE_BY_TARGET = Object.freeze({
  PT_RIO: "FEDERAL",
  FEDERAL: "LOOK",
  LOOK: "LOOK",
  NACIONAL: "LOOK",
});

/*
 * Perfil de comportamento FEDERAL.
 *
 * Maior presença de:
 * - dia da semana;
 * - transição;
 * - frequência de primeiro prêmio;
 * - estrutura histórica.
 */
const FEDERAL_BEHAVIOR_WEIGHTS = Object.freeze({
  hour: 0.08,
  dowHour: 0.14,
  dayMonth: 0.00,
  transition: 0.17,
  recent: 0.06,
  scene: 0.05,
  month: 0.03,
  weekday: 0.10,
  historicalFrequency: 0.07,
  firstPrizeFrequency: 0.10,
  top3Frequency: 0.08,
  sequenceOrder2: 0.03,
  shortMemory: 0.03,
  delay: 0.02,
  cycleRegime: 0.02,
  dailyFlow: 0.02,
  animalOfDay: 0.00,
  stoneFlip: 0.00,
});

/*
 * Perfil de comportamento LOOK.
 *
 * Maior presença de:
 * - horário;
 * - dia da semana + horário;
 * - transição;
 * - cobertura histórica do TOP3;
 * - memória e sequência curta.
 */
const LOOK_BEHAVIOR_WEIGHTS = Object.freeze({
  hour: 0.16,
  dowHour: 0.13,
  dayMonth: 0.03,
  transition: 0.16,
  recent: 0.07,
  scene: 0.04,
  month: 0.03,
  weekday: 0.03,
  historicalFrequency: 0.06,
  firstPrizeFrequency: 0.06,
  top3Frequency: 0.08,
  sequenceOrder2: 0.04,
  shortMemory: 0.04,
  delay: 0.03,
  cycleRegime: 0.01,
  dailyFlow: 0.03,
  animalOfDay: 0.00,
  stoneFlip: 0.00,
});

const WEIGHTS_BY_SOURCE_PROFILE = Object.freeze({
  FEDERAL: FEDERAL_BEHAVIOR_WEIGHTS,
  LOOK: LOOK_BEHAVIOR_WEIGHTS,
});

function validateWeights(weights) {
  const output = TOP3_V7_LAYER_KEYS.reduce(
    (result, layerKey) => {
      const value = Number(weights?.[layerKey] || 0);

      if (!Number.isFinite(value) || value < 0) {
        throw new Error(
          `Peso V7 inválido: ${layerKey}=${String(
            weights?.[layerKey]
          )}`
        );
      }

      result[layerKey] = value;
      return result;
    },
    {}
  );

  const total = Object.values(output).reduce(
    (sum, value) => sum + value,
    0
  );

  if (Math.abs(total - 1) > 0.000001) {
    throw new Error(
      `Soma dos pesos V7 deve ser 1. Total=${total}`
    );
  }

  return Object.freeze(output);
}

function createProfile(lotteryKey) {
  const sourceProfileKey =
    PROFILE_SOURCE_BY_TARGET[lotteryKey];

  const sourceWeights =
    WEIGHTS_BY_SOURCE_PROFILE[sourceProfileKey];

  if (!sourceProfileKey || !sourceWeights) {
    throw new Error(
      `Perfil-fonte V7 não configurado para ${lotteryKey}`
    );
  }

  return Object.freeze({
    lotteryKey,
    sourceProfileKey,

    configVersion:
      TOP3_V7_CONFIG_VERSION,

    enabled: true,
    experimentalOnly: false,

    minimumSamples: 1,

    /*
     * Proteção inicial contra dominância isolada.
     * Nenhuma camada deve decidir o ranking sozinha.
     */
    maximumLayerInfluence: 0.20,

    weights:
      validateWeights(sourceWeights),
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

