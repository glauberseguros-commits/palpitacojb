"use strict";

const fs = require("fs");

const {
  runOfficialBacktest,
} = require("../backend/scripts/backtestTop3Official");

const {
  computeStatisticalTop3V4Experimental,
} = require("../backend/engine/scoreEngineV4Experimental");

const CASE_LIMIT = 1000;
const MIN_HISTORY = 100;
const GROUP_COUNT = 25;
const RANDOM_TOP3_RATE = 12;

const TARGET_HOURS = [
  "11:00",
  "14:00",
  "16:00",
  "18:00",
  "21:00",
];

const STRATEGIES = [
  "RECENT",
  "OVERDUE",
];

const captures = [];

function normalizeGroup(value) {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < 1 ||
    number > GROUP_COUNT
  ) {
    return null;
  }

  return String(number).padStart(2, "0");
}

function normalizeHour(value) {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();

  const match = text.match(
    /^(\d{1,2})(?::(\d{2}))?/
  );

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23
  ) {
    return null;
  }

  return (
    String(hour).padStart(2, "0") +
    ":00"
  );
}

function normalizeYmd(value) {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();

  let match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  if (match) {
    return (
      match[1] +
      "-" +
      match[2] +
      "-" +
      match[3]
    );
  }

  match = text.match(
    /^(\d{2})\/(\d{2})\/(\d{4})/
  );

  if (match) {
    return (
      match[3] +
      "-" +
      match[2] +
      "-" +
      match[1]
    );
  }

  return null;
}

function createGroupMap(initialValue) {
  const map = {};

  for (
    let group = 1;
    group <= GROUP_COUNT;
    group++
  ) {
    const key =
      String(group).padStart(2, "0");

    map[key] =
      typeof initialValue === "function"
        ? initialValue()
        : initialValue;
  }

  return map;
}

function findFirstPrize(draw) {
  const prizes = Array.isArray(draw?.prizes)
    ? draw.prizes
    : [];

  const explicit = prizes.find(
    (prize) =>
      Number(
        prize?.position ??
        prize?.posicao ??
        prize?.prize ??
        prize?.rank
      ) === 1
  );

  return explicit ?? prizes[0] ?? null;
}

function getDrawHour(draw) {
  return normalizeHour(
    draw?.closeHour ??
    draw?.hour ??
    draw?.targetHour ??
    draw?.drawHour ??
    draw?.horario
  );
}

function getDrawYmd(draw) {
  return normalizeYmd(
    draw?.ymd ??
    draw?.date ??
    draw?.drawDate ??
    draw?.targetDate ??
    draw?.data
  );
}

function getDrawGroup(draw) {
  const firstPrize =
    findFirstPrize(draw);

  return normalizeGroup(
    firstPrize?.grupo ??
    firstPrize?.group ??
    firstPrize?.animalGroup
  );
}

