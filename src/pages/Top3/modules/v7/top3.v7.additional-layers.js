/*
 * TOP3_V7_12_ADDITIONAL_LAYERS_FOUNDATION_V1
 *
 * Construtor passivo das 12 camadas adicionais do TOP3 V7.
 *
 * Regras:
 * - somente histórico anterior ao sorteio-alvo;
 * - distribuição entre os 25 grupos;
 * - suavização para evitar probabilidade zero;
 * - confiabilidade baseada na amostra;
 * - configuredWeight, effectiveWeight e contribution permanecem zero;
 * - nenhuma alteração no V3, scoreProb, ranking ou TOP3.
 */

import {
  createDisabledTop3V7LayerResult,
  createTop3V7LayerResult,
} from "./top3.v7.contract";

const GROUP_COUNT = 25;
const UNIFORM_PROBABILITY = 1 / GROUP_COUNT;
const DEFAULT_SMOOTHING = 1;

export const TOP3_V7_ADDITIONAL_LAYER_KEYS = Object.freeze([
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

function finiteNumber(value, fallback = null) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      finiteNumber(value, minimum)
    )
  );
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function normalizeYmd(value) {
  const text = String(value || "").trim();

  const match = text.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/
  );

  if (!match) {
    return null;
  }

  return (
    `${match[1]}-` +
    `${String(Number(match[2])).padStart(2, "0")}-` +
    `${String(Number(match[3])).padStart(2, "0")}`
  );
}

function normalizeHour(value) {
  const text = String(value || "").trim();

  const match = text.match(
    /^(\d{1,2})(?::(\d{2}))?/
  );

  if (!match) {
    return null;
  }

  return (
    `${String(Number(match[1])).padStart(2, "0")}:` +
    `${String(Number(match[2] || 0)).padStart(2, "0")}`
  );
}

function drawDate(draw) {
  return normalizeYmd(
    draw?.date ??
    draw?.ymd ??
    draw?.drawDate ??
    draw?.targetYmd
  );
}

function drawHour(draw) {
  return normalizeHour(
    draw?.close_hour ??
    draw?.closeHour ??
    draw?.hour ??
    draw?.targetHour
  );
}

function drawTimestamp(draw) {
  const ymd = drawDate(draw);
  const hour = drawHour(draw) || "00:00";

  if (!ymd) {
    return null;
  }

  const timestamp =
    Date.parse(`${ymd}T${hour}:00`);

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
}

function groupFromValue(value) {
  const direct = finiteNumber(
    value?.group ??
    value?.grupo ??
    value?.groupNumber ??
    value?.grupoNumero ??
    value,
    null
  );

  if (
    direct !== null &&
    direct >= 1 &&
    direct <= 25
  ) {
    return Math.trunc(direct);
  }

  const number = finiteNumber(
    value?.number ??
    value?.numero ??
    value?.milhar ??
    value?.centena ??
    value?.dezena,
    null
  );

  if (number === null) {
    return null;
  }

  const dezena =
    Math.abs(Math.trunc(number)) % 100;

  return groupFromDezena(dezena);
}

function groupFromDezena(dezenaValue) {
  let dezena =
    Math.abs(
      Math.trunc(
        finiteNumber(dezenaValue, 0)
      )
    ) % 100;

  if (dezena === 0) {
    dezena = 100;
  }

  return Math.min(
    25,
    Math.max(
      1,
      Math.ceil(dezena / 4)
    )
  );
}

function extractFirstGroup(draw) {
  const candidates = [
    draw?.firstGroup,
    draw?.first_group,
    draw?.group,
    draw?.grupo,
    draw?.firstPrize,
    draw?.positions?.[0],
    draw?.prizes?.[0],
    draw?.results?.[0],
    draw?.top3?.[0],
  ];

  for (const candidate of candidates) {
    const group = groupFromValue(candidate);

    if (group !== null) {
      return group;
    }
  }

  return null;
}

