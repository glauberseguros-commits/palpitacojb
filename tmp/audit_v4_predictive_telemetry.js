"use strict";

const fs = require("fs");

const {
  runOfficialBacktest,
} = require("../backend/scripts/backtestTop3Official");

const {
  computeStatisticalTop3V4Experimental,
} = require("../backend/engine/scoreEngineV4Experimental");

const intercepted = [];

async function main() {
  const result = await runOfficialBacktest(
    {
      lotteryKey: "PT_RIO",
      limit: 3,
      minHistory: 100,
      telemetry: true,
    },
    {
      computeTop3(input) {
        const output =
          computeStatisticalTop3V4Experimental(input);

        intercepted.push({
          inputKeys: Object.keys(input || {}),
          targetYmd: input?.targetYmdOverride ?? null,
          targetHour: input?.targetHourOverride ?? null,
          outputKeys:
            output && typeof output === "object"
              ? Object.keys(output)
              : [],
          topType: Array.isArray(output?.top)
            ? "array"
            : typeof output?.top,
          topSample: Array.isArray(output?.top)
            ? output.top.slice(0, 3)
            : output?.top ?? null,
          experimental: output?.experimental ?? null,
        });

        return output;
      },
    }
  );

  const telemetryCases =
    Array.isArray(result?.telemetry?.cases)
      ? result.telemetry.cases
      : [];

  const report = {
    global: result?.global ?? null,
    resultKeys:
      result && typeof result === "object"
        ? Object.keys(result)
        : [],
    telemetryEnabled:
      telemetryCases.length > 0,
    telemetryCaseCount:
      telemetryCases.length,
    telemetryCaseKeys:
      telemetryCases[0]
        ? Object.keys(telemetryCases[0])
        : [],
    telemetrySamples:
      telemetryCases.slice(0, 3),
    intercepted,
  };

  fs.writeFileSync(
    "tmp/v4_predictive_telemetry_audit.json",
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log("");
  console.log("===== RESUMO =====");
  console.log(JSON.stringify({
    resultKeys: report.resultKeys,
    telemetryEnabled: report.telemetryEnabled,
    telemetryCaseCount: report.telemetryCaseCount,
    telemetryCaseKeys: report.telemetryCaseKeys,
    firstTopType: intercepted[0]?.topType ?? null,
    firstOutputKeys: intercepted[0]?.outputKeys ?? [],
  }, null, 2));

  console.log("");
  console.log("Relatório salvo em:");
  console.log("tmp/v4_predictive_telemetry_audit.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
