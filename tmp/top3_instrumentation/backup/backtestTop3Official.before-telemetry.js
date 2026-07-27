"use strict";

const fs = require("fs");
const path = require("path");

const {
  readFullHistory,
  readMetadata,
} = require("../engine/top3HistoryRepository");

const {
  computeStatisticalTop3V3,
  loadTop3PublicApi,
} = require("../engine/scoreEngineUnified");

const PT_RIO_SCHEDULE_NORMAL = [
  "09:00",
  "11:00",
  "14:00",
  "16:00",
  "18:00",
  "21:00",
];

const PT_RIO_SCHEDULE_WED_SAT = [
  "09:00",
  "11:00",
  "14:00",
  "16:00",
  "18:00",
  "21:00",
];

const FEDERAL_SCHEDULE = [
  "19:00",
  "20:00",
];

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function normalizeLotteryKey(value) {
  return String(value || "PT_RIO")
    .trim()
    .toUpperCase() || "PT_RIO";
}

function normalizeHour(value) {
  const raw = String(value || "")
    .trim()
    .replace("h", ":00");

  if (/^\d{1,2}$/.test(raw)) {
    return `${raw.padStart(2, "0")}:00`;
  }

  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [hour, minute] = raw.split(":");

    return `${hour.padStart(2, "0")}:${minute}`;
  }

  return null;
}

function dateHourKey(ymd, hour) {
  return `${ymd}T${normalizeHour(hour) || hour}`;
}

function parseIntegerFlag(
  args,
  name,
  fallback = null
) {
  const prefix = `--${name}=`;

  const match = args.find(
    (value) =>
      String(value).startsWith(prefix)
  );

  if (!match) {
    return fallback;
  }

  const number = Number(
    String(match).slice(prefix.length)
  );

  if (
    !Number.isInteger(number) ||
    number < 1
  ) {
    throw new Error(
      `Parâmetro --${name} inválido.`
    );
  }

  return number;
}

function parseStringFlag(
  args,
  name,
  fallback = null
) {
  const prefix = `--${name}=`;

  const match = args.find(
    (value) =>
      String(value).startsWith(prefix)
  );

  if (!match) {
    return fallback;
  }

  const value = String(match)
    .slice(prefix.length)
    .trim();

  return value || fallback;
}

function parseCliArgs(argv = []) {
  const lotteryKey = normalizeLotteryKey(
    argv[0] || "PT_RIO"
  );

  const flags = argv.slice(1);

  return {
    lotteryKey,
    limit: parseIntegerFlag(
      flags,
      "limit",
      null
    ),
    minHistory: parseIntegerFlag(
      flags,
      "min-history",
      100
    ),
    from: parseStringFlag(
      flags,
      "from",
      null
    ),
    to: parseStringFlag(
      flags,
      "to",
      null
    ),
    outputDir: parseStringFlag(
      flags,
      "output-dir",
      "tmp"
    ),
  };
}

function sortDraws(draws = [], publicApi) {
  return [...safeArray(draws)]
    .filter(Boolean)
    .sort((a, b) => {
      const aYmd =
        publicApi.pickDrawYMD(a) || "";

      const bYmd =
        publicApi.pickDrawYMD(b) || "";

      const aHour =
        publicApi.pickDrawHour(a) || "";

      const bHour =
        publicApi.pickDrawHour(b) || "";

      const aId = String(
        a.drawId || a.id || ""
      );

      const bId = String(
        b.drawId || b.id || ""
      );

      return dateHourKey(
        aYmd,
        aHour
      ).localeCompare(
        dateHourKey(
          bYmd,
          bHour
        )
      ) || aId.localeCompare(bId);
    });
}

function getFirstPrizeGroup(
  draw,
  publicApi
) {
  const value =
    publicApi.pickPrize1GrupoFromDraw(
      draw
    );

  const group = Number(value);

  if (
    !Number.isFinite(group) ||
    group < 1 ||
    group > 25
  ) {
    return null;
  }

  return group;
}

function getPredictionGroups(
  computed
) {
  const candidates =
    safeArray(computed?.top).length
      ? safeArray(computed.top)
      : safeArray(computed?.ranking);

  return candidates
    .map((item) =>
      Number(
        item?.grupo ??
        item?.group
      )
    )
    .filter(
      (group) =>
        Number.isFinite(group) &&
        group >= 1 &&
        group <= 25
    )
    .slice(0, 3);
}

