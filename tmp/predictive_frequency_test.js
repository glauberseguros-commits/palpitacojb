"use strict";

const fs = require("fs");

const report = JSON.parse(
  fs.readFileSync(
    "tmp/v4_predictive_telemetry_audit.json",
    "utf8"
  )
);

let total = 0;
let top3 = 0;
let top5 = 0;
let upperHalf = 0;
let missing = 0;

const details = [];

for (const sample of report.telemetrySamples || []) {

  const freq =
    sample.intercepted?.experimental?.firstPrizeGroupFrequency ??
    sample.experimental?.firstPrizeGroupFrequency ??
    null;

  const actualGroup =
    sample.actual?.grupo ??
    sample.actual?.group ??
    null;

  if (!freq || actualGroup == null) {
    missing++;
    continue;
  }

  const ranking =
    Object.entries(freq)
      .sort((a, b) => b[1] - a[1]);

  const position =
    ranking.findIndex(
      ([g]) => g === String(actualGroup).padStart(2,"0")
    ) + 1;

  total++;

  if (position > 0 && position <= 3) top3++;
  if (position > 0 && position <= 5) top5++;
  if (position > 0 && position <= Math.ceil(ranking.length/2)) upperHalf++;

  details.push({
    actualGroup,
    rankingPosition: position
  });
}

const output = {
  evaluated: total,
  missing,
  top3,
  top5,
  upperHalf,
  details
};

fs.writeFileSync(
  "tmp/predictive_frequency_test.json",
  JSON.stringify(output, null, 2),
  "utf8"
);

console.log("");
console.log("===== RESULTADO =====");
console.log(JSON.stringify(output, null, 2));

console.log("");
console.log("Arquivo salvo:");
console.log("tmp/predictive_frequency_test.json");
