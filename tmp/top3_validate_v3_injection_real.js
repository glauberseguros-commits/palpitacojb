"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const PROJECT_ROOT = path.resolve(
  __dirname,
  ".."
);

const {
  runOfficialBacktest,
} = require(
  path.join(
    PROJECT_ROOT,
    "backend",
    "scripts",
    "backtestTop3Official"
  )
);

const {
  computeStatisticalTop3V3,
} = require(
  path.join(
    PROJECT_ROOT,
    "backend",
    "engine",
    "scoreEngineUnified"
  )
);

const OUTPUT_JSON = path.join(
  PROJECT_ROOT,
  "tmp",
  "TOP3_V3_INJECTION_EQUIVALENCE_REAL.json"
);

const OUTPUT_TXT = path.join(
  PROJECT_ROOT,
  "tmp",
  "TOP3_V3_INJECTION_EQUIVALENCE_REAL.txt"
);

function stableClone(value) {
  if (Array.isArray(value)) {
    return value.map(stableClone);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableClone(
          value[key]
        );

        return result;
      }, {});
  }

  return value;
}

function getTelemetryCases(result = {}) {
  const cases =
    result &&
    result.telemetry &&
    Array.isArray(result.telemetry.cases)
      ? result.telemetry.cases
      : [];

  return cases;
}

function normalizeCase(item = {}) {
  return stableClone({
    caseNumber:
      item.caseNumber ?? null,

    historyIndex:
      item.historyIndex ?? null,

    target:
      item.target ?? null,

    history:
      item.history ?? null,

    actual:
      item.actual ?? null,

    prediction:
      item.prediction ?? null,

    candidates:
      item.candidates ?? null,
  });
}

function normalizeAggregate(result = {}) {
  return stableClone({
    lotteryKey:
      result.lotteryKey ?? null,

    engine:
      result.engine ?? null,

    historySource:
      result.historySource ?? null,

    historyLoaded:
      result.historyLoaded ?? null,

    eligibleCases:
      result.eligibleCases ?? null,

    selectedCases:
      result.selectedCases ?? null,

    skipped:
      result.skipped ?? null,

    minHistory:
      result.minHistory ?? null,

    limit:
      result.limit ?? null,

    historyPeriod:
      result.historyPeriod ?? null,

    evaluationPeriod:
      result.evaluationPeriod ?? null,

    global:
      result.global ?? null,

    byHour:
      result.byHour ?? null,

    byWeekday:
      result.byWeekday ?? null,

    byMonth:
      result.byMonth ?? null,
  });
}

function compareCases(
  nativeCases,
  injectedCases
) {
  const differences = [];

  const maxLength = Math.max(
    nativeCases.length,
    injectedCases.length
  );

  for (
    let index = 0;
    index < maxLength;
    index += 1
  ) {
    const nativeCase =
      nativeCases[index] ?? null;

    const injectedCase =
      injectedCases[index] ?? null;

    try {
      assert.deepStrictEqual(
        injectedCase,
        nativeCase
      );
    } catch (error) {
      differences.push({
        position: index + 1,
        nativeCase,
        injectedCase,
        message: error.message,
      });
    }
  }

  return differences;
}

