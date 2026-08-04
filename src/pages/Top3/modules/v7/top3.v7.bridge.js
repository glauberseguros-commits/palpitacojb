/*
 * TOP3_V7_EXISTING_LAYERS_BRIDGE_V1
 *
 * Ponte de compatibilidade entre as evidências produzidas pelo motor atual
 * e o contrato uniforme das 18 camadas do motor experimental V7.
 *
 * Esta ponte:
 * - não calcula o ranking;
 * - não altera scoreProb;
 * - não altera TOP3;
 * - não publica previsões;
 * - não atribui peso positivo às camadas.
 */

import {
  TOP3_V7_LAYER_CATALOG,
} from "./top3.v7.catalog.js";

import {
  createDisabledTop3V7LayerResult,
  createTop3V7LayerResult,
} from "./top3.v7.contract.js";

import {
  getTop3V7Profile,
} from "./top3.v7.profiles.js";

import {
  buildTop3V7CandidateTelemetry,
} from "./top3.v7.telemetry.js";

/*
 * TOP3_V7_18_LAYERS_PASSIVE_INTEGRATION_FINAL_V3
 *
 * Integração experimental das seis camadas atuais com as doze adicionais.
 * Nenhuma influência produtiva é aplicada.
 */
import {
  TOP3_V7_ADDITIONAL_LAYER_KEYS,
  buildTop3V7AdditionalLayers,
  getTop3V7AdditionalLayerResult,
} from "./top3.v7.additional-layers.js";

const UNIFORM_PROBABILITY = 1 / 25;

const LAYER_ALIASES = Object.freeze({
  hour: Object.freeze([
    "hour",
    "hourFrequency",
    "hourEvidence",
  ]),

  dowHour: Object.freeze([
    "dowHour",
    "weekdayHour",
    "dayOfWeekHour",
  ]),

  dayMonth: Object.freeze([
    "dayMonth",
    "dayOfMonth",
    "dom",
  ]),

  transition: Object.freeze([
    "transition",
    "transitionEvidence",
    "chain",
  ]),

  recent: Object.freeze([
    "recent",
    "recency",
    "recentEvidence",
    "recentPressure",
  ]),

  scene: Object.freeze([
    "scene",
    "similarScene",
    "sceneHypothesis",
  ]),

  month: Object.freeze([
    "month",
    "monthOfYear",
    "monthly",
  ]),

  weekday: Object.freeze([
    "weekday",
    "dow",
    "dayOfWeek",
  ]),

  historicalFrequency: Object.freeze([
    "historicalFrequency",
    "globalFrequency",
    "overallFrequency",
    "frequency",
  ]),

  firstPrizeFrequency: Object.freeze([
    "firstPrizeFrequency",
    "firstPositionFrequency",
    "structuralFirst",
    "firstPrize",
  ]),

  top3Frequency: Object.freeze([
    "top3Frequency",
    "podiumFrequency",
    "top3Presence",
    "prizePresence",
  ]),

  sequenceOrder2: Object.freeze([
    "sequenceOrder2",
    "sequence2",
    "seq2",
    "pairSequence",
  ]),

  shortMemory: Object.freeze([
    "shortMemory",
    "memory",
    "memoryShort",
  ]),

  delay: Object.freeze([
    "delay",
    "late",
    "lateness",
    "groupDelay",
  ]),

  cycleRegime: Object.freeze([
    "cycleRegime",
    "cycle",
    "regime",
    "dayRegime",
  ]),

  dailyFlow: Object.freeze([
    "dailyFlow",
    "dayFlow",
    "sameDayFlow",
  ]),

  animalOfDay: Object.freeze([
    "animalOfDay",
    "bichoDoDia",
  ]),

  stoneFlip: Object.freeze([
    "stoneFlip",
    "viradaDePedra",
  ]),
});

