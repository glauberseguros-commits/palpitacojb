"use strict";

const {
  computeStatisticalTop3V3,
} = require("./scoreEngineUnified");

const GROUPS_K = 25;
const LAPLACE_ALPHA = 1;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeHour(value) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return "";
  }

  const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?/);

  if (!match) {
    return "";
  }

  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);

  if (
    !Number.isFinite(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isFinite(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeYmd(value) {
  const raw = String(value ?? "").trim();

  const isoMatch = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const brMatch = raw.match(
    /^(\d{2})\/(\d{2})\/(\d{4})/
  );

  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }

  return "";
}

function pickDrawYmd(draw) {
  return normalizeYmd(
    draw?.ymd ??
    draw?.date ??
    draw?.data ??
    draw?.draw_date ??
    draw?.drawDate ??
    draw?.close_date ??
    draw?.closeDate
  );
}

function pickDrawHour(draw) {
  return normalizeHour(
    draw?.close_hour ??
    draw?.closeHour ??
    draw?.hour ??
    draw?.hora
  );
}

function groupFromDezena(value) {
  const digits = String(value ?? "")
    .replace(/\D+/g, "")
    .padStart(2, "0")
    .slice(-2);

  if (!/^\d{2}$/.test(digits)) {
    return null;
  }

  const dezenaRaw = Number(digits);

  if (!Number.isFinite(dezenaRaw)) {
    return null;
  }

  const dezena = dezenaRaw === 0
    ? 100
    : dezenaRaw;

  const group = Math.ceil(dezena / 4);

  return group >= 1 && group <= GROUPS_K
    ? group
    : null;
}

function pickPrizePosition(prize) {
  const candidates = [
    prize?.position,
    prize?.posicao,
    prize?.pos,
    prize?.colocacao,
  ];

  for (const value of candidates) {
    const position = Number(value);

    if (Number.isFinite(position)) {
      return position;
    }
  }

  return null;
}

function pickPrizeGroup(prize) {
  const directCandidates = [
    prize?.grupo,
    prize?.group,
    prize?.grupo2,
    prize?.group2,
    prize?.animal_grupo,
    prize?.grupo_animal,
    prize?.grupoAnimal,
    prize?.g,
  ];

  for (const value of directCandidates) {
    const group = Number(value);

    if (
      Number.isFinite(group) &&
      group >= 1 &&
      group <= GROUPS_K
    ) {
      return group;
    }
  }

  const numberCandidates = [
    prize?.milhar,
    prize?.milhar4,
    prize?.numero,
    prize?.number,
    prize?.value,
    prize?.resultado,
    prize?.result,
    prize?.premio,
  ];

  for (const value of numberCandidates) {
    const digits = String(value ?? "")
      .replace(/\D+/g, "");

    if (!digits) {
      continue;
    }

    const group = groupFromDezena(
      digits.slice(-2)
    );

    if (group != null) {
      return group;
    }
  }

  return null;
}

function pickFirstPrizeGroup(draw) {
  const prizes = safeArray(draw?.prizes);

  const firstPrize =
    prizes.find(
      (prize) =>
        pickPrizePosition(prize) === 1
    ) || prizes[0] || null;

  if (firstPrize) {
    const group = pickPrizeGroup(firstPrize);

    if (group != null) {
      return group;
    }
  }

  const directCandidates = [
    draw?.grupo1,
    draw?.group1,
    draw?.primeiro_grupo,
    draw?.first_grupo,
    draw?.prize1_grupo,
    draw?.prize1Grupo,
    draw?.p1_grupo2,
    draw?.p1Grupo2,
    draw?.grupo_1,
    draw?.grupoPrimeiro,
    draw?.g1,
  ];

  for (const value of directCandidates) {
    const group = Number(value);

    if (
      Number.isFinite(group) &&
      group >= 1 &&
      group <= GROUPS_K
    ) {
      return group;
    }
  }

  return null;
}

function drawTimestamp(draw) {
  const ymd = pickDrawYmd(draw);
  const hour = pickDrawHour(draw);

  if (!ymd || !hour) {
    return Number.NaN;
  }

  return Date.parse(
    `${ymd}T${hour}:00Z`
  );
}

function sortDraws(draws) {
  return safeArray(draws)
    .filter(Boolean)
    .map((draw, index) => ({
      draw,
      index,
      timestamp: drawTimestamp(draw),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.timestamp)
    )
    .sort(
      (a, b) =>
        a.timestamp - b.timestamp ||
        a.index - b.index
    )
    .map((item) => item.draw);
}

function createGroupMap() {
  const map = new Map();

  for (
    let group = 1;
    group <= GROUPS_K;
    group += 1
  ) {
    map.set(group, 0);
  }

  return map;
}

function increment(map, group) {
  const value = Number(group);

  if (
    !Number.isFinite(value) ||
    value < 1 ||
    value > GROUPS_K
  ) {
    return;
  }

  map.set(
    value,
    Number(map.get(value) || 0) + 1
  );
}

function probabilityMap(
  frequency,
  samples,
  alpha = LAPLACE_ALPHA
) {
  const probabilities = new Map();

  const safeSamples = Math.max(
    0,
    Number(samples || 0)
  );

  const safeAlpha = Math.max(
    0,
    Number(alpha || 0)
  );

  const denominator =
    safeSamples +
    (safeAlpha * GROUPS_K);

  for (
    let group = 1;
    group <= GROUPS_K;
    group += 1
  ) {
    const count = Number(
      frequency.get(group) || 0
    );

    probabilities.set(
      group,
      denominator > 0
        ? (count + safeAlpha) / denominator
        : 1 / GROUPS_K
    );
  }

  return probabilities;
}

function mapToObject(map) {
  return Object.fromEntries(
    Array.from(map.entries()).map(
      ([group, value]) => [
        String(group).padStart(2, "0"),
        value,
      ]
    )
  );
}

function collectTransitionEvidence(input = {}) {
  const draws = sortDraws(
    input.drawsRange
  );

  const drawLast =
    input.drawLast || draws[draws.length - 1];

  const previousGroup =
    pickFirstPrizeGroup(drawLast);

  const previousHour =
    pickDrawHour(drawLast);

  const targetHour =
    normalizeHour(
      input.targetHourOverride
    );

  const globalFrequency =
    createGroupMap();

  const sameHourFrequency =
    createGroupMap();

  const transitionFrequency =
    createGroupMap();

  let globalSamples = 0;
  let sameHourSamples = 0;
  let transitionSamples = 0;

  for (const draw of draws) {
    const group =
      pickFirstPrizeGroup(draw);

    const hour =
      pickDrawHour(draw);

    if (group == null) {
      continue;
    }

    globalSamples += 1;
    increment(
      globalFrequency,
      group
    );

    if (
      targetHour &&
      hour === targetHour
    ) {
      sameHourSamples += 1;
      increment(
        sameHourFrequency,
        group
      );
    }
  }

  for (
    let index = 0;
    index < draws.length - 1;
    index += 1
  ) {
    const previousDraw =
      draws[index];

    const nextDraw =
      draws[index + 1];

    const historicalPreviousGroup =
      pickFirstPrizeGroup(
        previousDraw
      );

    const historicalPreviousHour =
      pickDrawHour(
        previousDraw
      );

    const historicalNextGroup =
      pickFirstPrizeGroup(
        nextDraw
      );

    const historicalNextHour =
      pickDrawHour(
        nextDraw
      );

    if (
      historicalPreviousGroup == null ||
      historicalNextGroup == null ||
      !historicalPreviousHour ||
      !historicalNextHour
    ) {
      continue;
    }

    if (
      Number(historicalPreviousGroup) !==
      Number(previousGroup)
    ) {
      continue;
    }

    if (
      historicalPreviousHour !==
      previousHour
    ) {
      continue;
    }

    if (
      targetHour &&
      historicalNextHour !==
      targetHour
    ) {
      continue;
    }

    transitionSamples += 1;

    increment(
      transitionFrequency,
      historicalNextGroup
    );
  }

  const globalProbability =
    probabilityMap(
      globalFrequency,
      globalSamples
    );

  const sameHourProbability =
    probabilityMap(
      sameHourFrequency,
      sameHourSamples
    );

  const transitionProbability =
    probabilityMap(
      transitionFrequency,
      transitionSamples
    );

  const source =
    transitionSamples > 0
      ? "TRANSITION"
      : sameHourSamples > 0
        ? "SAME_HOUR_FALLBACK"
        : "GLOBAL_FALLBACK";

  const selectedProbability =
    source === "TRANSITION"
      ? transitionProbability
      : source === "SAME_HOUR_FALLBACK"
        ? sameHourProbability
        : globalProbability;

  const selectedFrequency =
    source === "TRANSITION"
      ? transitionFrequency
      : source === "SAME_HOUR_FALLBACK"
        ? sameHourFrequency
        : globalFrequency;

  const selectedSamples =
    source === "TRANSITION"
      ? transitionSamples
      : source === "SAME_HOUR_FALLBACK"
        ? sameHourSamples
        : globalSamples;

  const ranking = Array.from(
    {
      length: GROUPS_K,
    },
    (_, index) => {
      const group = index + 1;

      return {
        grupo: group,
        scoreProb: Number(
          selectedProbability.get(group) || 0
        ),
        score:
          Number(
            selectedProbability.get(group) || 0
          ) * 1000,
        frequency: Number(
          selectedFrequency.get(group) || 0
        ),
        transitionProbability: Number(
          transitionProbability.get(group) || 0
        ),
        sameHourProbability: Number(
          sameHourProbability.get(group) || 0
        ),
        globalProbability: Number(
          globalProbability.get(group) || 0
        ),
      };
    }
  ).sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    if (b.frequency !== a.frequency) {
      return b.frequency - a.frequency;
    }

    return a.grupo - b.grupo;
  });

  return {
    enabled: true,
    experiment: "E07",
    version: 1,
    source,
    previous: {
      ymd: pickDrawYmd(drawLast),
      hour: previousHour,
      group: previousGroup,
    },
    target: {
      ymd: normalizeYmd(
        input.targetYmdOverride
      ),
      hour: targetHour,
    },
    samples: {
      global: globalSamples,
      sameHour: sameHourSamples,
      transition: transitionSamples,
      selected: selectedSamples,
    },
    frequencies: {
      global:
        mapToObject(globalFrequency),
      sameHour:
        mapToObject(sameHourFrequency),
      transition:
        mapToObject(transitionFrequency),
    },
    probabilities: {
      global:
        mapToObject(globalProbability),
      sameHour:
        mapToObject(sameHourProbability),
      transition:
        mapToObject(transitionProbability),
    },
    ranking,
  };
}

function buildExperimentalTop(
  evidence,
  topN = 3
) {
  return safeArray(
    evidence?.ranking
  )
    .slice(
      0,
      Math.max(
        1,
        Number(topN || 3)
      )
    )
    .map(
      (item, index) => ({
        rank: index + 1,
        title:
          index === 0
            ? "Mais provavel"
            : index === 1
              ? "2o mais provavel"
              : "3o mais provavel",
        grupo: item.grupo,
        scoreProb:
          item.scoreProb,
        rawScoreProb:
          item.scoreProb,
        score:
          item.score,
        probability:
          item.scoreProb,
        probCond:
          item.transitionProbability,
        probBase:
          item.sameHourProbability,
        freq:
          item.frequency,
        freqCond:
          item.frequency,
        freqBase: 0,
        lateBonus: 0,
        reasons: [
          "Motor experimental E07",
          `Fonte: ${evidence.source}`,
          `Transicoes: ${evidence.samples.transition}`,
          `Mesmo horario: ${evidence.samples.sameHour}`,
          `Historico global: ${evidence.samples.global}`,
          `Grupo anterior: ${String(
            evidence.previous.group
          ).padStart(2, "0")}`,
          `Hora anterior: ${evidence.previous.hour}`,
          `Hora alvo: ${evidence.target.hour}`,
        ],
        meta: {
          experiment: "E07",
          source:
            evidence.source,
          samples:
            evidence.samples,
          previous:
            evidence.previous,
          target:
            evidence.target,
        },
      })
    );
}

function computeStatisticalTop3V4Experimental(
  input = {}
) {
  const baseline =
    computeStatisticalTop3V3(
      input
    );

  const evidence =
    collectTransitionEvidence(
      input
    );

  const experimentalTop =
    buildExperimentalTop(
      evidence,
      input.topN || 3
    );

  return {
    ...baseline,
    top:
      experimentalTop.length
        ? experimentalTop
        : safeArray(baseline?.top),
    ranking:
      experimentalTop.length
        ? experimentalTop
        : safeArray(
            baseline?.ranking
          ),
    baselineTop:
      safeArray(baseline?.top),
    experimental: {
      enabled: true,
      version: 4,
      experiment: "E07",
      noProductionInfluence: true,
      evidence,
    },
    meta: {
      ...(baseline?.meta || {}),
      scenario:
        "V4_EXPERIMENTAL_E07",
      experimental: {
        experiment: "E07",
        source:
          evidence.source,
        samples:
          evidence.samples,
      },
    },
  };
}

module.exports = {
  collectTransitionEvidence,
  computeStatisticalTop3V4Experimental,
};