function extractTop3Groups(draw) {
  const arraySources = [
    draw?.top3,
    draw?.positions,
    draw?.prizes,
    draw?.results,
    draw?.groups,
  ];

  for (const source of arraySources) {
    if (!Array.isArray(source)) {
      continue;
    }

    const groups = source
      .slice(0, 3)
      .map(groupFromValue)
      .filter(
        (group) =>
          group !== null
      );

    if (groups.length) {
      return [...new Set(groups)];
    }
  }

  const directGroups = [
    draw?.firstGroup,
    draw?.secondGroup,
    draw?.thirdGroup,
    draw?.group1,
    draw?.group2,
    draw?.group3,
    draw?.grupo1,
    draw?.grupo2,
    draw?.grupo3,
  ]
    .map(groupFromValue)
    .filter(
      (group) =>
        group !== null
    );

  if (directGroups.length) {
    return [...new Set(directGroups)];
  }

  const first = extractFirstGroup(draw);

  return first !== null
    ? [first]
    : [];
}

function targetParts(targetYmd) {
  const normalized =
    normalizeYmd(targetYmd);

  if (!normalized) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] = normalized
    .split("-")
    .map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  return {
    ymd: normalized,
    year,
    month,
    day,
    weekday: date.getUTCDay(),
  };
}

function historicalBeforeTarget({
  history,
  targetYmd,
  targetHour,
}) {
  const targetDate =
    normalizeYmd(targetYmd);

  const targetTime =
    normalizeHour(targetHour) || "23:59";

  const targetTimestamp =
    Date.parse(
      `${targetDate}T${targetTime}:00`
    );

  return safeArray(history)
    .filter((draw) => {
      const timestamp =
        drawTimestamp(draw);

      return (
        timestamp !== null &&
        timestamp < targetTimestamp
      );
    })
    .sort(
      (left, right) =>
        drawTimestamp(left) -
        drawTimestamp(right)
    );
}

function emptyCounts() {
  return Array.from(
    { length: GROUP_COUNT + 1 },
    () => 0
  );
}

function probabilityDistribution({
  counts,
  total,
  smoothing = DEFAULT_SMOOTHING,
}) {
  const denominator =
    Math.max(0, Number(total || 0)) +
    (
      Math.max(0, Number(smoothing || 0)) *
      GROUP_COUNT
    );

  const output = new Map();

  for (
    let group = 1;
    group <= GROUP_COUNT;
    group += 1
  ) {
    const numerator =
      Math.max(
        0,
        Number(counts?.[group] || 0)
      ) +
      Math.max(
        0,
        Number(smoothing || 0)
      );

    output.set(
      group,
      denominator > 0
        ? numerator / denominator
        : UNIFORM_PROBABILITY
    );
  }

  return output;
}

function reliabilityFromSamples(
  samples,
  reference = 30
) {
  return clamp(
    Number(samples || 0) /
      Math.max(1, Number(reference || 1)),
    0,
    1
  );
}

function buildLayerMap({
  key,
  probabilityByGroup,
  samples,
  reliability,
  metadata = null,
  enabled = true,
  fallbackReason = null,
}) {
  const output = new Map();

  for (
    let group = 1;
    group <= GROUP_COUNT;
    group += 1
  ) {
    output.set(
      group,
      createTop3V7LayerResult({
        key,

        probability:
          probabilityByGroup?.get?.(group) ??
          UNIFORM_PROBABILITY,

        samples:
          Math.max(
            0,
            Math.trunc(
              Number(samples || 0)
            )
          ),

        reliability:
          clamp(reliability, 0, 1),

        configuredWeight: 0,
        effectiveWeight: 0,
        contribution: 0,

        enabled,

        fallbackReason:
          enabled
            ? null
            : fallbackReason,

        metadata,
      })
    );
  }

  return output;
}

function disabledLayerMap(
  key,
  reason
) {
  const output = new Map();

  for (
    let group = 1;
    group <= GROUP_COUNT;
    group += 1
  ) {
    output.set(
      group,
      createDisabledTop3V7LayerResult(
        key,
        reason
      )
    );
  }

  return output;
}