function ensureBucket(
  map,
  key
) {
  if (!map[key]) {
    map[key] = {
      evaluated: 0,
      top1Hits: 0,
      top3Hits: 0,
      errors: 0,
    };
  }

  return map[key];
}

function finalizeBucket(bucket = {}) {
  const evaluated = Number(
    bucket.evaluated || 0
  );

  const top1Hits = Number(
    bucket.top1Hits || 0
  );

  const top3Hits = Number(
    bucket.top3Hits || 0
  );

  return {
    evaluated,
    top1Hits,
    top3Hits,
    errors: Number(
      bucket.errors || 0
    ),
    top1Rate:
      evaluated > 0
        ? Number(
            (
              top1Hits /
              evaluated *
              100
            ).toFixed(4)
          )
        : 0,
    top3Rate:
      evaluated > 0
        ? Number(
            (
              top3Hits /
              evaluated *
              100
            ).toFixed(4)
          )
        : 0,
  };
}

function finalizeMap(map = {}) {
  const result = {};

  for (
    const [key, bucket]
    of Object.entries(map)
  ) {
    result[key] = finalizeBucket(
      bucket
    );
  }

  return result;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function buildTextReport(result) {
  const lines = [];

  lines.push(
    "=============================================="
  );

  lines.push(
    "TOP3 OFFICIAL BACKTEST"
  );

  lines.push(
    "=============================================="
  );

  lines.push("");

  lines.push(
    `Loteria.............: ${result.lotteryKey}`
  );

  lines.push(
    `Engine..............: ${result.engine}`
  );

  lines.push(
    `Histórico carregado.: ${result.historyLoaded}`
  );

  lines.push(
    `Casos elegíveis.....: ${result.eligibleCases}`
  );

  lines.push(
    `Casos avaliados.....: ${result.global.evaluated}`
  );

  lines.push(
    `Casos ignorados.....: ${result.skipped}`
  );

  lines.push(
    `Erros...............: ${result.global.errors}`
  );

  lines.push(
    `Período histórico...: ${result.historyPeriod.from} até ${result.historyPeriod.to}`
  );

  lines.push(
    `Período avaliado....: ${result.evaluationPeriod.from || "-"} até ${result.evaluationPeriod.to || "-"}`
  );

  lines.push(
    `TOP1................: ${result.global.top1Hits} (${formatPercent(result.global.top1Rate)})`
  );

  lines.push(
    `TOP3................: ${result.global.top3Hits} (${formatPercent(result.global.top3Rate)})`
  );

  lines.push(
    `Tempo total.........: ${result.tookMs} ms`
  );

  lines.push("");
  lines.push("POR HORÁRIO");

  for (
    const [hour, bucket]
    of Object.entries(result.byHour)
  ) {
    lines.push(
      `${hour.padEnd(8)} avaliados=${String(bucket.evaluated).padStart(5)} | TOP1=${formatPercent(bucket.top1Rate).padStart(8)} | TOP3=${formatPercent(bucket.top3Rate).padStart(8)} | erros=${bucket.errors}`
    );
  }

  lines.push("");
  lines.push("POR DIA DA SEMANA");

  for (
    const [weekday, bucket]
    of Object.entries(result.byWeekday)
  ) {
    lines.push(
      `${weekday.padEnd(3)} avaliados=${String(bucket.evaluated).padStart(5)} | TOP1=${formatPercent(bucket.top1Rate).padStart(8)} | TOP3=${formatPercent(bucket.top3Rate).padStart(8)} | erros=${bucket.errors}`
    );
  }

  lines.push("");
  lines.push("POR MÊS");

  for (
    const [month, bucket]
    of Object.entries(result.byMonth)
  ) {
    lines.push(
      `${month} avaliados=${String(bucket.evaluated).padStart(5)} | TOP1=${formatPercent(bucket.top1Rate).padStart(8)} | TOP3=${formatPercent(bucket.top3Rate).padStart(8)} | erros=${bucket.errors}`
    );
  }

  return lines.join("\n");
}

async function runOfficialBacktest(
  options = {},
  dependencies = {}
) {
  const startedAt = Date.now();

  const lotteryKey =
    normalizeLotteryKey(
      options.lotteryKey ||
      "PT_RIO"
    );

  const publicApi =
    dependencies.publicApi ||
    loadTop3PublicApi();

  const loadHistory =
    dependencies.readFullHistory ||
    readFullHistory;

  const loadMetadata =
    dependencies.readMetadata ||
    readMetadata;

  const computeTop3 =
    dependencies.computeTop3 ||
    computeStatisticalTop3V3;

  const history = sortDraws(
    await loadHistory(
      lotteryKey,
      dependencies.historyDependencies || {}
    ),
    publicApi
  );

  if (!history.length) {
    throw new Error(
      "Histórico TOP3 vazio."
    );
  }

  const metadataResult =
    await loadMetadata(
      lotteryKey,
      dependencies.historyDependencies || {}
    );

  const metadata =
    metadataResult?.data || null;

  if (
    dependencies.allowIncompleteSnapshot !== true &&
    (
      metadataResult?.exists !== true ||
      metadata?.bootstrapStatus !==
        "complete"
    )
  ) {
    throw new Error(
      "Histórico TOP3 não está marcado como completo."
    );
  }

  const minHistory = Number(
    options.minHistory || 100
  );

  const from =
    options.from || null;

  const to =
    options.to || null;

  const eligibleIndexes = [];

  for (
    let index = minHistory;
    index < history.length;
    index += 1
  ) {
    const draw = history[index];

    const ymd =
      publicApi.pickDrawYMD(draw);

    const hour =
      publicApi.pickDrawHour(draw);

    if (!ymd || !hour) {
      continue;
    }

    if (from && ymd < from) {
      continue;
    }

    if (to && ymd > to) {
      continue;
    }

    if (
      getFirstPrizeGroup(
        draw,
        publicApi
      ) == null
    ) {
      continue;
    }

    eligibleIndexes.push(index);
  }

  const selectedIndexes =
    options.limit
      ? eligibleIndexes.slice(
          0,
          Number(options.limit)
        )
      : eligibleIndexes;

  const globalBucket = {
    evaluated: 0,
    top1Hits: 0,
    top3Hits: 0,
    errors: 0,
  };

  const byHour = {};
  const byWeekday = {};
  const byMonth = {};

  let skipped = 0;
  let evaluationFrom = null;
  let evaluationTo = null;

  for (
    let position = 0;
    position < selectedIndexes.length;
    position += 1
  ) {
    const index =
      selectedIndexes[position];

    const targetDraw =
      history[index];

    const targetYmd =
      publicApi.pickDrawYMD(
        targetDraw
      );

    const targetHour =
      publicApi.pickDrawHour(
        targetDraw
      );

    const actualGroup =
      getFirstPrizeGroup(
        targetDraw,
        publicApi
      );

    const historyBefore =
      history.slice(0, index);

    const drawLast =
      historyBefore[
        historyBefore.length - 1
      ];

    if (
      !targetYmd ||
      !targetHour ||
      actualGroup == null ||
      !drawLast
    ) {
      skipped += 1;
      continue;
    }

    const weekday = String(
      new Date(
        `${targetYmd}T12:00:00Z`
      ).getUTCDay()
    );

    const month =
      targetYmd.slice(0, 7);

    const hourBucket =
      ensureBucket(
        byHour,
        normalizeHour(targetHour) ||
        targetHour
      );

    const weekdayBucket =
      ensureBucket(
        byWeekday,
        weekday
      );

    const monthBucket =
      ensureBucket(
        byMonth,
        month
      );

    try {
      const computed =
        computeTop3({
          lotteryKey,
          drawsRange:
            historyBefore,
          drawLast,
          PT_RIO_SCHEDULE_NORMAL,
          PT_RIO_SCHEDULE_WED_SAT,
          FEDERAL_SCHEDULE,
          topN: 3,
          targetYmdOverride:
            targetYmd,
          targetHourOverride:
            targetHour,
        });

      const predictionGroups =
        getPredictionGroups(
          computed
        );

      if (
        predictionGroups.length < 3
      ) {
        throw new Error(
          "Motor retornou menos de 3 grupos."
        );
      }

      const top1Hit =
        predictionGroups[0] ===
        actualGroup;

      const top3Hit =
        predictionGroups.includes(
          actualGroup
        );

      for (const bucket of [
        globalBucket,
        hourBucket,
        weekdayBucket,
        monthBucket,
      ]) {
        bucket.evaluated += 1;

        if (top1Hit) {
          bucket.top1Hits += 1;
        }

        if (top3Hit) {
          bucket.top3Hits += 1;
        }
      }

      evaluationFrom =
        evaluationFrom || targetYmd;

      evaluationTo = targetYmd;
    } catch (error) {
      globalBucket.errors += 1;
      hourBucket.errors += 1;
      weekdayBucket.errors += 1;
      monthBucket.errors += 1;

      if (
        dependencies.onCaseError
      ) {
        dependencies.onCaseError({
          index,
          targetYmd,
          targetHour,
          error,
        });
      }
    }

    const done = position + 1;

    if (
      options.progress !== false &&
      (
        done % 25 === 0 ||
        done === selectedIndexes.length
      )
    ) {
      console.log(
        `[BACKTEST] ${done}/${selectedIndexes.length} | avaliados=${globalBucket.evaluated} | erros=${globalBucket.errors}`
      );
    }
  }

  const result = {
    ok: true,
    lotteryKey,
    engine:
      "top3_statistical_v3",
    historySource:
      "snapshot",
    historyLoaded:
      history.length,
    eligibleCases:
      eligibleIndexes.length,
    selectedCases:
      selectedIndexes.length,
    skipped,
    minHistory,
    limit:
      options.limit || null,
    historyPeriod: {
      from:
        publicApi.pickDrawYMD(
          history[0]
        ) || null,
      to:
        publicApi.pickDrawYMD(
          history[
            history.length - 1
          ]
        ) || null,
    },
    evaluationPeriod: {
      from: evaluationFrom,
      to: evaluationTo,
    },
    global:
      finalizeBucket(
        globalBucket
      ),
    byHour:
      finalizeMap(byHour),
    byWeekday:
      finalizeMap(byWeekday),
    byMonth:
      finalizeMap(byMonth),
    metadata: {
      bootstrapStatus:
        metadata?.bootstrapStatus ||
        null,
      totalStored:
        Number(
          metadata?.totalDraws || 0
        ) || null,
      lastProcessedDrawId:
        metadata?.lastProcessedDrawId ||
        null,
    },
    tookMs:
      Date.now() - startedAt,
  };

  return result;
}

async function main() {
  const options = parseCliArgs(
    process.argv.slice(2)
  );

  console.log("");
  console.log(
    "===================================="
  );
  console.log(
    "TOP3 OFFICIAL BACKTEST"
  );
  console.log(
    "===================================="
  );
  console.log("");
  console.log(
    "Loteria............:",
    options.lotteryKey
  );
  console.log(
    "Limite.............:",
    options.limit || "TODOS"
  );
  console.log(
    "Histórico mínimo...:",
    options.minHistory
  );
  console.log(
    "Período............:",
    `${options.from || "início"} até ${options.to || "fim"}`
  );
  console.log("");

  const result =
    await runOfficialBacktest(
      options
    );

  const outputDir = path.resolve(
    options.outputDir
  );

  fs.mkdirSync(
    outputDir,
    {
      recursive: true,
    }
  );

  const suffix =
    options.limit
      ? `limit_${options.limit}`
      : "full";

  const jsonPath = path.join(
    outputDir,
    `top3_official_backtest_${suffix}.json`
  );

  const txtPath = path.join(
    outputDir,
    `top3_official_backtest_${suffix}.txt`
  );

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      result,
      null,
      2
    ),
    "utf8"
  );

  fs.writeFileSync(
    txtPath,
    buildTextReport(result),
    "utf8"
  );

  console.log("");
  console.log(
    buildTextReport(result)
  );
  console.log("");
  console.log(
    "JSON:",
    jsonPath
  );
  console.log(
    "TXT :",
    txtPath
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      error?.stack ||
      error?.message ||
      error
    );

    process.exit(1);
  });
}

module.exports = {
  parseCliArgs,
  sortDraws,
  getFirstPrizeGroup,
  getPredictionGroups,
  finalizeBucket,
  buildTextReport,
  runOfficialBacktest,
};
