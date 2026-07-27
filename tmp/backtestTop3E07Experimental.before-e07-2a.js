"use strict";

const fs = require("fs");
const path = require("path");

const {
  runOfficialBacktest,
} = require("./backtestTop3Official");

const {
  computeStatisticalTop3V4Experimental,
} = require("../engine/scoreEngineV4Experimental");

function parseIntegerFlag(
  flags,
  name,
  fallback
) {
  const prefix = `--${name}=`;

  const raw = flags.find(
    (flag) =>
      String(flag).startsWith(prefix)
  );

  if (!raw) {
    return fallback;
  }

  const value = Number(
    String(raw).slice(
      prefix.length
    )
  );

  return Number.isFinite(value)
    ? value
    : fallback;
}

function parseStringFlag(
  flags,
  name,
  fallback = null
) {
  const prefix = `--${name}=`;

  const raw = flags.find(
    (flag) =>
      String(flag).startsWith(prefix)
  );

  return raw
    ? String(raw).slice(
        prefix.length
      )
    : fallback;
}

function percent(value) {
  const number = Number(value || 0);

  return `${(
    number * 100
  ).toFixed(4)}%`;
}

async function main() {
  const argv =
    process.argv.slice(2);

  const lotteryKey =
    String(
      argv[0] || "PT_RIO"
    )
      .trim()
      .toUpperCase();

  const flags =
    argv.slice(1);

  const limit =
    parseIntegerFlag(
      flags,
      "limit",
      100
    );

  const minHistory =
    parseIntegerFlag(
      flags,
      "min-history",
      100
    );

  const from =
    parseStringFlag(
      flags,
      "from",
      null
    );

  const to =
    parseStringFlag(
      flags,
      "to",
      null
    );

  const outputDir =
    path.resolve(
      parseStringFlag(
        flags,
        "output-dir",
        "tmp"
      )
    );

  fs.mkdirSync(
    outputDir,
    {
      recursive: true,
    }
  );

  const commonOptions = {
    lotteryKey,
    limit,
    minHistory,
    from,
    to,
    telemetry: false,
    progress: true,
  };

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "E07 - BACKTEST COMPARATIVO"
  );
  console.log(
    "========================================"
  );
  console.log(
    "Loteria:",
    lotteryKey
  );
  console.log(
    "Limite:",
    limit
  );
  console.log(
    "Historico minimo:",
    minHistory
  );
  console.log("");

  console.log(
    "[1/2] Executando baseline V3..."
  );

  const baseline =
    await runOfficialBacktest(
      commonOptions
    );

  console.log("");
  console.log(
    "[2/2] Executando E07 experimental..."
  );

  const experimental =
    await runOfficialBacktest(
      commonOptions,
      {
        computeTop3:
          computeStatisticalTop3V4Experimental,
      }
    );

  const comparison = {
    ok: true,
    experiment: "E07",
    lotteryKey,
    limit,
    minHistory,
    baseline: {
      engine:
        "top3_statistical_v3",
      evaluated:
        baseline.global.evaluated,
      errors:
        baseline.global.errors,
      top1Hits:
        baseline.global.top1Hits,
      top1Rate:
        baseline.global.top1Rate,
      top3Hits:
        baseline.global.top3Hits,
      top3Rate:
        baseline.global.top3Rate,
    },
    experimental: {
      engine:
        "top3_v4_experimental_e07",
      evaluated:
        experimental.global.evaluated,
      errors:
        experimental.global.errors,
      top1Hits:
        experimental.global.top1Hits,
      top1Rate:
        experimental.global.top1Rate,
      top3Hits:
        experimental.global.top3Hits,
      top3Rate:
        experimental.global.top3Rate,
    },
    delta: {
      top1Hits:
        experimental.global.top1Hits -
        baseline.global.top1Hits,
      top1Rate:
        experimental.global.top1Rate -
        baseline.global.top1Rate,
      top3Hits:
        experimental.global.top3Hits -
        baseline.global.top3Hits,
      top3Rate:
        experimental.global.top3Rate -
        baseline.global.top3Rate,
    },
    byHour: {
      baseline:
        baseline.byHour,
      experimental:
        experimental.byHour,
    },
    periods: {
      history:
        baseline.historyPeriod,
      evaluation:
        baseline.evaluationPeriod,
    },
    generatedAt:
      new Date().toISOString(),
  };

  const suffix =
    limit
      ? `limit_${limit}`
      : "full";

  const jsonPath =
    path.join(
      outputDir,
      `e07_comparison_${lotteryKey}_${suffix}.json`
    );

  const textPath =
    path.join(
      outputDir,
      `e07_comparison_${lotteryKey}_${suffix}.txt`
    );

  const lines = [
    "==============================================",
    "E07 - COMPARACAO V3 x TRANSICOES",
    "==============================================",
    "",
    `Loteria.............: ${lotteryKey}`,
    `Casos avaliados.....: ${baseline.global.evaluated}`,
    `Historico minimo....: ${minHistory}`,
    `Periodo avaliado....: ${baseline.evaluationPeriod.from || "-"} ate ${baseline.evaluationPeriod.to || "-"}`,
    "",
    "BASELINE V3",
    `TOP1................: ${baseline.global.top1Hits} (${percent(baseline.global.top1Rate)})`,
    `TOP3................: ${baseline.global.top3Hits} (${percent(baseline.global.top3Rate)})`,
    `Erros...............: ${baseline.global.errors}`,
    "",
    "EXPERIMENTAL E07",
    `TOP1................: ${experimental.global.top1Hits} (${percent(experimental.global.top1Rate)})`,
    `TOP3................: ${experimental.global.top3Hits} (${percent(experimental.global.top3Rate)})`,
    `Erros...............: ${experimental.global.errors}`,
    "",
    "DELTA E07 - V3",
    `TOP1 acertos........: ${comparison.delta.top1Hits}`,
    `TOP1 taxa...........: ${percent(comparison.delta.top1Rate)}`,
    `TOP3 acertos........: ${comparison.delta.top3Hits}`,
    `TOP3 taxa...........: ${percent(comparison.delta.top3Rate)}`,
    "",
    "POR HORARIO - E07",
    ...Object.entries(
      experimental.byHour || {}
    ).map(
      ([hour, bucket]) =>
        `${hour} | avaliados=${bucket.evaluated} | TOP1=${percent(bucket.top1Rate)} | TOP3=${percent(bucket.top3Rate)} | erros=${bucket.errors}`
    ),
    "",
    "Nenhuma alteracao foi aplicada a producao.",
    "Nenhum peso oficial da V3 foi alterado.",
    "Nenhum deploy ou commit foi realizado.",
  ];

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      comparison,
      null,
      2
    ),
    "utf8"
  );

  fs.writeFileSync(
    textPath,
    lines.join("\n"),
    "utf8"
  );

  console.log("");
  console.log(
    lines.join("\n")
  );

  console.log("");
  console.log(
    "JSON:",
    jsonPath
  );

  console.log(
    "TXT :",
    textPath
  );
}

if (
  require.main === module
) {
  main().catch(
    (error) => {
      console.error(
        error?.stack ||
        error?.message ||
        error
      );

      process.exit(1);
    }
  );
}

module.exports = {
  main,
};