const DIRECT_FIELD_ALIASES = Object.freeze({
  historicalFrequency: Object.freeze([
    "frequency",
    "globalFrequency",
    "historicalFrequency",
  ]),

  firstPrizeFrequency: Object.freeze([
    "condFirstCount",
    "structuralFirstCount",
    "firstPrizeFrequency",
  ]),

  top3Frequency: Object.freeze([
    "top3Count",
    "podiumCount",
    "prizePresence",
  ]),

  sequenceOrder2: Object.freeze([
    "probSeq2",
    "pairProb",
    "pairSequenceScore",
  ]),

  shortMemory: Object.freeze([
    "probMemory",
    "memoryProbability",
  ]),

  delay: Object.freeze([
    "lateNorm",
    "smartLateBoost",
    "delayProbability",
  ]),

  cycleRegime: Object.freeze([
    "regimeScore",
    "cycleScore",
  ]),

  dailyFlow: Object.freeze([
    "dayFlowProbability",
    "dayFlowScore",
    "dayFlowRaw",
  ]),
});

function finiteNumber(value, fallback = null) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function clamp(value, minimum, maximum) {
  const numeric =
    finiteNumber(value, minimum);

  return Math.min(
    maximum,
    Math.max(minimum, numeric)
  );
}

function safeObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : null;
}

function normalizeProbability(value) {
  const numeric =
    finiteNumber(value, null);

  if (numeric === null) {
    return null;
  }

  if (numeric >= 0 && numeric <= 1) {
    return numeric;
  }

  if (numeric > 1 && numeric <= 100) {
    return numeric / 100;
  }

  return null;
}

/*
 * TOP3_V7_EVALUATIONS_ARRAY_BRIDGE_V2
 *
 * O auditor de decisão grava as evidências em:
 * ranking[].evaluations[]
 *
 * A ponte aceita tanto mapas de detalhes quanto arrays de avaliações.
 */
function collectDetailMaps(candidate = {}) {
  const possibleMaps = [
    candidate?.layers,
    candidate?.details,
    candidate?.explain?.details,
    candidate?.meta?.details,
    candidate?.meta?.explain?.details,
    candidate?.raw?.meta?.explain?.details,
  ];

  return possibleMaps
    .map(safeObject)
    .filter(Boolean);
}

function normalizeEvaluationKey(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function collectEvaluations(candidate = {}) {
  const possibleArrays = [
    candidate?.evaluations,
    candidate?.layers,
    candidate?.details,
    candidate?.explain?.evaluations,
    candidate?.meta?.evaluations,
    candidate?.meta?.explain?.evaluations,
    candidate?.raw?.meta?.explain?.evaluations,
  ];

  for (const value of possibleArrays) {
    if (Array.isArray(value)) {
      return value.filter(
        (item) =>
          item &&
          typeof item === "object"
      );
    }
  }

  return [];
}

function evaluationIdentifiers(evaluation = {}) {
  return [
    evaluation?.key,
    evaluation?.layerKey,
    evaluation?.layer,
    evaluation?.id,
    evaluation?.type,
    evaluation?.name,
    evaluation?.label,
    evaluation?.source,
  ]
    .map(normalizeEvaluationKey)
    .filter(Boolean);
}

function findEvaluationByAliases(
  evaluations,
  layerKey,
  aliases
) {
  const wanted = new Set(
    [
      layerKey,
      ...(aliases || []),
    ]
      .map(normalizeEvaluationKey)
      .filter(Boolean)
  );

  for (const evaluation of evaluations) {
    const identifiers =
      evaluationIdentifiers(evaluation);

    if (
      identifiers.some(
        (identifier) =>
          wanted.has(identifier)
      )
    ) {
      return {
        source: evaluation,
        alias:
          identifiers[0] ||
          normalizeEvaluationKey(layerKey),
      };
    }
  }

  return null;
}

function findSourceByAliases(
  detailMaps,
  aliases
) {
  for (const detailMap of detailMaps) {
    for (const alias of aliases) {
      const source =
        safeObject(detailMap?.[alias]);

      if (source) {
        return {
          source,
          alias,
        };
      }
    }
  }

  return null;
}

function findDirectField(
  candidate,
  aliases
) {
  for (const alias of aliases || []) {
    const value =
      candidate?.[alias];

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return {
        alias,
        value,
      };
    }
  }

  return null;
}

