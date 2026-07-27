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

const STRATEGIES = [
  "GLOBAL_RECENT",
  "GLOBAL_OVERDUE",
  "SAME_HOUR_RECENT",
  "SAME_HOUR_OVERDUE",
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
    map[
      String(group).padStart(2, "0")
    ] =
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
  const firstPrize = findFirstPrize(draw);

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
        item.group &&
        item.hour
    )
    .sort(
      (a, b) =>
        a.timestamp -
          b.timestamp ||
        a.index -
          b.index
    );
}

function calculateGaps(items) {
  const lastOccurrence =
    createGroupMap(null);

  for (
    let index = 0;
    index < items.length;
    index++
  ) {
    lastOccurrence[
      items[index].group
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
      String(group)
        .padStart(2, "0");

    const lastIndex =
      lastOccurrence[key];

    gaps[key] =
      lastIndex == null
        ? items.length
        : items.length -
          lastIndex -
          1;
  }

  return {
    gaps,
    usableDraws:
      items.length,

    unseenGroups:
      Object.values(
        lastOccurrence
      ).filter(
        (value) =>
          value == null
      ).length,
  };
}

function collectRecency(
  draws,
  targetHour
) {
  const normalized =
    normalizeHistoricalDraws(
      draws
    );

  const sameHour =
    targetHour
      ? normalized.filter(
          (item) =>
            item.hour ===
            targetHour
        )
      : [];

  return {
    targetHour,

    global:
      calculateGaps(
        normalized
      ),

    sameHour:
      calculateGaps(
        sameHour
      ),
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
        value ===
        actualValue
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
    actualGapMin: null,
    actualGapMax: null,

    rankSum: 0,

    top3Credit: 0,
    top5Credit: 0,
    top10Credit: 0,
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

  const actualGap =
    Number(
      evaluation.actualGap
    );

  accumulator.evaluated++;

  accumulator.usableHistorySum +=
    historyCount;

  accumulator.unseenGroupsSum +=
    unseenCount;

  accumulator.actualGapSum +=
    actualGap;

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

  accumulator.actualGapMin =
    accumulator.actualGapMin == null
      ? actualGap
      : Math.min(
          accumulator.actualGapMin,
          actualGap
        );

  accumulator.actualGapMax =
    accumulator.actualGapMax == null
      ? actualGap
      : Math.max(
          accumulator.actualGapMax,
          actualGap
        );

  accumulator.rankSum +=
    evaluation.averageRank;

  accumulator.top3Credit +=
    evaluation.top3Credit;

  accumulator.top5Credit +=
    evaluation.top5Credit;

  accumulator.top10Credit +=
    evaluation.top10Credit;
}

function finalizeAccumulator(
  accumulator
) {
  const evaluated =
    accumulator.evaluated;

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

    minimumActualGap:
      accumulator.actualGapMin,

    maximumActualGap:
      accumulator.actualGapMax,

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
      Number(
        accumulator
          .top3Credit
          .toFixed(4)
      ),

    top5EquivalentHits:
      Number(
        accumulator
          .top5Credit
          .toFixed(4)
      ),

    top10EquivalentHits:
      Number(
        accumulator
          .top10Credit
          .toFixed(4)
      ),

    top3Rate:
      evaluated > 0
        ? Number(
            (
              100 *
              accumulator
                .top3Credit /
              evaluated
            ).toFixed(4)
          )
        : 0,

    top5Rate:
      evaluated > 0
        ? Number(
            (
              100 *
              accumulator
                .top5Credit /
              evaluated
            ).toFixed(4)
          )
        : 0,

    top10Rate:
      evaluated > 0
        ? Number(
            (
              100 *
              accumulator
                .top10Credit /
              evaluated
            ).toFixed(4)
          )
        : 0,
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

function finalizeMap(map) {
  return Object.fromEntries(
    Object.entries(map)
      .map(
        ([key, accumulator]) => [
          key,
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

function strategyConfiguration(
  capture,
  strategy
) {
  switch (strategy) {
    case "GLOBAL_RECENT":
      return {
        bucket:
          capture?.global,
        direction: "ASC",
      };

    case "GLOBAL_OVERDUE":
      return {
        bucket:
          capture?.global,
        direction: "DESC",
      };

    case "SAME_HOUR_RECENT":
      return {
        bucket:
          capture?.sameHour,
        direction: "ASC",
      };

    case "SAME_HOUR_OVERDUE":
      return {
        bucket:
          capture?.sameHour,
        direction: "DESC",
      };

    default:
      return {
        bucket: null,
        direction: null,
      };
  }
}

function rankStrategies(
  summaries
) {
  return Object.entries(
    summaries
  )
    .map(
      ([strategy, summary]) => ({
        strategy,

        top3Rate:
          summary.top3Rate,

        averageRanking:
          summary.averageRanking,

        averageUsableHistory:
          summary.averageUsableHistory,

        averageActualGap:
          summary.averageActualGap,
      })
    )
    .sort(
      (a, b) =>
        b.top3Rate -
          a.top3Rate ||
        a.averageRanking -
          b.averageRanking
    );
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
            collectRecency(
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

  const overall =
    createStrategyMap();

  const firstHalf =
    createStrategyMap();

  const secondHalf =
    createStrategyMap();

  const byHour = {};

  const diagnostics = {
    missingActualGroup: 0,
    missingTargetHour: 0,
    missingCapture: 0,
    targetHourCaptureMismatch: 0,
    emptyGlobalHistory: 0,
    emptySameHourHistory: 0,
  };

  const details = [];

  const splitIndex =
    Math.floor(
      pairCount / 2
    );

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
      diagnostics.missingCapture++;
      continue;
    }

    const actualGroup =
      getActualGroup(
        currentCase
      );

    const targetHour =
      getTargetHour(
        currentCase
      );

    if (!actualGroup) {
      diagnostics
        .missingActualGroup++;

      for (
        const strategy of
        STRATEGIES
      ) {
        overall[strategy].missing++;

        if (
          index < splitIndex
        ) {
          firstHalf[
            strategy
          ].missing++;
        } else {
          secondHalf[
            strategy
          ].missing++;
        }
      }

      continue;
    }

    if (!targetHour) {
      diagnostics
        .missingTargetHour++;
    }

    if (
      targetHour &&
      capture.targetHour &&
      targetHour !==
        capture.targetHour
    ) {
      diagnostics
        .targetHourCaptureMismatch++;
    }

    if (
      !capture.global ||
      capture.global.usableDraws === 0
    ) {
      diagnostics
        .emptyGlobalHistory++;
    }

    if (
      !capture.sameHour ||
      capture.sameHour.usableDraws === 0
    ) {
      diagnostics
        .emptySameHourHistory++;
    }

    const hourKey =
      targetHour ??
      capture.targetHour ??
      "SEM_HORARIO";

    if (!byHour[hourKey]) {
      byHour[hourKey] =
        createStrategyMap();
    }

    const detailStrategies = {};

    for (
      const strategy of
      STRATEGIES
    ) {
      const {
        bucket,
        direction,
      } =
        strategyConfiguration(
          capture,
          strategy
        );

      const evaluation =
        bucket &&
        direction
          ? evaluateRanking(
              bucket.gaps,
              actualGroup,
              direction
            )
          : null;

      addEvaluation(
        overall[strategy],
        evaluation,
        bucket?.usableDraws ?? 0,
        bucket?.unseenGroups ?? 0
      );

      if (
        index < splitIndex
      ) {
        addEvaluation(
          firstHalf[strategy],
          evaluation,
          bucket?.usableDraws ?? 0,
          bucket?.unseenGroups ?? 0
        );
      } else {
        addEvaluation(
          secondHalf[strategy],
          evaluation,
          bucket?.usableDraws ?? 0,
          bucket?.unseenGroups ?? 0
        );
      }

      addEvaluation(
        byHour[hourKey][strategy],
        evaluation,
        bucket?.usableDraws ?? 0,
        bucket?.unseenGroups ?? 0
      );

      detailStrategies[
        strategy
      ] = {
        direction,
        usableHistory:
          bucket?.usableDraws ?? 0,
        unseenGroups:
          bucket?.unseenGroups ?? 0,
        evaluation,
      };
    }

    details.push({
      caseNumber:
        currentCase?.caseNumber ??
        index + 1,

      temporalBlock:
        index < splitIndex
          ? "FIRST_HALF"
          : "SECOND_HALF",

      target:
        currentCase?.target ??
        null,

      targetYmd:
        getTargetYmd(
          currentCase
        ),

      targetHour:
        hourKey,

      actualGroup,

      strategies:
        detailStrategies,
    });
  }

  const overallSummary =
    finalizeMap(overall);

  const firstHalfSummary =
    finalizeMap(firstHalf);

  const secondHalfSummary =
    finalizeMap(secondHalf);

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

  const byHourSummary =
    Object.fromEntries(
      Object.entries(byHour)
        .sort(
          ([hourA], [hourB]) =>
            hourA.localeCompare(
              hourB
            )
        )
        .map(
          ([hour, map]) => [
            hour,
            finalizeMap(map),
          ]
        )
    );

  const comparisons = {
    sameHourRecentVersusGlobalRecent:
      difference(
        overallSummary
          .SAME_HOUR_RECENT,
        overallSummary
          .GLOBAL_RECENT
      ),

    sameHourOverdueVersusGlobalOverdue:
      difference(
        overallSummary
          .SAME_HOUR_OVERDUE,
        overallSummary
          .GLOBAL_OVERDUE
      ),

    sameHourOverdueVersusSameHourRecent:
      difference(
        overallSummary
          .SAME_HOUR_OVERDUE,
        overallSummary
          .SAME_HOUR_RECENT
      ),

    globalOverdueVersusGlobalRecent:
      difference(
        overallSummary
          .GLOBAL_OVERDUE,
        overallSummary
          .GLOBAL_RECENT
      ),
  };

  const ranking =
    rankStrategies(
      overallSummary
    );

  const bestOverall =
    ranking[0] ?? null;

  const firstHalfRanking =
    rankStrategies(
      firstHalfSummary
    );

  const secondHalfRanking =
    rankStrategies(
      secondHalfSummary
    );

  const report = {
    ok: true,

    experimentCode:
      "E05",

    experiment:
      "group recency in first prize, testing recent and overdue directions globally and at the same target hour",

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

      groups:
        GROUP_COUNT,

      strategies:
        STRATEGIES,

      gapDefinition:
        "number of eligible first-prize draws since the most recent occurrence; zero means the group appeared in the latest eligible draw",

      unseenGroupGap:
        "equal to the number of eligible historical draws",

      recentDirection:
        "smaller gap ranks higher",

      overdueDirection:
        "larger gap ranks higher",

      primaryObjective:
        "Top3",

      tieTreatment:
        "average rank and fractional credit at Top-K cutoff",

      temporalValidation:
        "first 500 evaluated cases versus last 500 evaluated cases",

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
      top3Rate: 12,
      top5Rate: 20,
      top10Rate: 40,
    },

    overall:
      overallSummary,

    ranking,

    comparisons,

    firstHalf:
      firstHalfSummary,

    secondHalf:
      secondHalfSummary,

    firstHalfRanking,

    secondHalfRanking,

    temporalStability,

    byTargetHour:
      byHourSummary,

    bestOverall,

    details,
  };

  fs.writeFileSync(
    "tmp/v4_group_recency_report.json",
    JSON.stringify(
      report,
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(
    "===== RESUMO DO EXPERIMENTO E05 ====="
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

        overall:
          report.overall,

        ranking:
          report.ranking,

        comparisons:
          report.comparisons,

        firstHalfRanking:
          report.firstHalfRanking,

        secondHalfRanking:
          report.secondHalfRanking,

        temporalStability:
          report.temporalStability,

        byTargetHour:
          report.byTargetHour,

        bestOverall:
          report.bestOverall,
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
    "tmp/v4_group_recency_report.json"
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "Falha no experimento E05:"
  );

  console.error(
    error?.stack || error
  );

  process.exit(1);
});
