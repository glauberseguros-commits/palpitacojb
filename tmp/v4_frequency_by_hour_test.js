"use strict";

const fs = require("fs");

const {
  runOfficialBacktest,
} = require("../backend/scripts/backtestTop3Official");

const {
  computeStatisticalTop3V4Experimental,
} = require("../backend/engine/scoreEngineV4Experimental");

const captures = [];

function normalizeGroup(value) {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < 1 ||
    number > 25
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

function createEmptyFrequency() {
  const frequency = {};

  for (
    let group = 1;
    group <= 25;
    group++
  ) {
    frequency[
      String(group).padStart(2, "0")
    ] = 0;
  }

  return frequency;
}

function findFirstPrize(draw) {
  const prizes =
    Array.isArray(draw?.prizes)
      ? draw.prizes
      : [];

  return (
    prizes.find(
      (prize) =>
        Number(
          prize?.position ??
          prize?.posicao ??
          prize?.prize
        ) === 1
    ) ??
    prizes[0] ??
    null
  );
}

function collectFrequency(
  draws,
  targetHour = null
) {
  const frequency =
    createEmptyFrequency();

  let usableDraws = 0;

  for (
    const draw of
    Array.isArray(draws) ? draws : []
  ) {
    const drawHour =
      normalizeHour(
        draw?.closeHour ??
        draw?.hour ??
        draw?.targetHour
      );

    if (
      targetHour &&
      drawHour !== targetHour
    ) {
      continue;
    }

    const firstPrize =
      findFirstPrize(draw);

    const group =
      normalizeGroup(
        firstPrize?.grupo ??
        firstPrize?.group ??
        firstPrize?.animalGroup
      );

    if (!group) {
      continue;
    }

    frequency[group]++;
    usableDraws++;
  }

  return {
    frequency,
    usableDraws,
  };
}

function evaluateRanking(
  frequency,
  actualGroup
) {
  const entries =
    Object.entries(
      frequency || {}
    );

  if (entries.length !== 25) {
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

  const values =
    entries
      .map(([, value]) =>
        Number(value)
      )
      .filter(
        Number.isFinite
      );

  if (values.length !== 25) {
    return null;
  }

  const greater =
    values.filter(
      (value) =>
        value > actualFrequency
    ).length;

  const equal =
    values.filter(
      (value) =>
        value === actualFrequency
    ).length;

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

    const placesInsideTopK =
      k - minRank + 1;

    return (
      placesInsideTopK /
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

  accumulator.evaluated++;

  accumulator.usableHistorySum +=
    Number(usableHistory) || 0;

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

async function main() {
  const result =
    await runOfficialBacktest(
      {
        lotteryKey: "PT_RIO",
        limit: 500,
        minHistory: 100,
        telemetry: true,
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

          const globalFrequency =
            collectFrequency(
              input?.drawsRange
            );

          const sameHourFrequency =
            collectFrequency(
              input?.drawsRange,
              targetHour
            );

          captures.push({
            targetHour,
            globalFrequency,
            sameHourFrequency,
          });

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

  const globalAccumulator =
    createAccumulator();

  const sameHourAccumulator =
    createAccumulator();

  const byHourAccumulators = {};

  const details = [];

  const pairCount =
    Math.min(
      cases.length,
      captures.length
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
      normalizeGroup(
        currentCase?.actual?.grupo ??
        currentCase?.actual?.group ??
        currentCase?.actualGroup
      );

    const targetHour =
      normalizeHour(
        currentCase?.target?.hour ??
        currentCase?.targetHour ??
        capture?.targetHour
      );

    if (
      !actualGroup ||
      !capture
    ) {
      globalAccumulator.missing++;
      sameHourAccumulator.missing++;
      continue;
    }

    const globalEvaluation =
      evaluateRanking(
        capture
          .globalFrequency
          .frequency,
        actualGroup
      );

    const sameHourEvaluation =
      evaluateRanking(
        capture
          .sameHourFrequency
          .frequency,
        actualGroup
      );

    addEvaluation(
      globalAccumulator,
      globalEvaluation,
      capture
        .globalFrequency
        .usableDraws
    );

    addEvaluation(
      sameHourAccumulator,
      sameHourEvaluation,
      capture
        .sameHourFrequency
        .usableDraws
    );

    const hourKey =
      targetHour || "SEM_HORARIO";

    if (
      !byHourAccumulators[
        hourKey
      ]
    ) {
      byHourAccumulators[
        hourKey
      ] = createAccumulator();
    }

    addEvaluation(
      byHourAccumulators[
        hourKey
      ],
      sameHourEvaluation,
      capture
        .sameHourFrequency
        .usableDraws
    );

    details.push({
      caseNumber:
        currentCase?.caseNumber ??
        index + 1,

      target:
        currentCase?.target ??
        null,

      targetHour:
        hourKey,

      actualGroup,

      global:
        globalEvaluation,

      sameHour:
        sameHourEvaluation,

      globalHistory:
        capture
          .globalFrequency
          .usableDraws,

      sameHourHistory:
        capture
          .sameHourFrequency
          .usableDraws,
    });
  }

  const byHour =
    Object.fromEntries(
      Object.entries(
        byHourAccumulators
      )
        .sort(
          ([hourA], [hourB]) =>
            hourA.localeCompare(
              hourB
            )
        )
        .map(
          ([
            hour,
            accumulator,
          ]) => [
            hour,
            finalizeAccumulator(
              accumulator
            ),
          ]
        )
    );

  const globalSummary =
    finalizeAccumulator(
      globalAccumulator
    );

  const sameHourSummary =
    finalizeAccumulator(
      sameHourAccumulator
    );

  const comparison = {
    averageRankingDifference:
      globalSummary
        .averageRanking != null &&
      sameHourSummary
        .averageRanking != null
        ? Number(
            (
              sameHourSummary
                .averageRanking -
              globalSummary
                .averageRanking
            ).toFixed(4)
          )
        : null,

    top3RateDifference:
      Number(
        (
          sameHourSummary.top3Rate -
          globalSummary.top3Rate
        ).toFixed(4)
      ),

    top5RateDifference:
      Number(
        (
          sameHourSummary.top5Rate -
          globalSummary.top5Rate
        ).toFixed(4)
      ),

    top10RateDifference:
      Number(
        (
          sameHourSummary.top10Rate -
          globalSummary.top10Rate
        ).toFixed(4)
      ),
  };

  const report = {
    ok: true,

    experiment:
      "first-prize group frequency by target hour",

    methodology: {
      casesRequested: 500,
      casesReturned:
        cases.length,
      captures:
        captures.length,
      casesPaired:
        pairCount,
      minimumHistory: 100,
      groups: 25,

      tieTreatment:
        "average rank and fractional credit at Top-K cutoff",

      productionRankingChanged:
        false,
    },

    randomReference: {
      averageRanking: 13,
      top3Rate: 12,
      top5Rate: 20,
      top10Rate: 40,
    },

    globalFrequency:
      globalSummary,

    sameHourFrequency:
      sameHourSummary,

    comparison,

    byHour,

    details,
  };

  fs.writeFileSync(
    "tmp/v4_frequency_by_hour_report.json",
    JSON.stringify(
      report,
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(
    "===== RESUMO DO EXPERIMENTO ====="
  );

  console.log(
    JSON.stringify(
      {
        casesReturned:
          cases.length,

        captures:
          captures.length,

        casesPaired:
          pairCount,

        randomReference:
          report.randomReference,

        globalFrequency:
          globalSummary,

        sameHourFrequency:
          sameHourSummary,

        comparison,

        byHour,
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
    "tmp/v4_frequency_by_hour_report.json"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