function readProbability(source) {
  if (!source) {
    return null;
  }

  const candidates = [
    source.probability,
    source.prob,
    source.scoreProb,
    source.normalizedProbability,
    source.rate,
    source.percent,
    source.frequencyProbability,
    source.firstProbability,
    source.top3Probability,
    source.pairProb,
    source.probSeq2,
    source.probMemory,
    source.lateNorm,
    source.dayFlowProbability,
  ];

  for (const candidate of candidates) {
    const probability =
      normalizeProbability(candidate);

    if (probability !== null) {
      return probability;
    }
  }

  return null;
}

function readSamples(source) {
  if (!source) {
    return 0;
  }

  const candidates = [
    source.samples,
    source.sampleSize,
    source.totalSamples,
    source.count,
    source.occurrences,
    source.pairSamples,
    source.firstCount,
    source.top3Count,
  ];

  for (const candidate of candidates) {
    const samples =
      finiteNumber(candidate, null);

    if (samples !== null && samples >= 0) {
      return Math.trunc(samples);
    }
  }

  return 0;
}

function readReliability(source, samples) {
  if (!source) {
    return 0;
  }

  const explicitCandidates = [
    source.reliability,
    source.confidence,
    source.sampleConfidence,
  ];

  for (const candidate of explicitCandidates) {
    const reliability =
      normalizeProbability(candidate);

    if (reliability !== null) {
      return reliability;
    }
  }

  const safeSamples =
    Math.max(0, Number(samples || 0));

  return clamp(
    safeSamples / 20,
    0,
    1
  );
}

function configuredWeightFor(
  profile,
  layerKey
) {
  return Math.max(
    0,
    finiteNumber(
      profile?.weights?.[layerKey],
      0
    )
  );
}

function createResultFromSource({
  layerKey,
  source,
  sourceAlias,
  profile,
  directValue = null,
  directAlias = null,
}) {
  let probability =
    readProbability(source);

  if (
    probability === null &&
    directValue !== null
  ) {
    probability =
      normalizeProbability(directValue);
  }

  const samples =
    readSamples(source);

  const reliability =
    readReliability(
      source,
      samples
    );

  const configuredWeight =
    configuredWeightFor(
      profile,
      layerKey
    );

  const sourceFound =
    Boolean(source) ||
    directValue !== null;

  const enabled =
    sourceFound &&
    probability !== null;

  return createTop3V7LayerResult({
    key: layerKey,

    probability:
      probability !== null
        ? probability
        : UNIFORM_PROBABILITY,

    samples,
    reliability,

    configuredWeight,

    /*
     * Nesta etapa o V7 continua sem influência:
     * effectiveWeight e contribution permanecem em zero.
     */
    effectiveWeight: 0,
    contribution: 0,

    enabled,

    fallbackReason:
      enabled
        ? null
        : sourceFound
          ? "SOURCE_WITHOUT_VALID_PROBABILITY"
          : "SOURCE_NOT_FOUND",

    metadata: {
      bridgeVersion:
        "TOP3_V7_EXISTING_LAYERS_BRIDGE_V1",

      sourceAlias:
        sourceAlias || null,

      directAlias:
        directAlias || null,

      sourceFound,
    },
  });
}