/*
 * TOP3_V7_REAL_OCCURRENCE_DENOMINATOR_V2
 *
 * O denominador usa a quantidade real de grupos contabilizados.
 * Não presume três ocorrências válidas por sorteio.
 */
/*
 * TOP3_V7_HISTORICAL_ALL_OFFICIAL_POSITIONS_V1
 *
 * historicalFrequency:
 * - usa todas as posições oficiais disponíveis no sorteio;
 *
 * top3Frequency:
 * - continua usando exclusivamente as posições 1º a 3º.
 *
 * O extrator preserva os três primeiros grupos obtidos pela função oficial
 * extractTop3Groups e acrescenta somente posições posteriores disponíveis.
 */
function normalizeHistoricalOfficialGroup(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value === "object"
  ) {
    const directGroup = Number(
      value?.group ??
      value?.grupo ??
      value?.groupNumber ??
      value?.grupoNumero ??
      value?.animalGroup ??
      value?.bichoGroup
    );

    if (
      Number.isFinite(directGroup) &&
      directGroup >= 1 &&
      directGroup <= GROUP_COUNT
    ) {
      return Math.trunc(directGroup);
    }

    const numberValue =
      value?.number ??
      value?.numero ??
      value?.milhar ??
      value?.centena ??
      value?.dezena ??
      value?.value ??
      value?.result ??
      value?.resultado;

    return normalizeHistoricalOfficialGroup(
      numberValue
    );
  }

  const digits =
    String(value)
      .replace(/\D+/g, "");

  if (!digits) {
    return null;
  }

  let dezena =
    Math.abs(
      Math.trunc(
        Number(digits)
      )
    ) % 100;

  if (!Number.isFinite(dezena)) {
    return null;
  }

  if (dezena === 0) {
    dezena = 100;
  }

  const group =
    Math.ceil(dezena / 4);

  return (
    group >= 1 &&
    group <= GROUP_COUNT
  )
    ? group
    : null;
}

function extractAllOfficialGroups(
  draw
) {
  const top3Groups =
    extractTop3Groups(draw);

  const arraySources = [
    draw?.prizes,
    draw?.positions,
    draw?.results,
    draw?.premios,
    draw?.drawResults,
    draw?.officialResults,
  ].filter(Array.isArray);

  let longestSource = [];

  for (const source of arraySources) {
    if (source.length > longestSource.length) {
      longestSource = source;
    }
  }

  if (longestSource.length <= 3) {
    return top3Groups;
  }

  const additionalGroups =
    longestSource
      .slice(3)
      .map(
        normalizeHistoricalOfficialGroup
      )
      .filter(
        (group) =>
          Number.isInteger(group) &&
          group >= 1 &&
          group <= GROUP_COUNT
      );

  return [
    ...top3Groups,
    ...additionalGroups,
  ];
}

function historicalFrequencyLayer(
  draws
) {
  const counts = emptyCounts();

  let samples = 0;
  let totalOccurrences = 0;
  let drawsWithAdditionalPositions = 0;
  let maximumPositions = 0;

  for (const draw of draws) {
    const top3Groups =
      extractTop3Groups(draw);

    const groups =
      extractAllOfficialGroups(draw);

    if (!groups.length) {
      continue;
    }

    samples += 1;

    if (
      groups.length >
      top3Groups.length
    ) {
      drawsWithAdditionalPositions += 1;
    }

    maximumPositions =
      Math.max(
        maximumPositions,
        groups.length
      );

    for (const group of groups) {
      counts[group] += 1;
      totalOccurrences += 1;
    }
  }

  if (
    samples === 0 ||
    totalOccurrences === 0
  ) {
    return disabledLayerMap(
      "historicalFrequency",
      "NO_VALID_HISTORICAL_SAMPLES"
    );
  }

  return buildLayerMap({
    key:
      "historicalFrequency",

    probabilityByGroup:
      probabilityDistribution({
        counts,
        total:
          totalOccurrences,
      }),

    samples,

    reliability:
      reliabilityFromSamples(
        samples,
        40
      ),

    metadata: {
      scope:
        "all_available_official_positions",

      drawsWithAdditionalPositions,

      maximumPositions,

      totalOccurrences,
    },
  });
}

