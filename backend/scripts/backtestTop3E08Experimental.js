"use strict";

const fs = require("fs");
const path = require("path");

const {
  runOfficialBacktest,
} = require("./backtestTop3Official");

const {
  computeStatisticalTop3E08Experimental,
} = require("../engine/scoreEngineE08Experimental");

const {
  readFullHistory,
  readMetadata,
} = require("../engine/top3HistoryRepository");

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

function percent(value) {
  return (
    `${Number(value || 0).toFixed(4)}%`
  );
}

function signed(value) {
  const number = Number(value || 0);

  return number > 0
    ? `+${number}`
    : String(number);
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
      0
    );

  const minHistory =
    parseIntegerFlag(
      flags,
      "min-history",
      100
    );

  const outputDir =
    path.resolve("tmp");

  fs.mkdirSync(
    outputDir,
    {
      recursive: true,
    }
  );

  const options = {
    lotteryKey,
    limit,
    minHistory,
    telemetry: false,
    progress: true,
  };

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "E08 - BACKTEST DE RERANKING"
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
    "[SNAPSHOT] Carregando histórico compartilhado..."
  );

  const sharedHistory =
    await readFullHistory(
      lotteryKey,
      {}
    );

  const sharedMetadata =
    await readMetadata(
      lotteryKey,
      {}
    );

  const sharedDependencies = {
    readFullHistory:
      async () => sharedHistory,
    readMetadata:
      async () => sharedMetadata,
  };

  console.log(
    `[SNAPSHOT] Sorteios congelados: ${sharedHistory.length}`
  );

  console.log("");
  console.log(
    "[1/2] Executando V3..."
  );

  const baseline =
    await runOfficialBacktest(
      options,
      sharedDependencies
    );

  console.log("");
  console.log(
    "[2/2] Executando E08..."
  );

  const experimental =
    await runOfficialBacktest(
      options,
      {
        ...sharedDependencies,
        computeTop3:
          computeStatisticalTop3E08Experimental,
      }
    );

  const top3Invariant =
    (
      baseline.global.top3Hits ===
      experimental.global.top3Hits
    );

  const evaluatedInvariant =
    (
      baseline.global.evaluated ===
      experimental.global.evaluated
    );

  const errorInvariant =
    (
      baseline.global.errors ===
      experimental.global.errors
    );

  if (!evaluatedInvariant) {
    throw new Error(
      "Quantidade avaliada divergiu entre V3 e E08."
    );
  }

  if (!errorInvariant) {
    throw new Error(
      "Quantidade de erros divergiu entre V3 e E08."
    );
  }

  if (!top3Invariant) {
    throw new Error(
      "O E08 alterou o conjunto TOP3. A invariancia falhou."
    );
  }

  const comparison = {
    ok: true,
    experiment: "E08",
    hypothesis:
      "Reordenar apenas os tres candidatos da V3 usando frequencia do mesmo horario.",
    lotteryKey,
    limit,
    minHistory,
    invariants: {
      evaluatedEqual:
        evaluatedInvariant,
      errorsEqual:
        errorInvariant,
      top3HitsEqual:
        top3Invariant,
      candidateSetPreserved:
        top3Invariant,
    },
    baseline: {
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
        Number(
          (
            experimental.global.top1Rate -
            baseline.global.top1Rate
          ).toFixed(4)
        ),
      top3Hits:
        experimental.global.top3Hits -
        baseline.global.top3Hits,
      top3Rate:
        Number(
          (
            experimental.global.top3Rate -
            baseline.global.top3Rate
          ).toFixed(4)
        ),
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
      `e08_comparison_${lotteryKey}_${suffix}.json`
    );

  const textPath =
    path.join(
      outputDir,
      `e08_comparison_${lotteryKey}_${suffix}.txt`
    );

  const hourLines = [];

  const hours = Array.from(
    new Set([
      ...Object.keys(
        baseline.byHour || {}
      ),
      ...Object.keys(
        experimental.byHour || {}
      ),
    ])
  ).sort();

  for (const hour of hours) {
    const base =
      baseline.byHour?.[hour] || {};

    const exp =
      experimental.byHour?.[hour] || {};

    const deltaHits =
      Number(exp.top1Hits || 0) -
      Number(base.top1Hits || 0);

    const deltaRate =
      Number(exp.top1Rate || 0) -
      Number(base.top1Rate || 0);

    hourLines.push(
      `${hour} | avaliados=${base.evaluated || 0} | V3 TOP1=${percent(base.top1Rate)} | E08 TOP1=${percent(exp.top1Rate)} | delta=${signed(deltaHits)} acertos (${percent(deltaRate)})`
    );
  }

  const lines = [
    "================================================",
    "E08 - V3 ORIGINAL x V3 REORDENADA",
    "================================================",
    "",
    `Loteria.............: ${lotteryKey}`,
    `Casos avaliados.....: ${baseline.global.evaluated}`,
    `Historico minimo....: ${minHistory}`,
    `Periodo avaliado....: ${baseline.evaluationPeriod.from || "-"} ate ${baseline.evaluationPeriod.to || "-"}`,
    "",
    "HIPOTESE",
    "Reordenar somente os tres candidatos escolhidos pela V3",
    "usando a frequencia historica do mesmo horario.",
    "",
    "BASELINE V3",
    `TOP1................: ${baseline.global.top1Hits} (${percent(baseline.global.top1Rate)})`,
    `TOP3................: ${baseline.global.top3Hits} (${percent(baseline.global.top3Rate)})`,
    `Erros...............: ${baseline.global.errors}`,
    "",
    "EXPERIMENTAL E08",
    `TOP1................: ${experimental.global.top1Hits} (${percent(experimental.global.top1Rate)})`,
    `TOP3................: ${experimental.global.top3Hits} (${percent(experimental.global.top3Rate)})`,
    `Erros...............: ${experimental.global.errors}`,
    "",
    "DELTA E08 - V3",
    `TOP1 acertos........: ${signed(comparison.delta.top1Hits)}`,
    `TOP1 taxa...........: ${percent(comparison.delta.top1Rate)}`,
    `TOP3 acertos........: ${signed(comparison.delta.top3Hits)}`,
    `TOP3 taxa...........: ${percent(comparison.delta.top3Rate)}`,
    "",
    "INVARIANTES",
    `Mesma quantidade avaliada.: ${evaluatedInvariant ? "OK" : "FALHA"}`,
    `Mesma quantidade de erros.: ${errorInvariant ? "OK" : "FALHA"}`,
    `Mesmo conjunto TOP3.......: ${top3Invariant ? "OK" : "FALHA"}`,
    "",
    "TOP1 POR HORARIO",
    ...hourLines,
    "",
    "Nenhuma alteracao foi aplicada a producao.",
    "Nenhum peso oficial da V3 foi alterado.",
    "Nenhum candidato da V3 foi adicionado ou removido.",
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

if (require.main === module) {
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
