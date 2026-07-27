"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const {
  runOfficialBacktest,
} = require(
  "../backend/scripts/backtestTop3Official"
);

const {
  computeStatisticalTop3V3,
} = require(
  "../backend/engine/scoreEngineUnified"
);

const OUTPUT_JSON = path.resolve(
  "tmp/TOP3_V3_INJECTION_EQUIVALENCE.json"
);

const OUTPUT_TXT = path.resolve(
  "tmp/TOP3_V3_INJECTION_EQUIVALENCE.txt"
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

function normalizeCase(item = {}) {
  return {
    caseNumber:
      item.caseNumber ?? null,
    historyIndex:
      item.historyIndex ?? null,
    target:
      stableClone(item.target ?? null),
    history:
      stableClone(item.history ?? null),
    actual:
      stableClone(item.actual ?? null),
    prediction:
      stableClone(item.prediction ?? null),
    candidates:
      stableClone(item.candidates ?? null),
  };
}

function normalizeResult(result = {}) {
  return {
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
      stableClone(
        result.historyPeriod ?? null
      ),
    evaluationPeriod:
      stableClone(
        result.evaluationPeriod ?? null
      ),
    global:
      stableClone(result.global ?? null),
    byHour:
      stableClone(result.byHour ?? null),
    byWeekday:
      stableClone(
        result.byWeekday ?? null
      ),
    byMonth:
      stableClone(result.byMonth ?? null),
    telemetryCases:
      (
        Array.isArray(
          result.telemetryCases
        )
          ? result.telemetryCases
          : []
      ).map(normalizeCase),
  };
}

function compareCases(
  nativeCases,
  injectedCases
) {
  const maxLength = Math.max(
    nativeCases.length,
    injectedCases.length
  );

  const differences = [];

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
    await runOfficialBacktest(options);

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

  const nativeNormalized =
    normalizeResult(nativeResult);

  const injectedNormalized =
    normalizeResult(injectedResult);

  const caseDifferences =
    compareCases(
      nativeNormalized.telemetryCases,
      injectedNormalized.telemetryCases
    );

  let aggregateEquivalent = true;
  let aggregateError = null;

  const nativeAggregate = {
    ...nativeNormalized,
    telemetryCases: undefined,
  };

  const injectedAggregate = {
    ...injectedNormalized,
    telemetryCases: undefined,
  };

  try {
    assert.deepStrictEqual(
      injectedAggregate,
      nativeAggregate
    );
  } catch (error) {
    aggregateEquivalent = false;
    aggregateError = error.message;
  }

  const casesEquivalent =
    caseDifferences.length === 0;

  const fullyEquivalent =
    aggregateEquivalent &&
    casesEquivalent;

  const report = {
    validation:
      "TOP3_V3_NATIVE_VS_INJECTED",
    lotteryKey:
      options.lotteryKey,
    limit:
      options.limit,
    minHistory:
      options.minHistory,
    telemetry:
      options.telemetry,
    aggregateEquivalent,
    casesEquivalent,
    fullyEquivalent,
    native: {
      tookMs: nativeTookMs,
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
      telemetryCases:
        nativeNormalized
          .telemetryCases.length,
    },
    injected: {
      tookMs: injectedTookMs,
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
      telemetryCases:
        injectedNormalized
          .telemetryCases.length,
    },
    aggregateError,
    differenceCount:
      caseDifferences.length,
    caseDifferences:
      caseDifferences.slice(0, 20),
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
    "===== VALIDAÇÃO DA INJEÇÃO — V3 NATIVO × V3 INJETADO =====",
    "",
    `Loteria.................: ${report.lotteryKey}`,
    `Casos solicitados.......: ${report.limit}`,
    `Histórico mínimo........: ${report.minHistory}`,
    "",
    "===== CAMINHO NATIVO =====",
    `Casos avaliados.........: ${report.native.evaluated}`,
    `Acertos Top1............: ${report.native.top1Hits}`,
    `Acertos Top3............: ${report.native.top3Hits}`,
    `Taxa Top1...............: ${report.native.top1Rate}%`,
    `Taxa Top3...............: ${report.native.top3Rate}%`,
    `Casos de telemetria.....: ${report.native.telemetryCases}`,
    `Tempo...................: ${report.native.tookMs} ms`,
    "",
    "===== CAMINHO INJETADO =====",
    `Casos avaliados.........: ${report.injected.evaluated}`,
    `Acertos Top1............: ${report.injected.top1Hits}`,
    `Acertos Top3............: ${report.injected.top3Hits}`,
    `Taxa Top1...............: ${report.injected.top1Rate}%`,
    `Taxa Top3...............: ${report.injected.top3Rate}%`,
    `Casos de telemetria.....: ${report.injected.telemetryCases}`,
    `Tempo...................: ${report.injected.tookMs} ms`,
    "",
    "===== EQUIVALÊNCIA =====",
    (
      "Métricas agregadas......: " +
      (
        aggregateEquivalent
          ? "IDÊNTICAS"
          : "DIVERGENTES"
      )
    ),
    (
      "Casos individuais.......: " +
      (
        casesEquivalent
          ? "IDÊNTICOS"
          : "DIVERGENTES"
      )
    ),
    `Diferenças encontradas..: ${caseDifferences.length}`,
    (
      "Resultado final.........: " +
      (
        fullyEquivalent
          ? "APROVADO"
          : "REPROVADO"
      )
    ),
    "",
    "Nenhum algoritmo foi alterado.",
    "Nenhum peso foi alterado.",
    "Nenhum commit foi realizado.",
    "Nenhum deploy foi realizado.",
  ];

  const text = lines.join("\n");

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
