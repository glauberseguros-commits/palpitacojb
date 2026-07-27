"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  runOfficialBacktest,
} = require("../backend/scripts/backtestTop3Official");

function stableSortObject(value) {
  if (Array.isArray(value)) {
    return value.map(stableSortObject);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableSortObject(value[key]);
        return result;
      }, {});
  }

  return value;
}

function stableJson(value) {
  return JSON.stringify(stableSortObject(value));
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex")
    .toUpperCase();
}

async function main() {
  const outputDir = path.resolve(
    process.argv[2] || "tmp/perf_top3_41_data"
  );

  fs.mkdirSync(outputDir, {
    recursive: true,
  });

  const lotteries = [
    "PT_RIO",
    "FEDERAL",
    "LOOK",
    "NACIONAL",
  ];

  const summary = [];

  for (const lotteryKey of lotteries) {
    console.log("");
    console.log(`===== ${lotteryKey} =====`);

    const result = await runOfficialBacktest({
      lotteryKey,
      limit: 100,
      minHistory: 100,
      telemetry: true,
      progress: false,
    });

    const cases = (
      result.telemetry?.cases || []
    ).map((item) => ({
      caseNumber: Number(item.caseNumber),
      historyIndex: Number(item.historyIndex),
      target: {
        ymd: item.target?.ymd || null,
        hour: item.target?.hour || null,
      },
      actual: {
        group: Number(item.actual?.group),
        top3Groups: (
          item.actual?.top3Groups || []
        ).map(Number),
      },
      prediction: {
        groups: (
          item.prediction?.groups || []
        ).map(Number),
        top1Hit:
          item.prediction?.top1Hit === true,
        top3Hit:
          item.prediction?.top3Hit === true,
      },
    }));

    const canonical = {
      lotteryKey,
      historyLoaded:
        Number(result.historyLoaded || 0),
      eligibleCases:
        Number(result.eligibleCases || 0),
      evaluated:
        Number(result.global?.evaluated || 0),
      errors:
        Number(result.global?.errors || 0),
      top1Hits:
        Number(result.global?.top1Hits || 0),
      top3Hits:
        Number(result.global?.top3Hits || 0),
      cases,
    };

    const canonicalText = stableJson(canonical);
    const signature = sha256(canonicalText);

    const filePath = path.join(
      outputDir,
      `${lotteryKey.toLowerCase()}_signature.json`
    );

    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          ...canonical,
          signature,
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    summary.push({
      lotteryKey,
      signature,
      historyLoaded:
        canonical.historyLoaded,
      eligibleCases:
        canonical.eligibleCases,
      evaluated:
        canonical.evaluated,
      errors:
        canonical.errors,
      top1Hits:
        canonical.top1Hits,
      top3Hits:
        canonical.top3Hits,
      filePath,
    });

    console.log(`Assinatura: ${signature}`);
  }

  const summaryPath = path.join(
    outputDir,
    "summary.json"
  );

  fs.writeFileSync(
    summaryPath,
    JSON.stringify(summary, null, 2) + "\n",
    "utf8"
  );

  console.log("");
  console.log(`Resumo: ${summaryPath}`);
}

main().catch((error) => {
  console.error(
    error?.stack ||
    error?.message ||
    error
  );

  process.exitCode = 1;
});