function drawTimestamp(
  draw,
  fallbackIndex
) {
  const ymd = getDrawYmd(draw);
  const hour = getDrawHour(draw);

  if (ymd && hour) {
    const timestamp = Date.parse(
      ymd + "T" + hour + ":00Z"
    );

    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return fallbackIndex;
}

function normalizeHistoricalDraws(draws) {
  return (
    Array.isArray(draws)
      ? draws
      : []
  )
    .map((draw, index) => ({
      index,

      timestamp:
        drawTimestamp(
          draw,
          index
        ),

      hour:
        getDrawHour(draw),

      group:
        getDrawGroup(draw),
    }))
    .filter(
      (item) =>
        item.hour &&
        item.group
    )
    .sort(
      (a, b) =>
        a.timestamp -
          b.timestamp ||
        a.index -
          b.index
    );
}

function calculateSameHourGaps(
  draws,
  targetHour
) {
  const normalized =
    normalizeHistoricalDraws(
      draws
    );

  const sameHour =
    normalized.filter(
      (item) =>
        item.hour ===
        targetHour
    );

  const lastOccurrence =
    createGroupMap(null);

  for (
    let index = 0;
    index < sameHour.length;
    index++
  ) {
    lastOccurrence[
      sameHour[index].group
    ] = index;
  }

  const gaps =
    createGroupMap(null);

  for (
    let group = 1;
    group <= GROUP_COUNT;
    group++
  ) {
    const key =
      String(group).padStart(2, "0");

    const lastIndex =
      lastOccurrence[key];

    gaps[key] =
      lastIndex == null
        ? sameHour.length
        : sameHour.length -
          lastIndex -
          1;
  }

  return {
    targetHour,

    gaps,

    usableDraws:
      sameHour.length,

    unseenGroups:
      Object.values(
        lastOccurrence
      ).filter(
        (value) =>
          value == null
      ).length,
  };
}

function evaluateRanking(
  valuesByGroup,
  actualGroup,
  direction
) {
  const entries =
    Object.entries(
      valuesByGroup || {}
    );

  if (
    entries.length !==
    GROUP_COUNT
  ) {
    return null;
  }

  const actualValue =
    Number(
      valuesByGroup[
        actualGroup
      ]
    );

  if (
    !Number.isFinite(
      actualValue
    )
  ) {
    return null;
  }

  const values =
    entries
      .map(
        ([, value]) =>
          Number(value)
      )
      .filter(
        Number.isFinite
      );

  if (
    values.length !==
    GROUP_COUNT
  ) {
    return null;
  }

  const better =
    values.filter(
      (value) =>
        direction === "ASC"
          ? value < actualValue
          : value > actualValue
    ).length;

  const equal =
    values.filter(
      (value) =>
        value === actualValue
    ).length;

  if (equal <= 0) {
    return null;
  }

  const minRank =
    better + 1;

  const maxRank =
    better + equal;

  const averageRank =
    (
      minRank +
      maxRank
    ) / 2;

  function fractionalTopK(k) {
    if (maxRank <= k) {
      return 1;
    }

    if (minRank > k) {
      return 0;
    }

    return (
      k -
      minRank +
      1
    ) / equal;
  }

  return {
    actualGap:
      actualValue,

    better,
    equal,
    minRank,
    maxRank,
    averageRank,

    top3Credit:
      fractionalTopK(3),

    top5Credit:
      fractionalTopK(5),

    top10Credit:
      fractionalTopK(10),
  };
}

function createAccumulator() {
  return {
    evaluated: 0,
    missing: 0,

    usableHistorySum: 0,
    usableHistoryMin: null,
    usableHistoryMax: null,

    unseenGroupsSum: 0,

    actualGapSum: 0,
    rankSum: 0,

    top3Credits: [],
    top5Credits: [],
    top10Credits: [],
  };
}

function addEvaluation(
  accumulator,
  evaluation,
  usableHistory,
  unseenGroups
) {
  if (!evaluation) {
    accumulator.missing++;
    return;
  }

  const historyCount =
    Number(usableHistory) || 0;

  const unseenCount =
    Number(unseenGroups) || 0;

  accumulator.evaluated++;

  accumulator.usableHistorySum +=
    historyCount;

  accumulator.unseenGroupsSum +=
    unseenCount;

  accumulator.actualGapSum +=
    Number(
      evaluation.actualGap
    );

  accumulator.rankSum +=
    Number(
      evaluation.averageRank
    );

  accumulator.usableHistoryMin =
    accumulator.usableHistoryMin == null
      ? historyCount
      : Math.min(
          accumulator.usableHistoryMin,
          historyCount
        );

  accumulator.usableHistoryMax =
    accumulator.usableHistoryMax == null
      ? historyCount
      : Math.max(
          accumulator.usableHistoryMax,
          historyCount
        );

  accumulator.top3Credits.push(
    Number(
      evaluation.top3Credit
    )
  );

  accumulator.top5Credits.push(
    Number(
      evaluation.top5Credit
    )
  );

  accumulator.top10Credits.push(
    Number(
      evaluation.top10Credit
    )
  );
}

function mean(values) {
  if (!values.length) {
    return null;
  }

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / values.length
  );
}

function sampleVariance(values) {
  if (values.length < 2) {
    return null;
  }

  const average =
    mean(values);

  return (
    values.reduce(
      (sum, value) =>
        sum +
        Math.pow(
          value - average,
          2
        ),
      0
    ) /
    (
      values.length - 1
    )
  );
}

