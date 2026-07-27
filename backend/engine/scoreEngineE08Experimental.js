"use strict";

const {
  computeStatisticalTop3V3,
} = require("./scoreEngineUnified");

const GROUPS_K = 25;
const LAPLACE_ALPHA = 1;

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function normalizeHour(value) {
  const raw = String(
    value ?? ""
  ).trim();

  if (!raw) {
    return "";
  }

  const match = raw.match(
    /^(\d{1,2})(?::?(\d{2}))?/
  );

  if (!match) {
    return "";
  }

  const hour = Number(match[1]);
  const minute = Number(
    match[2] || 0
  );

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

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
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
  const digits = String(
    value ?? ""
  )
    .replace(/\D+/g, "")
    .padStart(2, "0")
    .slice(-2);

  if (!/^\d{2}$/.test(digits)) {
    return null;
  }

  const rawDezena = Number(digits);

  if (!Number.isFinite(rawDezena)) {
    return null;
  }

  const dezena =
    rawDezena === 0
      ? 100
      : rawDezena;

  const group = Math.ceil(
    dezena / 4
  );

  return (
    group >= 1 &&
    group <= GROUPS_K
  )
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

  for (
    const value
    of directCandidates
  ) {
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

  for (
    const value
    of numberCandidates
  ) {
    const digits = String(
      value ?? ""
    ).replace(/\D+/g, "");

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
  const prizes = safeArray(
    draw?.prizes
  );

  const firstPrize =
    prizes.find(
      (prize) =>
        pickPrizePosition(prize) === 1
    ) ||
    prizes[0] ||
    null;

  if (firstPrize) {
    const group =
      pickPrizeGroup(firstPrize);

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

  for (
    const value
    of directCandidates
  ) {
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

function extractCandidateGroup(item) {
  const group = Number(
    item?.grupo ??
    item?.group
  );

  return (
    Number.isFinite(group) &&
    group >= 1 &&
    group <= GROUPS_K
  )
    ? group
    : null;
}

function collectSameHourFrequency(
  drawsRange,
  targetHour
) {
  const counts = new Map();

  for (
    let group = 1;
    group <= GROUPS_K;
    group += 1
  ) {
    counts.set(group, 0);
  }

  let samples = 0;

  for (
    const draw
    of safeArray(drawsRange)
  ) {
    const hour =
      pickDrawHour(draw);

    if (
      !targetHour ||
      hour !== targetHour
    ) {
      continue;
    }

    const group =
      pickFirstPrizeGroup(draw);

    if (group == null) {
      continue;
    }

    samples += 1;

    counts.set(
      group,
      Number(
        counts.get(group) || 0
      ) + 1
    );
  }

  return {
    counts,
    samples,
  };
}

function computeProbability(
  count,
  samples
) {
  const denominator =
    Number(samples || 0) +
    (
      LAPLACE_ALPHA *
      GROUPS_K
    );

  return denominator > 0
    ? (
        Number(count || 0) +
        LAPLACE_ALPHA
      ) / denominator
    : 1 / GROUPS_K;
}

function sameGroupSet(
  first,
  second
) {
  const a = safeArray(first)
    .map(extractCandidateGroup)
    .filter(Number.isFinite)
    .sort(
      (x, y) => x - y
    );

  const b = safeArray(second)
    .map(extractCandidateGroup)
    .filter(Number.isFinite)
    .sort(
      (x, y) => x - y
    );

  return (
    a.length === b.length &&
    a.every(
      (value, index) =>
        value === b[index]
    )
  );
}

function computeStatisticalTop3E08Experimental(
  input = {}
) {
  const baseline =
    computeStatisticalTop3V3(
      input
    );

  const baselineTop =
    safeArray(baseline?.top)
      .slice(0, 3);

  if (baselineTop.length < 3) {
    return {
      ...baseline,
      experimental: {
        enabled: true,
        experiment: "E08",
        applied: false,
        reason:
          "BASELINE_WITH_LESS_THAN_3",
      },
    };
  }

  const targetHour =
    normalizeHour(
      input.targetHourOverride
    );

  const frequency =
    collectSameHourFrequency(
      input.drawsRange,
      targetHour
    );

  const rerankedTop =
    baselineTop
      .map(
        (item, index) => {
          const group =
            extractCandidateGroup(
              item
            );

          const count = Number(
            frequency.counts.get(
              group
            ) || 0
          );

          const sameHourProbability =
            computeProbability(
              count,
              frequency.samples
            );

          return {
            ...item,
            __baselineRank:
              index + 1,
            __sameHourCount:
              count,
            __sameHourProbability:
              sameHourProbability,
          };
        }
      )
      .sort((a, b) => {
        if (
          b.__sameHourProbability !==
          a.__sameHourProbability
        ) {
          return (
            b.__sameHourProbability -
            a.__sameHourProbability
          );
        }

        return (
          a.__baselineRank -
          b.__baselineRank
        );
      })
      .map(
        (item, index) => {
          const {
            __baselineRank,
            __sameHourCount,
            __sameHourProbability,
            ...original
          } = item;

          return {
            ...original,
            rank: index + 1,
            title:
              index === 0
                ? "Mais provável"
                : index === 1
                  ? "2º mais provável"
                  : "3º mais provável",
            meta: {
              ...(original?.meta || {}),
              experiment: "E08",
              baselineRank:
                __baselineRank,
              sameHourCount:
                __sameHourCount,
              sameHourProbability:
                __sameHourProbability,
              sameHourSamples:
                frequency.samples,
              targetHour,
            },
          };
        }
      );

  if (
    !sameGroupSet(
      baselineTop,
      rerankedTop
    )
  ) {
    throw new Error(
      "E08 alterou o conjunto de candidatos da V3."
    );
  }

  return {
    ...baseline,
    top: rerankedTop,
    ranking: rerankedTop,
    baselineTop,
    experimental: {
      enabled: true,
      experiment: "E08",
      version: 1,
      applied: true,
      strategy:
        "RERANK_V3_TOP3_BY_SAME_HOUR_FREQUENCY",
      preservesCandidateSet: true,
      targetHour,
      samples:
        frequency.samples,
      baselineGroups:
        baselineTop.map(
          extractCandidateGroup
        ),
      rerankedGroups:
        rerankedTop.map(
          extractCandidateGroup
        ),
    },
    meta: {
      ...(baseline?.meta || {}),
      scenario:
        "E08_V3_TOP3_RERANK",
      experimental: {
        experiment: "E08",
        preservesCandidateSet:
          true,
        targetHour,
        samples:
          frequency.samples,
      },
    },
  };
}

module.exports = {
  collectSameHourFrequency,
  computeStatisticalTop3E08Experimental,
};
