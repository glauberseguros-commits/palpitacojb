"use strict";

const assert = require("assert");

const {
  runOfficialBacktest,
} = require("../backend/scripts/backtestTop3Official");

const {
  computeStatisticalTop3V4Experimental,
} = require("../backend/engine/scoreEngineV4Experimental");

function normalize(result) {
  return {
    evaluated: result.global.evaluated,
    top1Hits: result.global.top1Hits,
    top3Hits: result.global.top3Hits,
    top1Rate: result.global.top1Rate,
    top3Rate: result.global.top3Rate,
  };
}

async function main() {

  const options = {
    lotteryKey: "PT_RIO",
    limit: 100,
    minHistory: 100,
  };

  console.log("Executando V3...");

  const v3 =
    await runOfficialBacktest(options);

  console.log("Executando Wrapper V4...");

  const v4 =
    await runOfficialBacktest(
      options,
      {
        computeTop3:
          computeStatisticalTop3V4Experimental,
      }
    );

  const a = normalize(v3);
  const b = normalize(v4);

  assert.deepStrictEqual(a, b);

  console.log("");
  console.log("===== RESULTADO =====");
  console.log(JSON.stringify(a, null, 2));
  console.log("");
  console.log("Wrapper V4 validado com sucesso.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