function confidenceInterval95(
  values
) {
  const count =
    values.length;

  if (count === 0) {
    return {
      lower: null,
      upper: null,
      standardError: null,
      margin: null,
    };
  }

  const average =
    mean(values);

  const variance =
    sampleVariance(values);

  if (
    variance == null ||
    !Number.isFinite(variance)
  ) {
    const rate =
      average * 100;

    return {
      lower:
        Number(
          rate.toFixed(4)
        ),

      upper:
        Number(
          rate.toFixed(4)
        ),

      standardError: 0,
      margin: 0,
    };
  }

  const standardError =
    Math.sqrt(
      variance / count
    );

  const margin =
    1.96 *
    standardError;

  const lower =
    Math.max(
      0,
      average - margin
    );

  const upper =
    Math.min(
      1,
      average + margin
    );

  return {
    lower:
      Number(
        (
          lower * 100
        ).toFixed(4)
      ),

    upper:
      Number(
        (
          upper * 100
        ).toFixed(4)
      ),

    standardError:
      Number(
        (
          standardError * 100
        ).toFixed(4)
      ),

    margin:
      Number(
        (
          margin * 100
        ).toFixed(4)
      ),
  };
}

function summarizeCredits(
  values
) {
  const total =
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  return {
    equivalentHits:
      Number(
        total.toFixed(4)
      ),

    rate:
      values.length > 0
        ? Number(
            (
              100 *
              total /
              values.length
            ).toFixed(4)
          )
        : 0,

    confidence95:
      confidenceInterval95(
        values
      ),
  };
}

function finalizeAccumulator(
  accumulator
) {
  const evaluated =
    accumulator.evaluated;

  const top3 =
    summarizeCredits(
      accumulator.top3Credits
    );

  const top5 =
    summarizeCredits(
      accumulator.top5Credits
    );

  const top10 =
    summarizeCredits(
      accumulator.top10Credits
    );

  return {
    evaluated,

    missing:
      accumulator.missing,

    averageUsableHistory:
      evaluated > 0
        ? Number(
            (
              accumulator
                .usableHistorySum /
              evaluated
            ).toFixed(2)
          )
        : null,

    minimumUsableHistory:
      accumulator
        .usableHistoryMin,

    maximumUsableHistory:
      accumulator
        .usableHistoryMax,

    averageUnseenGroups:
      evaluated > 0
        ? Number(
            (
              accumulator
                .unseenGroupsSum /
              evaluated
            ).toFixed(4)
          )
        : null,

    averageActualGap:
      evaluated > 0
        ? Number(
            (
              accumulator
                .actualGapSum /
              evaluated
            ).toFixed(4)
          )
        : null,

    averageRanking:
      evaluated > 0
        ? Number(
            (
              accumulator.rankSum /
              evaluated
            ).toFixed(4)
          )
        : null,

    top3EquivalentHits:
      top3.equivalentHits,

    top3Rate:
      top3.rate,

    top3Confidence95:
      top3.confidence95,

    top5EquivalentHits:
      top5.equivalentHits,

    top5Rate:
      top5.rate,

    top5Confidence95:
      top5.confidence95,

    top10EquivalentHits:
      top10.equivalentHits,

    top10Rate:
      top10.rate,

    top10Confidence95:
      top10.confidence95,

    top3DifferenceVersusRandom:
      Number(
        (
          top3.rate -
          RANDOM_TOP3_RATE
        ).toFixed(4)
      ),

    top3ConfidenceEntirelyAboveRandom:
      top3.confidence95.lower != null
        ? top3.confidence95.lower >
          RANDOM_TOP3_RATE
        : false,

    top3ConfidenceIncludesRandom:
      top3.confidence95.lower != null &&
      top3.confidence95.upper != null
        ? (
            top3.confidence95.lower <=
              RANDOM_TOP3_RATE &&
            top3.confidence95.upper >=
              RANDOM_TOP3_RATE
          )
        : false,
  };
}

function createStrategyMap() {
  return Object.fromEntries(
    STRATEGIES.map(
      (strategy) => [
        strategy,
        createAccumulator(),
      ]
    )
  );
}

function finalizeStrategyMap(
  map
) {
  return Object.fromEntries(
    Object.entries(map)
      .map(
        ([strategy, accumulator]) => [
          strategy,
          finalizeAccumulator(
            accumulator
          ),
        ]
      )
  );
}

