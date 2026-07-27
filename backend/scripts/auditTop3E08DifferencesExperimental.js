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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function normalizeGroup(value) {
  const number = Number(value);

  return (
    Number.isFinite(number) &&
    number >= 1 &&
    number <= 25
  )
    ? number
    : null;
}

function makeCaseKey(item) {
  const ymd =
    String(
      item?.target?.ymd ?? ""
    ).trim();

  const hour =
    String(
      item?.target?.hour ?? ""
    ).trim();

  return `${ymd}|${hour}`;
}

function formatGroups(groups) {
  return safeArray(groups)
    .map(normalizeGroup)
    .filter(Number.isFinite)
    .map(
      (group) =>
        `G${String(group).padStart(2, "0")}`
    )
    .join(" > ");
}

function orderChanged(
  baselineGroups,
  experimentalGroups
) {
  const a =
    safeArray(baselineGroups)
      .map(normalizeGroup)
      .filter(Number.isFinite);

  const b =
    safeArray(experimentalGroups)
      .map(normalizeGroup)
      .filter(Number.isFinite);

  return (
    a.length !== b.length ||
    a.some(
      (value, index) =>
        value !== b[index]
    )
  );
}

async function main() {
  const lotteryKey =
    String(
      process.argv[2] || "PT_RIO"
    )
      .trim()
      .toUpperCase();

  const limit = Number(
    process.argv[3] || 500
  );

  const minHistory = Number(
    process.argv[4] || 100
  );

  if (
    !Number.isInteger(limit) ||
    limit <= 0
  ) {
    throw new Error(
      "Limite inválido."
    );
  }

  if (
    !Number.isInteger(minHistory) ||
    minHistory <= 0
  ) {
    throw new Error(
      "Histórico mínimo inválido."
    );
  }

  const outputDir =
    path.resolve("tmp");

  fs.mkdirSync(
    outputDir,
    {
      recursive: true,
    }
  );

  const outputJson =
    path.join(
      outputDir,
      `e08_differences_limit_${limit}.json`
    );

  const outputTxt =
    path.join(
      outputDir,
      `e08_differences_limit_${limit}.txt`
    );

  console.log("");
  console.log(
    "Carregando snapshot histórico único..."
  );

  const history =
    await readFullHistory(
      lotteryKey
    );

  const metadata =
    await readMetadata(
      lotteryKey
    );

  const sharedDependencies = {
    readFullHistory:
      async () => history,
    readMetadata:
      async () => metadata,
    allowIncompleteSnapshot: true,
  };

  const options = {
    lotteryKey,
    limit,
    minHistory,
    telemetry: true,
    outputDir,
  };

  console.log("");
  console.log(
    "[1/2] Executando V3 com telemetria..."
  );

  const baseline =
    await runOfficialBacktest(
      options,
      sharedDependencies
    );

  console.log("");
  console.log(
    "[2/2] Executando E08 com telemetria..."
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

  const baselineCases =
    safeArray(
      baseline?.telemetry?.cases
    );

  const experimentalCases =
    safeArray(
      experimental?.telemetry?.cases
    );

  if (
    baselineCases.length !==
    experimentalCases.length
  ) {
    throw new Error(
      "Quantidade de casos de telemetria divergiu."
    );
  }

  const baselineByKey =
    new Map(
      baselineCases.map(
        (item) => [
          makeCaseKey(item),
          item,
        ]
      )
    );

  const differences = [];

  for (
    const experimentalCase
    of experimentalCases
  ) {
    const key =
      makeCaseKey(
        experimentalCase
      );

    const baselineCase =
      baselineByKey.get(key);

    if (!baselineCase) {
      throw new Error(
        `Caso baseline não localizado: ${key}`
      );
    }

    const baselineGroups =
      safeArray(
        baselineCase
          ?.prediction
          ?.groups
      );

    const experimentalGroups =
      safeArray(
        experimentalCase
          ?.prediction
          ?.groups
      );

    if (
      !orderChanged(
        baselineGroups,
        experimentalGroups
      )
    ) {
      continue;
    }

    const baselineTop1Hit =
      baselineCase
        ?.prediction
        ?.top1Hit === true;

    const experimentalTop1Hit =
      experimentalCase
        ?.prediction
        ?.top1Hit === true;

    let outcome = "NEUTRAL";

    if (
      !baselineTop1Hit &&
      experimentalTop1Hit
    ) {
      outcome = "GAIN";
    }
    else if (
      baselineTop1Hit &&
      !experimentalTop1Hit
    ) {
      outcome = "LOSS";
    }

    differences.push({
      caseKey: key,
      date:
        baselineCase
          ?.target
          ?.ymd || null,
      hour:
        baselineCase
          ?.target
          ?.hour || null,
      actualGroup:
        normalizeGroup(
          baselineCase
            ?.actual
            ?.group
        ),
      baselineGroups:
        baselineGroups
          .map(normalizeGroup)
          .filter(Number.isFinite),
      experimentalGroups:
        experimentalGroups
          .map(normalizeGroup)
          .filter(Number.isFinite),
      baselineTop1Hit,
      experimentalTop1Hit,
      baselineTop3Hit:
        baselineCase
          ?.prediction
          ?.top3Hit === true,
      experimentalTop3Hit:
        experimentalCase
          ?.prediction
          ?.top3Hit === true,
      outcome,
    });
  }

  const gains =
    differences.filter(
      (item) =>
        item.outcome === "GAIN"
    );

  const losses =
    differences.filter(
      (item) =>
        item.outcome === "LOSS"
    );

  const neutral =
    differences.filter(
      (item) =>
        item.outcome === "NEUTRAL"
    );

  const byHour = {};

  for (const item of differences) {
    const hour =
      item.hour || "SEM_HORARIO";

    if (!byHour[hour]) {
      byHour[hour] = {
        changed: 0,
        gains: 0,
        losses: 0,
        neutral: 0,
        net: 0,
      };
    }

    byHour[hour].changed += 1;

    if (item.outcome === "GAIN") {
      byHour[hour].gains += 1;
      byHour[hour].net += 1;
    }
    else if (
      item.outcome === "LOSS"
    ) {
      byHour[hour].losses += 1;
      byHour[hour].net -= 1;
    }
    else {
      byHour[hour].neutral += 1;
    }
  }

  const report = {
    experiment: "E08.7",
    lotteryKey,
    requestedLimit: limit,
    minHistory,
    evaluated:
      baseline?.global?.evaluated || 0,
    invariants: {
      evaluatedEqual:
        baseline?.global?.evaluated ===
        experimental?.global?.evaluated,
      errorsEqual:
        baseline?.global?.errors ===
        experimental?.global?.errors,
      top3HitsEqual:
        baseline?.global?.top3Hits ===
        experimental?.global?.top3Hits,
      telemetryCasesEqual:
        baselineCases.length ===
        experimentalCases.length,
    },
    baseline: {
      top1Hits:
        baseline?.global?.top1Hits || 0,
      top3Hits:
        baseline?.global?.top3Hits || 0,
      errors:
        baseline?.global?.errors || 0,
    },
    experimental: {
      top1Hits:
        experimental?.global?.top1Hits || 0,
      top3Hits:
        experimental?.global?.top3Hits || 0,
      errors:
        experimental?.global?.errors || 0,
    },
    summary: {
      changedCases:
        differences.length,
      gains:
        gains.length,
      losses:
        losses.length,
      neutral:
        neutral.length,
      netTop1:
        gains.length -
        losses.length,
    },
    byHour,
    differences,
    generatedAt:
      new Date().toISOString(),
  };

  fs.writeFileSync(
    outputJson,
    JSON.stringify(
      report,
      null,
      2
    ),
    "utf8"
  );

  const lines = [
    "================================================",
    "E08.7 - AUDITORIA DE DIFERENÇAS",
    "================================================",
    "",
    `Loteria...............: ${lotteryKey}`,
    `Casos avaliados.......: ${report.evaluated}`,
    `Histórico mínimo......: ${minHistory}`,
    "",
    "RESUMO",
    `Ordem alterada........: ${report.summary.changedCases}`,
    `Ganhos TOP1...........: ${report.summary.gains}`,
    `Perdas TOP1...........: ${report.summary.losses}`,
    `Neutros...............: ${report.summary.neutral}`,
    `Saldo TOP1............: ${report.summary.netTop1 >= 0 ? "+" : ""}${report.summary.netTop1}`,
    "",
    "INVARIANTES",
    `Mesma avaliação.......: ${report.invariants.evaluatedEqual ? "OK" : "FALHA"}`,
    `Mesmos erros..........: ${report.invariants.errorsEqual ? "OK" : "FALHA"}`,
    `Mesmo TOP3............: ${report.invariants.top3HitsEqual ? "OK" : "FALHA"}`,
    `Mesma telemetria......: ${report.invariants.telemetryCasesEqual ? "OK" : "FALHA"}`,
    "",
    "POR HORÁRIO",
  ];

  for (
    const hour
    of Object.keys(byHour).sort()
  ) {
    const bucket = byHour[hour];

    lines.push(
      `${hour} | mudanças=${bucket.changed} | ganhos=${bucket.gains} | perdas=${bucket.losses} | neutros=${bucket.neutral} | saldo=${bucket.net >= 0 ? "+" : ""}${bucket.net}`
    );
  }

  lines.push("");
  lines.push(
    "CASOS COM GANHO OU PERDA"
  );

  for (
    const item
    of differences.filter(
      (entry) =>
        entry.outcome !== "NEUTRAL"
    )
  ) {
    lines.push(
      [
        item.date,
        item.hour,
        item.outcome,
        `real=G${String(item.actualGroup).padStart(2, "0")}`,
        `V3=${formatGroups(item.baselineGroups)}`,
        `E08=${formatGroups(item.experimentalGroups)}`,
      ].join(" | ")
    );
  }

  fs.writeFileSync(
    outputTxt,
    lines.join("\n") + "\n",
    "utf8"
  );

  console.log("");
  console.log(lines.join("\n"));

  console.log("");
  console.log(
    "Arquivos gerados:"
  );
  console.log(outputJson);
  console.log(outputTxt);
}

main().catch((error) => {
  console.error("");
  console.error(
    "E08.7 FALHOU:",
    error?.stack ||
    error?.message ||
    error
  );

  process.exitCode = 1;
});