function podiumFrequencyLayer(
  key,
  draws,
  metadata = null
) {
  const counts = emptyCounts();
  let samples = 0;
  let totalOccurrences = 0;

  for (const draw of draws) {
    const groups =
      extractTop3Groups(draw);

    if (!groups.length) {
      continue;
    }

    samples += 1;

    for (const group of groups) {
      counts[group] += 1;
      totalOccurrences += 1;
    }
  }

  if (
    samples === 0 ||
    totalOccurrences === 0
  ) {
    return disabledLayerMap(
      key,
      "NO_VALID_HISTORICAL_SAMPLES"
    );
  }

  return buildLayerMap({
    key,

    probabilityByGroup:
      probabilityDistribution({
        counts,
        total:
          totalOccurrences,
      }),

    samples,

    reliability:
      reliabilityFromSamples(
        samples,
        40
      ),

    metadata,
  });
}

function firstPrizeFrequencyLayer(
  draws
) {
  const counts = emptyCounts();
  let samples = 0;

  for (const draw of draws) {
    const group =
      extractFirstGroup(draw);

    if (group === null) {
      continue;
    }

    counts[group] += 1;
    samples += 1;
  }

  if (samples === 0) {
    return disabledLayerMap(
      "firstPrizeFrequency",
      "NO_VALID_FIRST_PRIZE_SAMPLES"
    );
  }

  return buildLayerMap({
    key:
      "firstPrizeFrequency",

    probabilityByGroup:
      probabilityDistribution({
        counts,
        total: samples,
      }),

    samples,

    reliability:
      reliabilityFromSamples(
        samples,
        60
      ),
  });
}

function sequenceOrder2Layer(
  draws
) {
  if (draws.length < 3) {
    return disabledLayerMap(
      "sequenceOrder2",
      "INSUFFICIENT_SEQUENCE_HISTORY"
    );
  }

  const lastTwo = draws
    .slice(-2)
    .map(extractFirstGroup);

  if (
    lastTwo.length !== 2 ||
    lastTwo.some(
      (group) => group === null
    )
  ) {
    return disabledLayerMap(
      "sequenceOrder2",
      "INVALID_PREVIOUS_SEQUENCE"
    );
  }

  const counts = emptyCounts();
  let samples = 0;
  let totalOccurrences = 0;

  for (
    let index = 2;
    index < draws.length;
    index += 1
  ) {
    const previousTwo = [
      extractFirstGroup(
        draws[index - 2]
      ),
      extractFirstGroup(
        draws[index - 1]
      ),
    ];

    if (
      previousTwo[0] !== lastTwo[0] ||
      previousTwo[1] !== lastTwo[1]
    ) {
      continue;
    }

    const nextGroups =
      extractTop3Groups(
        draws[index]
      );

    if (!nextGroups.length) {
      continue;
    }

    samples += 1;

    for (const group of nextGroups) {
      counts[group] += 1;
      totalOccurrences += 1;
    }
  }

  if (
    samples === 0 ||
    totalOccurrences === 0
  ) {
    return disabledLayerMap(
      "sequenceOrder2",
      "NO_MATCHING_ORDER2_SEQUENCE"
    );
  }

  return buildLayerMap({
    key:
      "sequenceOrder2",

    probabilityByGroup:
      probabilityDistribution({
        counts,
        total:
          totalOccurrences,
      }),

    samples,

    reliability:
      reliabilityFromSamples(
        samples,
        12
      ),

    metadata: {
      previousTwo: lastTwo,
    },
  });
}

