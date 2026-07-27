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

function weekdayFromYmd(value) {
  const ymd = normalizeYmd(value);

  if (!ymd) {
    return null;
  }

  const match = ymd.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.getUTCDay();
}

function normalizeWeekday(value) {
  if (value == null) {
    return null;
  }

  if (
    Number.isInteger(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 6
  ) {
    return Number(value);
  }

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");

  const aliases = new Map([
    ["domingo", 0],
    ["dom", 0],
    ["sunday", 0],
    ["sun", 0],

    ["segunda", 1],
    ["segunda feira", 1],
    ["seg", 1],
    ["monday", 1],
    ["mon", 1],

    ["terca", 2],
    ["terca feira", 2],
    ["ter", 2],
    ["tuesday", 2],
    ["tue", 2],

    ["quarta", 3],
    ["quarta feira", 3],
    ["qua", 3],
    ["wednesday", 3],
    ["wed", 3],

    ["quinta", 4],
    ["quinta feira", 4],
    ["qui", 4],
    ["thursday", 4],
    ["thu", 4],

    ["sexta", 5],
    ["sexta feira", 5],
    ["sex", 5],
    ["friday", 5],
    ["fri", 5],

    ["sabado", 6],
    ["sab", 6],
    ["saturday", 6],
    ["sat", 6],
  ]);

  return aliases.has(normalized)
    ? aliases.get(normalized)
    : null;
}

function weekdayName(value) {
  const names = [
    "domingo",
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
  ];

  return (
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6
  )
    ? names[value]
    : "sem_dia";
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

function createBucket() {
  return {
    frequency: createEmptyFrequency(),
    usableDraws: 0,
  };
}

function ensureBucket(container, key) {
  if (!container[key]) {
    container[key] = createBucket();
  }

  return container[key];
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

function getDrawWeekday(draw) {
  const explicit = normalizeWeekday(
    draw?.weekday ??
    draw?.weekDay ??
    draw?.dayOfWeek ??
    draw?.diaSemana
  );

  if (explicit != null) {
    return explicit;
  }

  return weekdayFromYmd(
    getDrawYmd(draw)
  );
}

function collectContextFrequencies(draws) {
  const global = createBucket();
  const byHour = {};
  const byHourWeekday = {};

  for (
    const draw of
    Array.isArray(draws) ? draws : []
  ) {
    const firstPrize = findFirstPrize(draw);

    const group = normalizeGroup(
      firstPrize?.grupo ??
      firstPrize?.group ??
      firstPrize?.animalGroup
    );

    if (!group) {
      continue;
    }

    global.frequency[group]++;
    global.usableDraws++;

    const hour = getDrawHour(draw);

    if (hour) {
      const hourBucket = ensureBucket(
        byHour,
        hour
      );

      hourBucket.frequency[group]++;
      hourBucket.usableDraws++;
    }

    const weekday = getDrawWeekday(draw);

    if (
      hour &&
      weekday != null
    ) {
      const contextKey =
        hour + "|" + weekday;

      const contextBucket = ensureBucket(
        byHourWeekday,
        contextKey
      );

      contextBucket.frequency[group]++;
      contextBucket.usableDraws++;
    }
  }

  return {
    global,
    byHour,
    byHourWeekday,
  };
}

function evaluateRanking(
  frequency,
  actualGroup
) {
  const entries = Object.entries(
    frequency || {}
  );

  if (entries.length !== GROUP_COUNT) {
    return null;
  }

  const actualFrequency = Number(
    frequency[actualGroup]
  );

  if (!Number.isFinite(actualFrequency)) {
    return null;
  }

  const values = entries
    .map(([, value]) => Number(value))
    .filter(Number.isFinite);

  if (values.length !== GROUP_COUNT) {
    return null;
  }

  const greater = values.filter(
    (value) =>
      value > actualFrequency
  ).length;

  const equal = values.filter(
    (value) =>
      value === actualFrequency
  ).length;

  if (equal <= 0) {
    return null;
  }

  const minRank = greater + 1;
  const maxRank = greater + equal;

  const averageRank =
    (minRank + maxRank) / 2;

  function fractionalTopK(k) {
    if (maxRank <= k) {
      return 1;
    }

    if (minRank > k) {
      return 0;
    }

    const positionsInside =
      k - minRank + 1;

    return positionsInside / equal;
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
              accumulator.usableHistorySum /
              evaluated
            ).toFixed(2)
          )
        : null,

    minimumUsableHistory:
      accumulator.usableHistoryMin,

    maximumUsableHistory:
      accumulator.usableHistoryMax,

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
        accumulator.top3Credit.toFixed(4)
      ),

    top5EquivalentHits:
      Number(
        accumulator.top5Credit.toFixed(4)
      ),

    top10EquivalentHits:
      Number(
        accumulator.top10Credit.toFixed(4)
      ),

    top3Rate:
      evaluated > 0
        ? Number(
            (
              100 *
              accumulator.top3Credit /
              evaluated
            ).toFixed(4)
          )
        : 0,

    top5Rate:
      evaluated > 0
        ? Number(
            (
              100 *
              accumulator.top5Credit /
              evaluated
            ).toFixed(4)
          )
        : 0,

    top10Rate:
      evaluated > 0
        ? Number(
            (
              100 *
              accumulator.top10Credit /
              evaluated
            ).toFixed(4)
          )
        : 0,
  };
}