export function bridgeCurrentCandidateToTop3V7({
  candidate = {},
  lotteryKey,
  targetYmd,
  targetHour,
  finalRank = null,
  additionalLayers = null,
} = {}) {
  const profile =
    getTop3V7Profile(lotteryKey);

  const detailMaps =
    collectDetailMaps(candidate);

  const evaluations =
    collectEvaluations(candidate);

  const layerResults =
    TOP3_V7_LAYER_CATALOG.map(
      (definition) => {
        if (
          TOP3_V7_ADDITIONAL_LAYER_KEYS.includes(
            definition.key
          )
        ) {
          const group = Number(
            candidate?.grupo ??
            candidate?.group ??
            candidate?.groupNumber ??
            0
          );

          return getTop3V7AdditionalLayerResult(
            additionalLayers,
            definition.key,
            group
          );
        }

        const aliases =
          LAYER_ALIASES[
            definition.key
          ] || [];

        const evaluationSource =
          findEvaluationByAliases(
            evaluations,
            definition.key,
            aliases
          );

        const detailSource =
          evaluationSource ||
          findSourceByAliases(
            detailMaps,
            aliases
          );

        const directSource =
          findDirectField(
            candidate,
            DIRECT_FIELD_ALIASES[
              definition.key
            ] || []
          );

        if (
          !detailSource &&
          !directSource
        ) {
          return createDisabledTop3V7LayerResult(
            definition.key,
            (
              definition.key === "animalOfDay" ||
              definition.key === "stoneFlip"
            )
              ? "NOT_IMPLEMENTED_IN_CURRENT_ENGINE"
              : "SOURCE_NOT_FOUND"
          );
        }

        return createResultFromSource({
          layerKey:
            definition.key,

          source:
            detailSource?.source || null,

          sourceAlias:
            detailSource?.alias || null,

          profile,

          directValue:
            directSource?.value ?? null,

          directAlias:
            directSource?.alias || null,
        });
      }
    );

  return buildTop3V7CandidateTelemetry({
    lotteryKey,
    targetYmd,
    targetHour,

    group:
      candidate?.grupo ??
      candidate?.group ??
      0,

    layerResults,

    finalScore:
      candidate?.scoreProb ??
      candidate?.score ??
      0,

    finalRank,
  });
}

export function bridgeCurrentRankingToTop3V7({
  candidates = [],
  history = [],
  lotteryKey,
  targetYmd,
  targetHour,
} = {}) {
  const safeCandidates =
    Array.isArray(candidates)
      ? candidates
      : [];

  const additionalLayers =
    buildTop3V7AdditionalLayers({
      history,
      targetYmd,
      targetHour,
    });

  return safeCandidates.map(
    (candidate, index) =>
      bridgeCurrentCandidateToTop3V7({
        candidate,
        lotteryKey,
        targetYmd,
        targetHour,
        finalRank: index + 1,
        additionalLayers,
      })
  );
}

export function summarizeTop3V7Bridge(
  telemetry = []
) {
  const candidates =
    Array.isArray(telemetry)
      ? telemetry
      : [];

  const layerAvailability =
    TOP3_V7_LAYER_CATALOG.map(
      (definition) => {
        const enabledCount =
          candidates.reduce(
            (total, candidate) => {
              const layer =
                candidate?.layers?.find?.(
                  (item) =>
                    item?.key ===
                    definition.key
                );

              return (
                total +
                (
                  layer?.enabled
                    ? 1
                    : 0
                )
              );
            },
            0
          );

        return {
          key:
            definition.key,

          label:
            definition.label,

          candidateCount:
            candidates.length,

          enabledCount,

          coverage:
            candidates.length > 0
              ? enabledCount /
                candidates.length
              : 0,
        };
      }
    );

  return {
    bridgeVersion:
      "TOP3_V7_EXISTING_LAYERS_BRIDGE_V1",

    candidateCount:
      candidates.length,

    expectedLayerCount:
      TOP3_V7_LAYER_CATALOG.length,

    candidatesWith18Layers:
      candidates.filter(
        (candidate) =>
          candidate?.layerCount === 18
      ).length,

    activeInfluenceCount:
      candidates.reduce(
        (total, candidate) =>
          total +
          Number(
            candidate?.activeLayerCount ||
            0
          ),
        0
      ),

    layerAvailability,
  };
}