function getTargetHour(
  currentCase
) {
  return normalizeHour(
    currentCase?.target?.hour ??
    currentCase?.target?.closeHour ??
    currentCase?.targetHour ??
    currentCase?.closeHour
  );
}

function getTargetYmd(
  currentCase
) {
  return normalizeYmd(
    currentCase?.target?.ymd ??
    currentCase?.target?.date ??
    currentCase?.targetDate ??
    currentCase?.ymd
  );
}

function getActualGroup(
  currentCase
) {
  return normalizeGroup(
    currentCase?.actual?.grupo ??
    currentCase?.actual?.group ??
    currentCase?.actual?.animalGroup ??
    currentCase?.actualGroup
  );
}

function difference(
  candidate,
  baseline
) {
  return {
    averageRankingDifference:
      candidate.averageRanking != null &&
      baseline.averageRanking != null
        ? Number(
            (
              candidate
                .averageRanking -
              baseline
                .averageRanking
            ).toFixed(4)
          )
        : null,

    top3RateDifference:
      Number(
        (
          candidate.top3Rate -
          baseline.top3Rate
        ).toFixed(4)
      ),

    top5RateDifference:
      Number(
        (
          candidate.top5Rate -
          baseline.top5Rate
        ).toFixed(4)
      ),

    top10RateDifference:
      Number(
        (
          candidate.top10Rate -
          baseline.top10Rate
        ).toFixed(4)
      ),
  };
}

function getStrategyDirection(
  strategy
) {
  if (strategy === "RECENT") {
    return "ASC";
  }

  if (strategy === "OVERDUE") {
    return "DESC";
  }

  return null;
}

function chooseBestStrategy(
  summaries
) {
  const entries =
    Object.entries(
      summaries
    )
      .map(
        ([strategy, summary]) => ({
          strategy,
          ...summary,
        })
      )
      .sort(
        (a, b) =>
          b.top3Rate -
            a.top3Rate ||
          a.averageRanking -
            b.averageRanking
      );

  return entries[0] ?? null;
}

function classifyHour({
  overallBest,
  firstHalfBest,
  secondHalfBest,
  firstHalfSummary,
  secondHalfSummary,
}) {
  if (
    !overallBest ||
    !firstHalfBest ||
    !secondHalfBest
  ) {
    return {
      status:
        "INSUFFICIENT_DATA",

      approved:
        false,

      reasons: [
        "Missing summary data.",
      ],
    };
  }

  const sameWinner =
    overallBest.strategy ===
      firstHalfBest.strategy &&
    overallBest.strategy ===
      secondHalfBest.strategy;

  const firstRate =
    firstHalfSummary[
      overallBest.strategy
    ]?.top3Rate ?? 0;

  const secondRate =
    secondHalfSummary[
      overallBest.strategy
    ]?.top3Rate ?? 0;

  const bothAboveRandom =
    firstRate >
      RANDOM_TOP3_RATE &&
    secondRate >
      RANDOM_TOP3_RATE;

  const overallAboveRandom =
    overallBest.top3Rate >
    RANDOM_TOP3_RATE;

  const confidenceAboveRandom =
    overallBest
      .top3ConfidenceEntirelyAboveRandom ===
    true;

  const temporalDifference =
    Math.abs(
      secondRate -
      firstRate
    );

  const reasonablyStable =
    temporalDifference <= 5;

  const enoughCases =
    overallBest.evaluated >= 100;

  const reasons = [];

  if (!sameWinner) {
    reasons.push(
      "The winning direction changes between temporal halves."
    );
  }

  if (!bothAboveRandom) {
    reasons.push(
      "The selected strategy does not exceed 12% in both temporal halves."
    );
  }

  if (!overallAboveRandom) {
    reasons.push(
      "The overall Top3 rate does not exceed the 12% random reference."
    );
  }

  if (!confidenceAboveRandom) {
    reasons.push(
      "The approximate 95% confidence interval is not entirely above 12%."
    );
  }

  if (!reasonablyStable) {
    reasons.push(
      "The difference between temporal halves exceeds 5 percentage points."
    );
  }

  if (!enoughCases) {
    reasons.push(
      "The hour has fewer than 100 evaluated cases."
    );
  }

  const approved =
    sameWinner &&
    bothAboveRandom &&
    overallAboveRandom &&
    confidenceAboveRandom &&
    reasonablyStable &&
    enoughCases;

  if (approved) {
    return {
      status:
        "APPROVED_CANDIDATE",

      approved: true,

      reasons: [
        "Same direction wins overall and in both temporal halves.",
        "Top3 exceeds 12% in both temporal halves.",
        "Approximate 95% confidence interval is entirely above 12%.",
        "Sample size and temporal stability passed the conservative criteria.",
      ],
    };
  }

  if (
    overallAboveRandom &&
    sameWinner &&
    reasonablyStable
  ) {
    return {
      status:
        "PROMISING_NOT_APPROVED",

      approved: false,

      reasons,
    };
  }

  return {
    status:
      "REJECTED_OR_UNSTABLE",

    approved: false,

    reasons,
  };
}

