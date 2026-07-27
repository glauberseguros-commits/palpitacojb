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

const WINDOWS = [
  20,
  40,
  60,
  100,
  "FULL",
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

function createEmptyFrequency() {
  const frequency = {};

  for (
    let group = 1;
    group <= GROUP_COUNT;
    group++
  ) {
    frequency[
      String(group).padStart(2, "0")
    ] = 0;
  }

  return frequency;
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

function drawTimestamp(draw, fallbackIndex) {
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
      draw,
      index,
      timestamp:
        drawTimestamp(draw, index),
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
        a.timestamp - b.timestamp ||
        a.index - b.index
    );
}

function createFrequencyFromItems(
  items
) {
  const frequency =
    createEmptyFrequency();

  for (const item of items) {
    frequency[item.group]++;
  }

  return {
    frequency,
    usableDraws: items.length,
  };
}

function collectWindowFrequencies(
  draws,
  targetHour
) {
  const normalized =
    normalizeHistoricalDraws(draws);

  const sameHour =
    targetHour
      ? normalized.filter(
          (item) =>
            item.hour === targetHour
        )
      : [];

  const windows = {};

  for (const window of WINDOWS) {
    const key =
      window === "FULL"
        ? "FULL"
        : String(window);

    const selected =
      window === "FULL"
        ? sameHour
        : sameHour.slice(
            -Number(window)
          );

    windows[key] =
      createFrequencyFromItems(
        selected
      );
  }

  return {
    targetHour,
    availableSameHour:
      sameHour.length,
    windows,
  };
}

function evaluateRanking(
  frequency,
  actualGroup
) {
  const entries = Object.entries(
    frequency || {}
  );

  if (
    entries.length !==
    GROUP_COUNT
  ) {
    return null;
  }

  const actualFrequency =
    Number(
      frequency[actualGroup]
    );

  if (
    !Number.isFinite(
      actualFrequency
    )
  ) {
    return null;
  }

  const values = entries
    .map(([, value]) =>
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

  const greater =
    values.filter(
      (value) =>
        value >
        actualFrequency
    ).length;

  const equal =
    values.filter(
      (value) =>
        value ===
        actualFrequency
    ).length;

  if (equal <= 0) {
    return null;
  }

  const minRank =
    greater + 1;

  const maxRank =
    greater + equal;

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

    const positionsInside =
      k - minRank + 1;

    return (
      positionsInside /
      equal
    );
  }

  return {
    actualFrequency,
    greater,
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

    rankSum: 0,

    top3Credit: 0,
    top5Credit: 0,
    top10Credit: 0,
  };
}

function addEvaluation(
  accumulator,
  evaluation,
  usableHistory
) {
  if (!evaluation) {
    accumulator.missing++;
    return;
  }

  const historyCount =
    Number(usableHistory) || 0;

  accumulator.evaluated++;

  accumulator.usableHistorySum +=
    historyCount;

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
    currentCase?.actual
      ?.animalGroup ??
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

function createWindowAccumulatorMap() {
  const map = {};

  for (const window of WINDOWS) {
    const key =
      window === "FULL"
        ? "FULL"
        : String(window);

    map[key] =
      createAccumulator();
  }

  return map;
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

function selectBestWindow(
  summaries
) {
  const entries =
    Object.entries(summaries)
      .filter(
        ([, summary]) =>
          Number.isFinite(
            summary?.top3Rate
          )
      )
      .sort(
        (a, b) => {
          const top3Difference =
            b[1].top3Rate -
            a[1].top3Rate;

          if (
            top3Difference !== 0
          ) {
            return top3Difference;
          }

          const rankingA =
            a[1].averageRanking ??
            Number.POSITIVE_INFINITY;

          const rankingB =
            b[1].averageRanking ??
            Number.POSITIVE_INFINITY;

          return (
            rankingA -
            rankingB
          );
        }
      );

  if (!entries.length) {
    return null;
  }

  return {
    window:
      entries[0][0],

    summary:
      entries[0][1],
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
              input
                ?.targetHourOverride ??
              input
                ?.targetHour ??
              input
                ?.hour
            );

          captures.push(
            collectWindowFrequencies(
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
    createWindowAccumulatorMap();

  const firstHalf =
    createWindowAccumulatorMap();

  const secondHalf =
    createWindowAccumulatorMap();

  const byHour = {};

  const diagnostics = {
    missingActualGroup: 0,
    missingTargetHour: 0,
    missingCapture: 0,
    targetHourCaptureMismatch: 0,
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

    const actualGroup =
      getActualGroup(
        currentCase
      );

    const targetHour =
      getTargetHour(
        currentCase
      );

    if (!capture) {
      diagnostics
        .missingCapture++;
      continue;
    }

    if (!actualGroup) {
      diagnostics
        .missingActualGroup++;

      for (
        const window of WINDOWS
      ) {
        const key =
          window === "FULL"
            ? "FULL"
            : String(window);

        overall[key].missing++;

        if (
          index < splitIndex
        ) {
          firstHalf[key].missing++;
        } else {
          secondHalf[key].missing++;
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

    const hourKey =
      targetHour ??
      capture.targetHour ??
      "SEM_HORARIO";

    if (!byHour[hourKey]) {
      byHour[hourKey] =
        createWindowAccumulatorMap();
    }

    const detailWindows = {};

    for (
      const window of WINDOWS
    ) {
      const key =
        window === "FULL"
          ? "FULL"
          : String(window);

      const bucket =
        capture
          ?.windows
          ?.[key] ??
        null;

      const evaluation =
        bucket
          ? evaluateRanking(
              bucket.frequency,
              actualGroup
            )
          : null;

      addEvaluation(
        overall[key],
        evaluation,
        bucket?.usableDraws ?? 0
      );

      if (
        index < splitIndex
      ) {
        addEvaluation(
          firstHalf[key],
          evaluation,
          bucket?.usableDraws ?? 0
        );
      } else {
        addEvaluation(
          secondHalf[key],
          evaluation,
          bucket?.usableDraws ?? 0
        );
      }

      addEvaluation(
        byHour[hourKey][key],
        evaluation,
        bucket?.usableDraws ?? 0
      );

      detailWindows[key] = {
        usableHistory:
          bucket?.usableDraws ?? 0,

        evaluation,
      };
    }

    details.push({
      caseNumber:
        currentCase
          ?.caseNumber ??
        index + 1,

      temporalBlock:
        index < splitIndex
          ? "FIRST_HALF"
          : "SECOND_HALF",

      target:
        currentCase
          ?.target ??
        null,

      targetYmd:
        getTargetYmd(
          currentCase
        ),

      targetHour:
        hourKey,

      actualGroup,

      availableSameHour:
        capture
          .availableSameHour,

      windows:
        detailWindows,
    });
  }

  const overallSummary =
    finalizeMap(overall);

  const firstHalfSummary =
    finalizeMap(firstHalf);

  const secondHalfSummary =
    finalizeMap(secondHalf);

  const fullBaseline =
    overallSummary.FULL;

  const comparisonsVersusFull = {};

  const temporalStability = {};

  for (
    const window of WINDOWS
  ) {
    const key =
      window === "FULL"
        ? "FULL"
        : String(window);

    comparisonsVersusFull[key] =
      difference(
        overallSummary[key],
        fullBaseline
      );

    temporalStability[key] = {
      firstHalf:
        firstHalfSummary[key],

      secondHalf:
        secondHalfSummary[key],

      secondHalfVersusFirstHalf:
        difference(
          secondHalfSummary[key],
          firstHalfSummary[key]
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

  const bestOverallWindow =
    selectBestWindow(
      overallSummary
    );

  const bestFirstHalfWindow =
    selectBestWindow(
      firstHalfSummary
    );

  const bestSecondHalfWindow =
    selectBestWindow(
      secondHalfSummary
    );

  const ranking =
    Object.entries(
      overallSummary
    )
      .map(
        ([window, summary]) => ({
          window,
          top3Rate:
            summary.top3Rate,
          averageRanking:
            summary.averageRanking,
          averageUsableHistory:
            summary.averageUsableHistory,
          top3DifferenceVersusFull:
            comparisonsVersusFull[
              window
            ]
              .top3RateDifference,
        })
      )
      .sort(
        (a, b) =>
          b.top3Rate -
            a.top3Rate ||
          a.averageRanking -
            b.averageRanking
      );

  const report = {
    ok: true,

    experimentCode:
      "E04",

    experiment:
      "same-hour first-prize group frequency using moving history windows",

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

      windows:
        WINDOWS,

      primaryObjective:
        "Top3",

      tieTreatment:
        "average rank and fractional credit at Top-K cutoff",

      temporalValidation:
        "chronological first half versus second half of evaluated cases",

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

    comparisonsVersusFull,

    temporalStability,

    byTargetHour:
      byHourSummary,

    ranking,

    bestOverallWindow,
    bestFirstHalfWindow,
    bestSecondHalfWindow,

    details,
  };

  fs.writeFileSync(
    "tmp/v4_frequency_hour_windows_report.json",
    JSON.stringify(
      report,
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(
    "===== RESUMO DO EXPERIMENTO E04 ====="
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

        comparisonsVersusFull:
          report.comparisonsVersusFull,

        ranking:
          report.ranking,

        bestOverallWindow:
          report.bestOverallWindow,

        bestFirstHalfWindow:
          report.bestFirstHalfWindow,

        bestSecondHalfWindow:
          report.bestSecondHalfWindow,

        temporalStability:
          report.temporalStability,

        byTargetHour:
          report.byTargetHour,
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
    "tmp/v4_frequency_hour_windows_report.json"
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "Falha no experimento E04:"
  );

  console.error(
    error?.stack || error
  );

  process.exit(1);
});
