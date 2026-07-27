"use strict";

const fs = require("fs");

const {
  runOfficialBacktest,
} = require("../backend/scripts/backtestTop3Official");

const {
  computeStatisticalTop3V4Experimental,
} = require("../backend/engine/scoreEngineV4Experimental");

const frequencies = [];

async function main() {

  const result = await runOfficialBacktest(
    {
      lotteryKey: "PT_RIO",
      limit: 100,
      minHistory: 100,
      telemetry: true,
    },
    {
      computeTop3(input) {

        const output =
          computeStatisticalTop3V4Experimental(input);

        frequencies.push(
          output?.experimental?.firstPrizeGroupFrequency ?? null
        );

        return output;
      },
    }
  );

  const cases =
    result?.telemetry?.cases ?? [];

  let evaluated = 0;
  let missing = 0;
  let top3 = 0;
  let top5 = 0;
  let upperHalf = 0;

  const details = [];

  for (let i = 0; i < cases.length; i++) {

    const freq = frequencies[i];

    const actualGroup =
      cases[i]?.actual?.grupo ??
      cases[i]?.actual?.group;

    if (!freq || actualGroup == null) {
      missing++;
      continue;
    }

    const ranking =
      Object.entries(freq)
        .sort((a, b) => b[1] - a[1]);

    const group =
      String(actualGroup).padStart(2, "0");

    const position =
      ranking.findIndex(
        ([g]) => g === group
      ) + 1;

    evaluated++;

    if (position > 0 && position <= 3) top3++;
    if (position > 0 && position <= 5) top5++;
    if (
      position > 0 &&
      position <= Math.ceil(ranking.length / 2)
    ) {
      upperHalf++;
    }

    details.push({
      caseNumber: cases[i].caseNumber,
      target: cases[i].target,
      actualGroup: group,
      rankingPosition: position
    });
  }

  const summary = {
    evaluated,
    missing,
    top3,
    top5,
    upperHalf,
    top3Rate:
      evaluated
        ? Number((100 * top3 / evaluated).toFixed(2))
        : 0,
    top5Rate:
      evaluated
        ? Number((100 * top5 / evaluated).toFixed(2))
        : 0,
    upperHalfRate:
      evaluated
        ? Number((100 * upperHalf / evaluated).toFixed(2))
        : 0,
    details
  };

  fs.writeFileSync(
    "tmp/predictive_frequency_integrated.json",
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  console.log("");
  console.log("===== RESULTADO =====");
  console.log(JSON.stringify(summary, null, 2));

  console.log("");
  console.log("Arquivo salvo:");
  console.log("tmp/predictive_frequency_integrated.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
