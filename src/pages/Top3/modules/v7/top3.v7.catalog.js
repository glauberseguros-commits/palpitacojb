/*
 * TOP3_V7_18_LAYERS_FOUNDATION_V1
 *
 * Catálogo oficial das 18 camadas do motor TOP3 V7.
 *
 * Este módulo apenas define a arquitetura.
 * Ele não altera o motor V3 e não participa de previsões produtivas.
 */

export const TOP3_V7_ENGINE_VERSION = "V7_18_LAYERS_EXPERIMENTAL";

export const TOP3_V7_LAYER_KEYS = Object.freeze([
  "hour",
  "dowHour",
  "dayMonth",
  "transition",
  "recent",
  "scene",
  "month",
  "weekday",
  "historicalFrequency",
  "firstPrizeFrequency",
  "top3Frequency",
  "sequenceOrder2",
  "shortMemory",
  "delay",
  "cycleRegime",
  "dailyFlow",
  "animalOfDay",
  "stoneFlip",
]);

export const TOP3_V7_LAYER_CATALOG = Object.freeze([
  Object.freeze({
    order: 1,
    key: "hour",
    label: "Horário",
    family: "TEMPORAL",
    origin: "CURRENT_ENGINE",
  }),

  Object.freeze({
    order: 2,
    key: "dowHour",
    label: "Dia da semana + horário",
    family: "TEMPORAL",
    origin: "CURRENT_ENGINE",
  }),

  Object.freeze({
    order: 3,
    key: "dayMonth",
    label: "Dia do mês",
    family: "TEMPORAL",
    origin: "CURRENT_ENGINE",
  }),

  Object.freeze({
    order: 4,
    key: "transition",
    label: "Transição",
    family: "DYNAMIC",
    origin: "CURRENT_ENGINE",
  }),

  Object.freeze({
    order: 5,
    key: "recent",
    label: "Recência",
    family: "DYNAMIC",
    origin: "CURRENT_ENGINE",
  }),

  Object.freeze({
    order: 6,
    key: "scene",
    label: "Cena semelhante",
    family: "CONTEXT",
    origin: "CURRENT_ENGINE",
  }),

  Object.freeze({
    order: 7,
    key: "month",
    label: "Mês do ano",
    family: "TEMPORAL",
    origin: "PARTIAL_EXISTING",
  }),

  Object.freeze({
    order: 8,
    key: "weekday",
    label: "Dia da semana",
    family: "TEMPORAL",
    origin: "PARTIAL_EXISTING",
  }),

  Object.freeze({
    order: 9,
    key: "historicalFrequency",
    label: "Frequência histórica geral",
    family: "FREQUENCY",
    origin: "PARTIAL_EXISTING",
  }),

  Object.freeze({
    order: 10,
    key: "firstPrizeFrequency",
    label: "Frequência no 1º prêmio",
    family: "FREQUENCY",
    origin: "PARTIAL_EXISTING",
  }),

  Object.freeze({
    order: 11,
    key: "top3Frequency",
    label: "Frequência no TOP3 consolidado",
    family: "FREQUENCY",
    origin: "PARTIAL_EXISTING",
  }),

  Object.freeze({
    order: 12,
    key: "sequenceOrder2",
    label: "Sequência de ordem 2",
    family: "DYNAMIC",
    origin: "PARTIAL_EXISTING",
  }),

  Object.freeze({
    order: 13,
    key: "shortMemory",
    label: "Memória curta",
    family: "DYNAMIC",
    origin: "PARTIAL_EXISTING",
  }),

  Object.freeze({
    order: 14,
    key: "delay",
    label: "Atraso do grupo",
    family: "DYNAMIC",
    origin: "PARTIAL_EXISTING",
  }),

  Object.freeze({
    order: 15,
    key: "cycleRegime",
    label: "Ciclo ou regime",
    family: "DYNAMIC",
    origin: "PARTIAL_EXISTING",
  }),

  Object.freeze({
    order: 16,
    key: "dailyFlow",
    label: "Fluxo do dia",
    family: "DYNAMIC",
    origin: "PARTIAL_EXISTING",
  }),

  Object.freeze({
    order: 17,
    key: "animalOfDay",
    label: "Bicho do dia",
    family: "SPECIAL_CONTEXT",
    origin: "NEW_V7",
  }),

  Object.freeze({
    order: 18,
    key: "stoneFlip",
    label: "Virada de pedra",
    family: "SPECIAL_CONTEXT",
    origin: "NEW_V7",
  }),
]);

export function getTop3V7LayerDefinition(layerKey) {
  return (
    TOP3_V7_LAYER_CATALOG.find(
      (layer) => layer.key === String(layerKey || "")
    ) || null
  );
}

export function isTop3V7LayerKey(layerKey) {
  return TOP3_V7_LAYER_KEYS.includes(String(layerKey || ""));
}
