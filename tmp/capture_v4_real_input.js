"use strict";

const fs = require("fs");

const {
  runOfficialBacktest,
} = require("../backend/scripts/backtestTop3Official");

const {
  computeStatisticalTop3V4Experimental,
} = require("../backend/engine/scoreEngineV4Experimental");

let captured = false;

async function main() {

  await runOfficialBacktest(
    {
      lotteryKey: "PT_RIO",
      limit: 1,
      minHistory: 100,
    },
    {
      computeTop3(input) {

        if (!captured) {

          captured = true;

          fs.writeFileSync(
            "tmp/v4_real_input_snapshot.json",
            JSON.stringify(input, null, 2),
            "utf8"
          );

          console.log("");
          console.log("===== PRIMEIRA ENTRADA =====");
          console.log("Chaves:", Object.keys(input));

        }

        return computeStatisticalTop3V4Experimental(input);
      },
    }
  );

  console.log("");
  console.log("Snapshot gravado em:");
  console.log("tmp/v4_real_input_snapshot.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