async function main() {
  const result =
    await runOfficialBacktest(
      {
        lotteryKey:
          "PT_RIO",

        limit:
          CASE_LIMIT,

        minHistory:
          MIN_HISTORY,

        telemetry:
          true,
      },
      {
        computeTop3(input) {
          const output =
            computeStatisticalTop3V4Experimental(
              input
            );

          const targetHour =
            normalizeHour(
              input?.targetHourOverride ??
              input?.targetHour ??
              input?.hour
            );

          captures.push(
            calculateSameHourGaps(
              input?.drawsRange,
              targetHour
            )
          );

          return output;
        },
      }
    );

  const cases =
    Array.isArray(
      result?.telemetry?.cases
    )
      ? result.telemetry.cases
      : [];

  const pairCount =
    Math.min(
      cases.length,
      captures.length
    );

  const diagnostics = {
    missingActualGroup: 0,
    missingTargetHour: 0,
    missingCapture: 0,
    targetHourCaptureMismatch: 0,
    excludedTargetHour: 0,
    emptySameHourHistory: 0,
  };

  const casesByHour = {};

  for (
    const hour of TARGET_HOURS
  ) {
    casesByHour[hour] = [];
  }

  for (
    let index = 0;
    index < pairCount;
    index++
  ) {
    const currentCase =
      cases[index];

    const capture =
      captures[index];

    if (!capture) {
      diagnostics
        .missingCapture++;
      continue;
    }

    const actualGroup =
      getActualGroup(
        currentCase
      );

    const targetHour =
      getTargetHour(
        currentCase
      ) ??
      capture.targetHour;

    if (!actualGroup) {
      diagnostics
        .missingActualGroup++;
      continue;
    }

    if (!targetHour) {
      diagnostics
        .missingTargetHour++;
      continue;
    }

    if (
      capture.targetHour &&
      targetHour !==
        capture.targetHour
    ) {
      diagnostics
        .targetHourCaptureMismatch++;
    }

    if (
      !TARGET_HOURS.includes(
        targetHour
      )
    ) {
      diagnostics
        .excludedTargetHour++;
      continue;
    }

    if (
      !capture.usableDraws
    ) {
      diagnostics
        .emptySameHourHistory++;
    }

    casesByHour[
      targetHour
    ].push({
      originalIndex:
        index,

      currentCase,

      capture,

      actualGroup,

      targetHour,

      targetYmd:
        getTargetYmd(
          currentCase
        ),
    });
  }

  const byHour = {};

  for (
    const hour of TARGET_HOURS
  ) {
    const hourCases =
      casesByHour[hour];

    const splitIndex =
      Math.floor(
        hourCases.length / 2
      );

    const overall =
      createStrategyMap();

    const firstHalf =
      createStrategyMap();

    const secondHalf =
      createStrategyMap();

    const details = [];

    for (
      let index = 0;
      index < hourCases.length;
      index++
    ) {
      const item =
        hourCases[index];

      const temporalBlock =
        index < splitIndex
          ? "FIRST_HALF"
          : "SECOND_HALF";

      const strategyDetails = {};

      for (
        const strategy of
        STRATEGIES
      ) {
        const direction =
          getStrategyDirection(
            strategy
          );

        const evaluation =
          evaluateRanking(
            item.capture.gaps,
            item.actualGroup,
            direction
          );

        addEvaluation(
          overall[strategy],
          evaluation,
          item.capture
            .usableDraws,
          item.capture
            .unseenGroups
        );

        if (
          temporalBlock ===
          "FIRST_HALF"
        ) {
          addEvaluation(
            firstHalf[strategy],
            evaluation,
            item.capture
              .usableDraws,
            item.capture
              .unseenGroups
          );
        } else {
          addEvaluation(
            secondHalf[strategy],
            evaluation,
            item.capture
              .usableDraws,
            item.capture
              .unseenGroups
          );
        }

        strategyDetails[
          strategy
        ] = {
          direction,
          evaluation,
        };
      }

      details.push({
        caseNumber:
          item.currentCase
            ?.caseNumber ??
          item.originalIndex + 1,

        targetYmd:
          item.targetYmd,

        targetHour:
          item.targetHour,

        temporalBlock,

        actualGroup:
          item.actualGroup,

        usableHistory:
          item.capture
            .usableDraws,

        unseenGroups:
          item.capture
            .unseenGroups,

        strategies:
          strategyDetails,
      });
    }

    const overallSummary =
      finalizeStrategyMap(
        overall
      );

    const firstHalfSummary =
      finalizeStrategyMap(
        firstHalf
      );

    const secondHalfSummary =
      finalizeStrategyMap(
        secondHalf
      );

    const bestOverall =
      chooseBestStrategy(
        overallSummary
      );

    const bestFirstHalf =
      chooseBestStrategy(
        firstHalfSummary
      );

    const bestSecondHalf =
      chooseBestStrategy(
        secondHalfSummary
      );

    const comparison =
      difference(
        overallSummary.RECENT,
        overallSummary.OVERDUE
      );

    const temporalStability = {};

    for (
      const strategy of
      STRATEGIES
    ) {
      temporalStability[
        strategy
      ] = {
        firstHalf:
          firstHalfSummary[
            strategy
          ],

        secondHalf:
          secondHalfSummary[
            strategy
          ],

        secondHalfVersusFirstHalf:
          difference(
            secondHalfSummary[
              strategy
            ],
            firstHalfSummary[
              strategy
            ]
          ),
      };
    }

    const classification =
      classifyHour({
        overallBest:
          bestOverall,

        firstHalfBest:
          bestFirstHalf,

        secondHalfBest:
          bestSecondHalf,

        firstHalfSummary,

        secondHalfSummary,
      });

    byHour[hour] = {
      evaluatedCases:
        hourCases.length,

      split: {
        firstHalfCases:
          splitIndex,

        secondHalfCases:
          hourCases.length -
          splitIndex,
      },

      overall:
        overallSummary,

      firstHalf:
        firstHalfSummary,

      secondHalf:
        secondHalfSummary,

      bestOverall,

      bestFirstHalf,

      bestSecondHalf,

      recentVersusOverdue:
        comparison,

      temporalStability,

      classification,

      details,
    };
  }

  const summaryRanking =
    Object.entries(byHour)
      .map(
        ([hour, result]) => ({
          hour,

          evaluatedCases:
            result.evaluatedCases,

          bestStrategy:
            result.bestOverall
              ?.strategy ??
            null,

          top3Rate:
            result.bestOverall
              ?.top3Rate ??
            null,

          top3Confidence95:
            result.bestOverall
              ?.top3Confidence95 ??
            null,

          top3DifferenceVersusRandom:
            result.bestOverall
              ?.top3DifferenceVersusRandom ??
            null,

          firstHalfWinner:
            result.bestFirstHalf
              ?.strategy ??
            null,

          firstHalfTop3Rate:
            result.bestFirstHalf
              ?.top3Rate ??
            null,

          secondHalfWinner:
            result.bestSecondHalf
              ?.strategy ??
            null,

          secondHalfTop3Rate:
            result.bestSecondHalf
              ?.top3Rate ??
            null,

          classification:
            result.classification
              .status,

          approved:
            result.classification
              .approved,
        })
      )
      .sort(
        (a, b) =>
          (
            b.top3Rate ?? 0
          ) -
          (
            a.top3Rate ?? 0
          )
      );

  const approvedHours =
    summaryRanking.filter(
      (item) =>
        item.approved
    );

  const promisingHours =
    summaryRanking.filter(
      (item) =>
        item.classification ===
        "PROMISING_NOT_APPROVED"
    );

  const rejectedOrUnstableHours =
    summaryRanking.filter(
      (item) =>
        item.classification ===
        "REJECTED_OR_UNSTABLE"
    );

  const report = {
    ok: true,

    experimentCode:
      "E06",

    experiment:
      "hour-specific validation of same-hour group recency and overdue signals",

    methodology: {
      lotteryKey:
        "PT_RIO",

      casesRequested:
        CASE_LIMIT,

      casesReturned:
        cases.length,

      captures:
        captures.length,

      casesPaired:
        pairCount,

      minimumGlobalHistory:
        MIN_HISTORY,

      targetHours:
        TARGET_HOURS,

      groups:
        GROUP_COUNT,

      strategies:
        STRATEGIES,

      gapDefinition:
        "number of same-hour first-prize draws since the most recent occurrence; zero means the group appeared in the latest eligible draw",

      recentDirection:
        "smaller gap ranks higher",

      overdueDirection:
        "larger gap ranks higher",

      primaryObjective:
        "Top3",

      randomTop3Reference:
        RANDOM_TOP3_RATE,

      tieTreatment:
        "average rank and fractional credit at the Top-K cutoff",

      confidenceInterval:
        "approximate 95% normal interval calculated from the per-case fractional Top3 credits",

      temporalValidation:
        "chronological split performed independently inside each target hour",

      conservativeApprovalCriteria: {
        sameStrategyWinsOverallAndBothHalves:
          true,

        selectedStrategyAbove12PercentInBothHalves:
          true,

        overallConfidenceIntervalEntirelyAbove12Percent:
          true,

        maximumTemporalDifferencePercentagePoints:
          5,

        minimumCasesPerHour:
          100,
      },

      productionRankingChanged:
        false,

      officialWeightsChanged:
        false,

      deploymentPerformed:
        false,
    },

    diagnostics,

    randomReference: {
      averageRanking: 13,
      top3Rate:
        RANDOM_TOP3_RATE,
      top5Rate: 20,
      top10Rate: 40,
    },

    summaryRanking,

    approvedHours,

    promisingHours,

    rejectedOrUnstableHours,

    byHour,
  };

  fs.writeFileSync(
    "tmp/v4_group_recency_by_hour_validation_report.json",
    JSON.stringify(
      report,
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(
    "===== RESUMO DO EXPERIMENTO E06 ====="
  );

  console.log(
    JSON.stringify(
      {
        experimentCode:
          report.experimentCode,

        casesRequested:
          CASE_LIMIT,

        casesReturned:
          cases.length,

        captures:
          captures.length,

        casesPaired:
          pairCount,

        diagnostics,

        randomReference:
          report.randomReference,

        summaryRanking:
          report.summaryRanking,

        approvedHours:
          report.approvedHours,

        promisingHours:
          report.promisingHours,

        rejectedOrUnstableHours:
          report
            .rejectedOrUnstableHours,

        hourSummaries:
          Object.fromEntries(
            Object.entries(
              report.byHour
            ).map(
              ([hour, result]) => [
                hour,
                {
                  evaluatedCases:
                    result
                      .evaluatedCases,

                  split:
                    result.split,

                  overall:
                    result.overall,

                  firstHalf:
                    result.firstHalf,

                  secondHalf:
                    result.secondHalf,

                  bestOverall:
                    result.bestOverall,

                  bestFirstHalf:
                    result.bestFirstHalf,

                  bestSecondHalf:
                    result.bestSecondHalf,

                  recentVersusOverdue:
                    result
                      .recentVersusOverdue,

                  temporalStability:
                    result
                      .temporalStability,

                  classification:
                    result
                      .classification,
                },
              ]
            )
          ),
      },
      null,
      2
    )
  );

  console.log("");
  console.log(
    "Relatório completo salvo em:"
  );

  console.log(
    "tmp/v4_group_recency_by_hour_validation_report.json"
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "Falha no experimento E06:"
  );

  console.error(
    error?.stack || error
  );

  process.exit(1);
});