function delayLayer(draws) {
  const gaps = emptyCounts();

  for (
    let group = 1;
    group <= GROUP_COUNT;
    group += 1
  ) {
    let gap = 0;
    let found = false;

    for (
      let index = draws.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (
        extractTop3Groups(
          draws[index]
        ).includes(group)
      ) {
        found = true;
        break;
      }

      gap += 1;
    }

    gaps[group] =
      found
        ? gap
        : draws.length;
  }

  if (!draws.length) {
    return disabledLayerMap(
      "delay",
      "NO_HISTORY_FOR_DELAY"
    );
  }

  const totalGap =
    gaps
      .slice(1)
      .reduce(
        (sum, value) =>
          sum + value,
        0
      );

  const probabilities = new Map();

  for (
    let group = 1;
    group <= GROUP_COUNT;
    group += 1
  ) {
    probabilities.set(
      group,
      totalGap > 0
        ? gaps[group] / totalGap
        : UNIFORM_PROBABILITY
    );
  }

  return buildLayerMap({
    key: "delay",

    probabilityByGroup:
      probabilities,

    samples:
      draws.length,

    reliability:
      reliabilityFromSamples(
        draws.length,
        100
      ),

    metadata: {
      interpretation:
        "normalized_gap_since_last_top3_presence",
    },
  });
}

function cycleRegimeLayer(draws) {
  const recent =
    draws.slice(-40);

  if (recent.length < 8) {
    return disabledLayerMap(
      "cycleRegime",
      "INSUFFICIENT_REGIME_HISTORY"
    );
  }

  const counts = emptyCounts();
  let totalOccurrences = 0;

  for (const draw of recent) {
    for (
      const group
      of extractTop3Groups(draw)
    ) {
      counts[group] += 1;
      totalOccurrences += 1;
    }
  }

  if (totalOccurrences === 0) {
    return disabledLayerMap(
      "cycleRegime",
      "NO_VALID_REGIME_OCCURRENCES"
    );
  }

  const distinctGroups =
    counts
      .slice(1)
      .filter(
        (count) => count > 0
      ).length;

  const regime =
    distinctGroups <= 12
      ? "repeat"
      : distinctGroups >= 21
        ? "spread"
        : "neutral";

  return buildLayerMap({
    key:
      "cycleRegime",

    probabilityByGroup:
      probabilityDistribution({
        counts,
        total:
          totalOccurrences,
      }),

    samples:
      recent.length,

    reliability:
      reliabilityFromSamples(
        recent.length,
        40
      ),

    metadata: {
      regime,
      distinctGroups,
    },
  });
}

function animalOfDayLayer(
  targetYmd
) {
  const parts =
    targetParts(targetYmd);

  if (!parts) {
    return disabledLayerMap(
      "animalOfDay",
      "INVALID_TARGET_DATE"
    );
  }

  const selectedGroup =
    groupFromDezena(parts.day);

  const counts = emptyCounts();
  counts[selectedGroup] = 1;

  return buildLayerMap({
    key:
      "animalOfDay",

    probabilityByGroup:
      probabilityDistribution({
        counts,
        total: 1,
        smoothing: 0.05,
      }),

    samples: 1,
    reliability: 0.1,

    metadata: {
      targetDay:
        parts.day,

      selectedGroup,
    },
  });
}

function stoneFlipLayer(
  targetYmd
) {
  const parts =
    targetParts(targetYmd);

  if (!parts) {
    return disabledLayerMap(
      "stoneFlip",
      "INVALID_TARGET_DATE"
    );
  }

  const dayText =
    String(parts.day)
      .padStart(2, "0");

  const reversedDay =
    Number(
      dayText
        .split("")
        .reverse()
        .join("")
    );

  const selectedGroup =
    groupFromDezena(
      reversedDay
    );

  const counts = emptyCounts();
  counts[selectedGroup] = 1;

  return buildLayerMap({
    key:
      "stoneFlip",

    probabilityByGroup:
      probabilityDistribution({
        counts,
        total: 1,
        smoothing: 0.05,
      }),

    samples: 1,
    reliability: 0.1,

    metadata: {
      targetDay:
        parts.day,

      reversedDay,
      selectedGroup,
    },
  });
}