async function main() {
  const options = {
    lotteryKey: "PT_RIO",
    limit: 100,
    minHistory: 100,
    telemetry: true,
  };

  console.log(
    "Executando V3 pelo caminho nativo..."
  );

  const nativeStartedAt = Date.now();

  const nativeResult =
    await runOfficialBacktest(
      options
    );

  const nativeTookMs =
    Date.now() - nativeStartedAt;

  console.log(
    "Executando V3 pelo ponto de injeção..."
  );

  const injectedStartedAt = Date.now();

  const injectedResult =
    await runOfficialBacktest(
      options,
      {
        computeTop3:
          computeStatisticalTop3V3,
      }
    );

  const injectedTookMs =
    Date.now() - injectedStartedAt;

  const nativeCases =
    getTelemetryCases(
      nativeResult
    ).map(normalizeCase);

  const injectedCases =
    getTelemetryCases(
      injectedResult
    ).map(normalizeCase);

  const nativeTelemetryEnabled =
    nativeResult?.telemetry?.enabled === true;

  const injectedTelemetryEnabled =
    injectedResult?.telemetry?.enabled === true;

  const telemetryCountValid =
    nativeCases.length === options.limit &&
    injectedCases.length === options.limit;

  const differences =
    compareCases(
      nativeCases,
      injectedCases
    );

  let aggregateEquivalent = true;
  let aggregateError = null;

  try {
    assert.deepStrictEqual(
      normalizeAggregate(
        injectedResult
      ),
      normalizeAggregate(
        nativeResult
      )
    );
  } catch (error) {
    aggregateEquivalent = false;
    aggregateError = error.message;
  }

  const casesEquivalent =
    telemetryCountValid &&
    differences.length === 0;

  const fullyEquivalent =
    nativeTelemetryEnabled &&
    injectedTelemetryEnabled &&
    telemetryCountValid &&
    aggregateEquivalent &&
    casesEquivalent;

  const report = {
    validation:
      "TOP3_V3_NATIVE_VS_INJECTED_REAL",

    lotteryKey:
      options.lotteryKey,

    requestedCases:
      options.limit,

    telemetry: {
      nativeEnabled:
        nativeTelemetryEnabled,

      injectedEnabled:
        injectedTelemetryEnabled,

      nativeCases:
        nativeCases.length,

      injectedCases:
        injectedCases.length,

      countValid:
        telemetryCountValid,
    },

    aggregateEquivalent,
    casesEquivalent,
    fullyEquivalent,

    native: {
      tookMs:
        nativeTookMs,

      evaluated:
        nativeResult?.global
          ?.evaluated ?? null,

      top1Hits:
        nativeResult?.global
          ?.top1Hits ?? null,

      top3Hits:
        nativeResult?.global
          ?.top3Hits ?? null,

      top1Rate:
        nativeResult?.global
          ?.top1Rate ?? null,

      top3Rate:
        nativeResult?.global
          ?.top3Rate ?? null,
    },

    injected: {
      tookMs:
        injectedTookMs,

      evaluated:
        injectedResult?.global
          ?.evaluated ?? null,

      top1Hits:
        injectedResult?.global
          ?.top1Hits ?? null,

      top3Hits:
        injectedResult?.global
          ?.top3Hits ?? null,

      top1Rate:
        injectedResult?.global
          ?.top1Rate ?? null,

      top3Rate:
        injectedResult?.global
          ?.top3Rate ?? null,
    },

    aggregateError,

    differenceCount:
      differences.length,

    firstDifferences:
      differences.slice(0, 20),
  };

  fs.writeFileSync(
    OUTPUT_JSON,
    JSON.stringify(
      report,
      null,
      2
    ),
    "utf8"
  );

  const lines = [
    "===== VALIDAÇÃO REAL — V3 NATIVO × V3 INJETADO =====",
    "",
    `Loteria...................: ${report.lotteryKey}`,
    `Casos solicitados.........: ${report.requestedCases}`,
    "",
    "===== TELEMETRIA =====",
    `Nativa habilitada.........: ${report.telemetry.nativeEnabled ? "SIM" : "NÃO"}`,
    `Injetada habilitada.......: ${report.telemetry.injectedEnabled ? "SIM" : "NÃO"}`,
    `Casos nativos.............: ${report.telemetry.nativeCases}`,
    `Casos injetados...........: ${report.telemetry.injectedCases}`,
    `Contagem válida...........: ${report.telemetry.countValid ? "SIM" : "NÃO"}`,
    "",
    "===== RESULTADO NATIVO =====",
    `Avaliados.................: ${report.native.evaluated}`,
    `Top1......................: ${report.native.top1Hits} (${report.native.top1Rate}%)`,
    `Top3......................: ${report.native.top3Hits} (${report.native.top3Rate}%)`,
    `Tempo.....................: ${report.native.tookMs} ms`,
    "",
    "===== RESULTADO INJETADO =====",
    `Avaliados.................: ${report.injected.evaluated}`,
    `Top1......................: ${report.injected.top1Hits} (${report.injected.top1Rate}%)`,
    `Top3......................: ${report.injected.top3Hits} (${report.injected.top3Rate}%)`,
    `Tempo.....................: ${report.injected.tookMs} ms`,
    "",
    "===== EQUIVALÊNCIA =====",
    `Métricas agregadas........: ${report.aggregateEquivalent ? "IDÊNTICAS" : "DIVERGENTES"}`,
    `Casos individuais.........: ${report.casesEquivalent ? "IDÊNTICOS" : "DIVERGENTES"}`,
    `Diferenças encontradas....: ${report.differenceCount}`,
    `Resultado final...........: ${report.fullyEquivalent ? "APROVADO" : "REPROVADO"}`,
    "",
    "Nenhum algoritmo foi alterado.",
    "Nenhum peso foi alterado.",
    "Nenhum commit foi realizado.",
    "Nenhum deploy foi realizado.",
  ];

  const text =
    lines.join("\n");

  fs.writeFileSync(
    OUTPUT_TXT,
    text,
    "utf8"
  );

  console.log("");
  console.log(text);

  if (!fullyEquivalent) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    "ERRO NA VALIDAÇÃO:",
    error?.stack ||
    error?.message ||
    error
  );

  process.exit(1);
});