function getTargetHour(currentCase) {
  return normalizeHour(
    currentCase?.target?.hour ??
    currentCase?.target?.closeHour ??
    currentCase?.targetHour ??
    currentCase?.closeHour
  );
}

function getTargetYmd(currentCase) {
  return normalizeYmd(
    currentCase?.target?.ymd ??
    currentCase?.target?.date ??
    currentCase?.targetDate ??
    currentCase?.ymd
  );
}

function getTargetWeekday(currentCase) {
  const explicit = normalizeWeekday(
    currentCase?.target?.weekday ??
    currentCase?.target?.weekDay ??
    currentCase?.target?.dayOfWeek ??
    currentCase?.weekday
  );

  if (explicit != null) {
    return explicit;
  }

  return weekdayFromYmd(
    getTargetYmd(currentCase)
  );
}

function getActualGroup(currentCase) {
  return normalizeGroup(
    currentCase?.actual?.grupo ??
    currentCase?.actual?.group ??
    currentCase?.actual?.animalGroup ??
    currentCase?.actualGroup
  );
}

function summarizeMap(
  accumulatorMap
) {
  return Object.fromEntries(
    Object.entries(accumulatorMap)
      .sort(([keyA], [keyB]) =>
        keyA.localeCompare(keyB)
      )
      .map(([key, accumulator]) => [
        key,
        finalizeAccumulator(accumulator),
      ])
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
              candidate.averageRanking -
              baseline.averageRanking
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

async function main() {
  const result =
    await runOfficialBacktest(
      {
        lotteryKey: "PT_RIO",
        limit: CASE_LIMIT,
        minHistory: MIN_HISTORY,
        telemetry: true,
      },
      {
        computeTop3(input) {
          const output =
            computeStatisticalTop3V4Experimental(
              input
            );

          captures.push(
            collectContextFrequencies(
              input?.drawsRange
            )
          );

          return output;
        },
      }
    );

  const cases = Array.isArray(
    result?.telemetry?.cases
  )
    ? result.telemetry.cases
    : [];

  const pairCount = Math.min(
    cases.length,
    captures.length
  );

  const globalAccumulator =
    createAccumulator();

  const hourAccumulator =
    createAccumulator();

  const hourWeekdayAccumulator =
    createAccumulator();

  const byHourAccumulators = {};
  const byContextAccumulators = {};

  const diagnostics = {
    missingActualGroup: 0,
    missingTargetHour: 0,
    missingTargetWeekday: 0,
    missingHourBucket: 0,
    missingHourWeekdayBucket: 0,
  };

  const details = [];

  for (
    let index = 0;
    index < pairCount;
    index++
  ) {
    const currentCase = cases[index];
    const capture = captures[index];

    const actualGroup =
      getActualGroup(currentCase);

    const targetHour =
      getTargetHour(currentCase);

    const targetWeekday =
      getTargetWeekday(currentCase);

    if (!actualGroup) {
      diagnostics.missingActualGroup++;
      globalAccumulator.missing++;
      hourAccumulator.missing++;
      hourWeekdayAccumulator.missing++;
      continue;
    }

    if (!targetHour) {
      diagnostics.missingTargetHour++;
    }

    if (targetWeekday == null) {
      diagnostics.missingTargetWeekday++;
    }

    const globalBucket =
      capture?.global ?? null;

    const hourBucket =
      targetHour
        ? capture?.byHour?.[targetHour] ?? null
        : null;

    const contextKey =
      targetHour &&
      targetWeekday != null
        ? targetHour + "|" + targetWeekday
        : null;

    const hourWeekdayBucket =
      contextKey
        ? capture?.byHourWeekday?.[
            contextKey
          ] ?? null
        : null;

    if (!hourBucket) {
      diagnostics.missingHourBucket++;
    }

    if (!hourWeekdayBucket) {
      diagnostics.missingHourWeekdayBucket++;
    }

    const globalEvaluation =
      globalBucket
        ? evaluateRanking(
            globalBucket.frequency,
            actualGroup
          )
        : null;

    const hourEvaluation =
      hourBucket
        ? evaluateRanking(
            hourBucket.frequency,
            actualGroup
          )
        : null;

    const hourWeekdayEvaluation =
      hourWeekdayBucket
        ? evaluateRanking(
            hourWeekdayBucket.frequency,
            actualGroup
          )
        : null;

    addEvaluation(
      globalAccumulator,
      globalEvaluation,
      globalBucket?.usableDraws ?? 0
    );

    addEvaluation(
      hourAccumulator,
      hourEvaluation,
      hourBucket?.usableDraws ?? 0
    );

    addEvaluation(
      hourWeekdayAccumulator,
      hourWeekdayEvaluation,
      hourWeekdayBucket?.usableDraws ?? 0
    );

    if (targetHour) {
      if (!byHourAccumulators[targetHour]) {
        byHourAccumulators[targetHour] =
          createAccumulator();
      }

      addEvaluation(
        byHourAccumulators[targetHour],
        hourWeekdayEvaluation,
        hourWeekdayBucket?.usableDraws ?? 0
      );
    }

    const readableContextKey =
      targetHour &&
      targetWeekday != null
        ? (
            targetHour +
            "|" +
            weekdayName(targetWeekday)
          )
        : "SEM_CONTEXTO";

    if (
      !byContextAccumulators[
        readableContextKey
      ]
    ) {
      byContextAccumulators[
        readableContextKey
      ] = createAccumulator();
    }

    addEvaluation(
      byContextAccumulators[
        readableContextKey
      ],
      hourWeekdayEvaluation,
      hourWeekdayBucket?.usableDraws ?? 0
    );

    details.push({
      caseNumber:
        currentCase?.caseNumber ??
        index + 1,

      target:
        currentCase?.target ?? null,

      targetYmd:
        getTargetYmd(currentCase),

      targetHour,

      targetWeekday,

      targetWeekdayName:
        weekdayName(targetWeekday),

      actualGroup,

      history: {
        global:
          globalBucket?.usableDraws ?? 0,

        sameHour:
          hourBucket?.usableDraws ?? 0,

        sameHourWeekday:
          hourWeekdayBucket?.usableDraws ?? 0,
      },

      rankings: {
        global:
          globalEvaluation,

        sameHour:
          hourEvaluation,

        sameHourWeekday:
          hourWeekdayEvaluation,
      },
    });
  }

  const globalSummary =
    finalizeAccumulator(
      globalAccumulator
    );

  const hourSummary =
    finalizeAccumulator(
      hourAccumulator
    );

  const hourWeekdaySummary =
    finalizeAccumulator(
      hourWeekdayAccumulator
    );

  const comparisons = {
    hourVersusGlobal:
      difference(
        hourSummary,
        globalSummary
      ),

    hourWeekdayVersusGlobal:
      difference(
        hourWeekdaySummary,
        globalSummary
      ),

    hourWeekdayVersusHour:
      difference(
        hourWeekdaySummary,
        hourSummary
      ),
  };

  const report = {
    ok: true,

    experimentCode: "E03",

    experiment:
      "first-prize group frequency by target hour and weekday",

    methodology: {
      lotteryKey: "PT_RIO",
      casesRequested: CASE_LIMIT,
      casesReturned: cases.length,
      captures: captures.length,
      casesPaired: pairCount,
      minimumGlobalHistory: MIN_HISTORY,
      groups: GROUP_COUNT,

      tieTreatment:
        "average rank and fractional credit at Top-K cutoff",

      primaryObjective:
        "Top3",

      secondaryMetrics:
        [
          "Top5",
          "Top10",
          "averageRanking",
        ],

      productionRankingChanged: false,
      officialWeightsChanged: false,
      deploymentPerformed: false,
    },

    randomReference: {
      averageRanking: 13,
      top3Rate: 12,
      top5Rate: 20,
      top10Rate: 40,
    },

    diagnostics,

    summaries: {
      globalFrequency:
        globalSummary,

      sameHourFrequency:
        hourSummary,

      sameHourWeekdayFrequency:
        hourWeekdaySummary,
    },

    comparisons,

    byTargetHour:
      summarizeMap(
        byHourAccumulators
      ),

    byHourAndWeekday:
      summarizeMap(
        byContextAccumulators
      ),

    details,
  };

  fs.writeFileSync(
    "tmp/v4_frequency_hour_weekday_report.json",
    JSON.stringify(
      report,
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(
    "===== RESUMO DO EXPERIMENTO E03 ====="
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

        summaries:
          report.summaries,

        comparisons,

        byTargetHour:
          report.byTargetHour,

        byHourAndWeekday:
          report.byHourAndWeekday,
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
    "tmp/v4_frequency_hour_weekday_report.json"
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "Falha no experimento E03:"
  );
  console.error(
    error?.stack || error
  );
  process.exit(1);
});