export function buildTop3V7AdditionalLayers({
  history = [],
  targetYmd,
  targetHour,
} = {}) {
  const draws =
    historicalBeforeTarget({
      history,
      targetYmd,
      targetHour,
    });

  const parts =
    targetParts(targetYmd);

  if (!parts) {
    return Object.fromEntries(
      TOP3_V7_ADDITIONAL_LAYER_KEYS.map(
        (key) => [
          key,
          disabledLayerMap(
            key,
            "INVALID_TARGET_DATE"
          ),
        ]
      )
    );
  }

  const monthDraws =
    draws.filter(
      (draw) => {
        const partsDraw =
          targetParts(
            drawDate(draw)
          );

        return (
          partsDraw &&
          partsDraw.month ===
            parts.month
        );
      }
    );

  const weekdayDraws =
    draws.filter(
      (draw) => {
        const partsDraw =
          targetParts(
            drawDate(draw)
          );

        return (
          partsDraw &&
          partsDraw.weekday ===
            parts.weekday
        );
      }
    );

  const sameDayPreviousDraws =
    draws.filter(
      (draw) =>
        drawDate(draw) ===
        parts.ymd
    );

  const shortMemoryDraws =
    draws.slice(-20);

  return {
    month:
      podiumFrequencyLayer(
        "month",
        monthDraws,
        {
          targetMonth:
            parts.month,
        }
      ),

    weekday:
      podiumFrequencyLayer(
        "weekday",
        weekdayDraws,
        {
          targetWeekday:
            parts.weekday,
        }
      ),

    historicalFrequency:
      historicalFrequencyLayer(
        draws
      ),

    firstPrizeFrequency:
      firstPrizeFrequencyLayer(
        draws
      ),

    top3Frequency:
      podiumFrequencyLayer(
        "top3Frequency",
        draws
      ),

    sequenceOrder2:
      sequenceOrder2Layer(
        draws
      ),

    shortMemory:
      podiumFrequencyLayer(
        "shortMemory",
        shortMemoryDraws,
        {
          window:
            shortMemoryDraws.length,
        }
      ),

    delay:
      delayLayer(draws),

    cycleRegime:
      cycleRegimeLayer(draws),

    dailyFlow:
      podiumFrequencyLayer(
        "dailyFlow",
        sameDayPreviousDraws,
        {
          sameDayDrawCount:
            sameDayPreviousDraws.length,
        }
      ),

    animalOfDay:
      animalOfDayLayer(
        targetYmd
      ),

    stoneFlip:
      stoneFlipLayer(
        targetYmd
      ),
  };
}

export function getTop3V7AdditionalLayerResult(
  additionalLayers,
  layerKey,
  group
) {
  const layerMap =
    additionalLayers?.[layerKey];

  return (
    layerMap?.get?.(
      Number(group)
    ) ||
    createDisabledTop3V7LayerResult(
      layerKey,
      "ADDITIONAL_LAYER_RESULT_NOT_FOUND"
    )
  );
}

export function summarizeTop3V7AdditionalLayers(
  additionalLayers
) {
  return TOP3_V7_ADDITIONAL_LAYER_KEYS.map(
    (layerKey) => {
      const layerMap =
        additionalLayers?.[layerKey];

      const rows =
        layerMap instanceof Map
          ? [...layerMap.values()]
          : [];

      return {
        key:
          layerKey,

        groupCount:
          rows.length,

        enabledGroups:
          rows.filter(
            (row) => row?.enabled
          ).length,

        positiveEffectiveWeights:
          rows.filter(
            (row) =>
              Number(
                row?.effectiveWeight || 0
              ) > 0
          ).length,

        nonZeroContributions:
          rows.filter(
            (row) =>
              Math.abs(
                Number(
                  row?.contribution || 0
                )
              ) > 1e-12
          ).length,
      };
    }
  );
}
