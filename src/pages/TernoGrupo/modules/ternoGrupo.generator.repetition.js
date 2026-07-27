import {
  extractTop5Groups,
} from "../ternoGrupo.public-api";

export const TERNO_GRUPO_REPETITION_MIN_QUANTITY = 1;
export const TERNO_GRUPO_REPETITION_MAX_QUANTITY = 2925;

export const TERNO_GRUPO_REPETITION_RANKING_VERSION =
  "TERNO_GRUPO_REPETITION_V1_MULTIPLICITY";

const GROUP_MIN = 1;
const GROUP_MAX = 25;
const RECENT_WINDOW = 120;

function normalizeGrupo(value) {
  const grupo = Number(value);

  if (
    !Number.isInteger(grupo) ||
    grupo < GROUP_MIN ||
    grupo > GROUP_MAX
  ) {
    return null;
  }

  return grupo;
}

function normalizeHour(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!text) return "";

  const match = text.match(
    /(?:^|\D)(\d{1,2})(?::(\d{2}))?\s*h?/
  );

  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}:${String(
    minute
  ).padStart(2, "0")}`;
}

function extractDrawHour(draw) {
  return normalizeHour(
    draw?.close_hour ??
      draw?.closeHour ??
      draw?.hour ??
      draw?.hora ??
      draw?.draw_hour ??
      draw?.drawHour ??
      ""
  );
}

function extractGrupo(item) {
  return normalizeGrupo(
    item?.grupo ??
      item?.group ??
      item?.grupo2 ??
      item?.animal_grupo ??
      item?.id
  );
}

function clamp01(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(0, Math.min(1, number));
}

function normalizeProbability(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  if (number > 1) {
    return clamp01(number / 100);
  }

  return clamp01(number);
}

function extractAnalyticsScore(item) {
  const candidates = [
    item?.displayConfidence,
    item?.confidence,
    item?.scoreProb,
    item?.prob,
    item?.probPct,
    item?.probCond,
    item?.score,
    item?.weight,
    item?.strength,
    item?.frequencyPct,
    item?.rate,
  ];

  for (const candidate of candidates) {
    const number = Number(candidate);

    if (Number.isFinite(number)) {
      return normalizeProbability(number);
    }
  }

  return 0;
}

function pairKey(first, second) {
  return [first, second]
    .sort((a, b) => a - b)
    .join("-");
}

function tripleKey(values) {
  return [...values]
    .sort((a, b) => a - b)
    .join("-");
}

function incrementMap(map, key, amount = 1) {
  if (!key) return;

  map.set(
    key,
    Number(map.get(key) || 0) + amount
  );
}

function getMapValue(map, key) {
  return Number(map.get(key) || 0);
}

function getMapMaximum(map) {
  let maximum = 0;

  for (const value of map.values()) {
    const number = Number(value || 0);

    if (number > maximum) {
      maximum = number;
    }
  }

  return maximum;
}

function top5GroupsWithMultiplicity(draw) {
  const groups = [];

  for (const item of extractTop5Groups(draw)) {
    const grupo = normalizeGrupo(item?.grupo);

    if (grupo == null) {
      continue;
    }

    groups.push(grupo);

    if (groups.length >= 5) {
      break;
    }
  }

  return groups;
}

function createEmptyHistoricalStats() {
  return {
    drawCount: 0,
    usableDrawCount: 0,
    targetHourDrawCount: 0,

    individual: new Map(),
    pair: new Map(),
    triple: new Map(),

    recentIndividual: new Map(),
    recentPair: new Map(),
    recentTriple: new Map(),

    targetHourIndividual: new Map(),
    targetHourPair: new Map(),
    targetHourTriple: new Map(),
  };
}

function registerGroups({
  groups,
  individualMap,
  pairMap,
  tripleMap,
  weight = 1,
}) {
  for (const grupo of groups) {
    incrementMap(
      individualMap,
      String(grupo),
      weight
    );
  }

  const pairKeysInDraw = new Set();
  const tripleKeysInDraw = new Set();

  for (
    let first = 0;
    first < groups.length - 1;
    first += 1
  ) {
    for (
      let second = first + 1;
      second < groups.length;
      second += 1
    ) {
      pairKeysInDraw.add(
        pairKey(
          groups[first],
          groups[second]
        )
      );
    }
  }

  for (const key of pairKeysInDraw) {
    incrementMap(
      pairMap,
      key,
      weight
    );
  }

  if (groups.length >= 3) {
    for (
      let first = 0;
      first < groups.length - 2;
      first += 1
    ) {
      for (
        let second = first + 1;
        second < groups.length - 1;
        second += 1
      ) {
        for (
          let third = second + 1;
          third < groups.length;
          third += 1
        ) {
          tripleKeysInDraw.add(
            tripleKey([
              groups[first],
              groups[second],
              groups[third],
            ])
          );
        }
      }
    }
  }

  for (const key of tripleKeysInDraw) {
    incrementMap(
      tripleMap,
      key,
      weight
    );
  }
}

function buildHistoricalStats({
  historicalDraws,
  targetHour,
}) {
  const stats = createEmptyHistoricalStats();

  const draws = Array.isArray(historicalDraws)
    ? historicalDraws.filter(Boolean)
    : [];

  stats.drawCount = draws.length;

  const recentStart = Math.max(
    0,
    draws.length - RECENT_WINDOW
  );

  draws.forEach((draw, index) => {
    const groups =
      top5GroupsWithMultiplicity(draw);

    if (groups.length < 3) {
      return;
    }

    stats.usableDrawCount += 1;

    registerGroups({
      groups,
      individualMap: stats.individual,
      pairMap: stats.pair,
      tripleMap: stats.triple,
    });

    if (index >= recentStart) {
      const recentPosition =
        index - recentStart + 1;

      const recentLength =
        draws.length - recentStart;

      const recencyWeight =
        recentLength > 1
          ? 0.65 +
            0.35 *
              ((recentPosition - 1) /
                (recentLength - 1))
          : 1;

      registerGroups({
        groups,
        individualMap:
          stats.recentIndividual,
        pairMap: stats.recentPair,
        tripleMap: stats.recentTriple,
        weight: recencyWeight,
      });
    }

    const drawHour = extractDrawHour(draw);

    if (
      targetHour &&
      drawHour === targetHour
    ) {
      stats.targetHourDrawCount += 1;

      registerGroups({
        groups,
        individualMap:
          stats.targetHourIndividual,
        pairMap: stats.targetHourPair,
        tripleMap:
          stats.targetHourTriple,
      });
    }
  });

  return stats;
}

function buildAnalyticsMap(analytics) {
  const map = new Map();

  const source = Array.isArray(
    analytics?.top
  )
    ? analytics.top
    : [];

  source.forEach((item, index) => {
    const grupo = extractGrupo(item);

    if (grupo == null) {
      return;
    }

    const explicitScore =
      extractAnalyticsScore(item);

    const rankingScore =
      source.length > 1
        ? 1 - index / (source.length - 1)
        : 1;

    const score =
      explicitScore > 0
        ? explicitScore
        : rankingScore;

    map.set(
      grupo,
      Math.max(
        Number(map.get(grupo) || 0),
        clamp01(score)
      )
    );
  });

  return map;
}

function normalizedMapValue(
  map,
  key,
  maximum
) {
  if (!(maximum > 0)) {
    return 0;
  }

  return clamp01(
    getMapValue(map, key) / maximum
  );
}

function average(values) {
  const valid = values.filter(
    Number.isFinite
  );

  if (!valid.length) {
    return 0;
  }

  return (
    valid.reduce(
      (sum, value) => sum + value,
      0
    ) / valid.length
  );
}

function harmonicMean(values) {
  const valid = values
    .map((value) =>
      Math.max(0.000001, Number(value || 0))
    )
    .filter(Number.isFinite);

  if (!valid.length) {
    return 0;
  }

  const denominator = valid.reduce(
    (sum, value) => sum + 1 / value,
    0
  );

  if (!(denominator > 0)) {
    return 0;
  }

  return valid.length / denominator;
}

function buildNormalization(stats) {
  return {
    individualMax:
      getMapMaximum(stats.individual),

    pairMax:
      getMapMaximum(stats.pair),

    tripleMax:
      getMapMaximum(stats.triple),

    recentIndividualMax:
      getMapMaximum(
        stats.recentIndividual
      ),

    recentPairMax:
      getMapMaximum(stats.recentPair),

    recentTripleMax:
      getMapMaximum(
        stats.recentTriple
      ),

    targetHourIndividualMax:
      getMapMaximum(
        stats.targetHourIndividual
      ),

    targetHourPairMax:
      getMapMaximum(
        stats.targetHourPair
      ),

    targetHourTripleMax:
      getMapMaximum(
        stats.targetHourTriple
      ),
  };
}

function calculateCombinationEvidence({
  grupos,
  analyticsMap,
  stats,
  normalization,
}) {
  const [first, second, third] = grupos;

  const groupKeys = grupos.map(String);

  const pairKeys = [
    pairKey(first, second),
    pairKey(first, third),
    pairKey(second, third),
  ];

  const combinationKey =
    tripleKey(grupos);

  const individualHistorical =
    groupKeys.map((key) =>
      normalizedMapValue(
        stats.individual,
        key,
        normalization.individualMax
      )
    );

  const individualRecent =
    groupKeys.map((key) =>
      normalizedMapValue(
        stats.recentIndividual,
        key,
        normalization.recentIndividualMax
      )
    );

  const individualTargetHour =
    groupKeys.map((key) =>
      normalizedMapValue(
        stats.targetHourIndividual,
        key,
        normalization.targetHourIndividualMax
      )
    );

  const analyticsSignals =
    grupos.map((grupo) =>
      Number(analyticsMap.get(grupo) || 0)
    );

  const pairHistorical =
    pairKeys.map((key) =>
      normalizedMapValue(
        stats.pair,
        key,
        normalization.pairMax
      )
    );

  const pairRecent =
    pairKeys.map((key) =>
      normalizedMapValue(
        stats.recentPair,
        key,
        normalization.recentPairMax
      )
    );

  const pairTargetHour =
    pairKeys.map((key) =>
      normalizedMapValue(
        stats.targetHourPair,
        key,
        normalization.targetHourPairMax
      )
    );

  const tripleHistorical =
    normalizedMapValue(
      stats.triple,
      combinationKey,
      normalization.tripleMax
    );

  const tripleRecent =
    normalizedMapValue(
      stats.recentTriple,
      combinationKey,
      normalization.recentTripleMax
    );

  const tripleTargetHour =
    normalizedMapValue(
      stats.targetHourTriple,
      combinationKey,
      normalization.targetHourTripleMax
    );

  const individualStrength =
    harmonicMean([
      average(individualHistorical),
      average(individualRecent),
    ]);

  const pairStrength =
    harmonicMean([
      average(pairHistorical),
      average(pairRecent),
    ]);

  const tripleStrength =
    tripleHistorical * 0.65 +
    tripleRecent * 0.35;

  const targetHourStrength =
    stats.targetHourDrawCount > 0
      ? (
          average(
            individualTargetHour
          ) *
            0.35 +
          average(pairTargetHour) *
            0.4 +
          tripleTargetHour * 0.25
        )
      : 0;

  const analyticsStrength =
    analyticsSignals.some(
      (value) => value > 0
    )
      ? harmonicMean(
          analyticsSignals.map(
            (value) =>
              value > 0
                ? value
                : 0.08
          )
        )
      : 0;

  const individualSpread =
    Math.max(
      ...individualHistorical
    ) -
    Math.min(
      ...individualHistorical
    );

  const balance =
    1 - clamp01(individualSpread);

  const evidenceScore =
    individualStrength * 0.26 +
    pairStrength * 0.3 +
    tripleStrength * 0.24 +
    targetHourStrength * 0.12 +
    analyticsStrength * 0.06 +
    balance * 0.02;

  return {
    rawScore: clamp01(evidenceScore),

    components: {
      individualStrength,
      pairStrength,
      tripleStrength,
      targetHourStrength,
      analyticsStrength,
      balance,
    },

    occurrences: {
      tripleHistorical:
        getMapValue(
          stats.triple,
          combinationKey
        ),

      tripleRecent:
        getMapValue(
          stats.recentTriple,
          combinationKey
        ),

      tripleTargetHour:
        getMapValue(
          stats.targetHourTriple,
          combinationKey
        ),

      pairHistorical:
        pairKeys.map((key) =>
          getMapValue(stats.pair, key)
        ),
    },
  };
}

function buildAllCombinations({
  analytics,
  historicalDraws,
  targetHour,
}) {
  const analyticsMap =
    buildAnalyticsMap(analytics);

  const stats = buildHistoricalStats({
    historicalDraws,
    targetHour:
      normalizeHour(targetHour),
  });

  const normalization =
    buildNormalization(stats);

  const combinations = [];

  for (
    let first = GROUP_MIN;
    first <= GROUP_MAX;
    first += 1
  ) {
    for (
      let second = first;
      second <= GROUP_MAX;
      second += 1
    ) {
      for (
        let third = second;
        third <= GROUP_MAX;
        third += 1
      ) {
        const grupos = [
          first,
          second,
          third,
        ];

        const evidence =
          calculateCombinationEvidence({
            grupos,
            analyticsMap,
            stats,
            normalization,
          });

        combinations.push({
          key: tripleKey(grupos),
          grupos,
          items: grupos.map((grupo) => ({
            grupo,
            analyticsScore:
              Number(
                analyticsMap.get(grupo) || 0
              ),
          })),
          rawScore: evidence.rawScore,
          components:
            evidence.components,
          occurrences:
            evidence.occurrences,
        });
      }
    }
  }

  return {
    combinations,
    stats,
  };
}

function applyRelativeStrength(
  combinations
) {
  const scores = combinations
    .map((item) =>
      Number(item?.rawScore || 0)
    )
    .filter(Number.isFinite);

  const minimum = scores.length
    ? Math.min(...scores)
    : 0;

  const maximum = scores.length
    ? Math.max(...scores)
    : 0;

  const span = maximum - minimum;

  return combinations.map((item) => {
    const relative =
      span > 0
        ? (
            Number(item.rawScore || 0) -
            minimum
          ) / span
        : 0;

    return {
      ...item,

      scorePct:
        1 + clamp01(relative) * 98,

      rawEvidencePct:
        clamp01(item.rawScore) * 100,
    };
  });
}

export function buildAllTernosGrupoRepetition({
  analytics,
  seedGroups,
  historicalDraws,
  targetHour,
}) {
  const {
    combinations,
    stats,
  } = buildAllCombinations({
    analytics,
    historicalDraws,
    targetHour,
  });

  const ranked =
    applyRelativeStrength(
      combinations
    );

  ranked.sort((a, b) => {
    if (
      b.rawScore !== a.rawScore
    ) {
      return (
        b.rawScore - a.rawScore
      );
    }

    const bTriple =
      Number(
        b?.occurrences
          ?.tripleHistorical || 0
      );

    const aTriple =
      Number(
        a?.occurrences
          ?.tripleHistorical || 0
      );

    if (bTriple !== aTriple) {
      return bTriple - aTriple;
    }

    return a.key.localeCompare(b.key);
  });

  return ranked.map(
    (combination, index) => ({
      ...combination,

      rank: index + 1,

      engineVersion:
        TERNO_GRUPO_REPETITION_RANKING_VERSION,

      scoreType:
        "RELATIVE_STRENGTH_INDEX",

      validationRule:
        "3_GROUP_OCCURRENCES_IN_TOP5_BY_MULTIPLICITY",

      orderMatters: false,

      multiplicityMatters: true,

      repetitionAllowed: true,

      historicalMeta: {
        drawCount:
          stats.drawCount,

        usableDrawCount:
          stats.usableDrawCount,

        targetHourDrawCount:
          stats.targetHourDrawCount,

        recentWindow:
          RECENT_WINDOW,

        seedGroupsReceived:
          Array.isArray(seedGroups)
            ? seedGroups.length
            : 0,
      },
    })
  );
}

export function normalizeTernoRepetitionQuantity(value) {
  const parsed = Number.parseInt(
    String(value ?? "")
      .replace(/\D/g, ""),
    10
  );

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function validateTernoRepetitionQuantity(value) {
  const quantity =
    normalizeTernoRepetitionQuantity(value);

  if (quantity == null) {
    return {
      valid: false,
      quantity: null,
      message:
        "Informe a quantidade de ternos que deseja gerar.",
    };
  }

  if (
    quantity <
    TERNO_GRUPO_REPETITION_MIN_QUANTITY
  ) {
    return {
      valid: false,
      quantity,
      message:
        "A quantidade mínima é 1 terno de grupo.",
    };
  }

  if (
    quantity >
    TERNO_GRUPO_REPETITION_MAX_QUANTITY
  ) {
    return {
      valid: false,
      quantity,
      message:
        "A quantidade informada é superior às 2.925 combinações possíveis.",
    };
  }

  return {
    valid: true,
    quantity,
    message: "",
  };
}
