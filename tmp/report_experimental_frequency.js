"use strict";

const fs = require("fs");

const input = JSON.parse(
  fs.readFileSync(
    "tmp/v4_real_input_snapshot.json",
    "utf8"
  )
);

const {
  computeStatisticalTop3V4Experimental,
} = require("../backend/engine/scoreEngineV4Experimental");

const result =
  computeStatisticalTop3V4Experimental(input);

const freq =
  result.experimental.firstPrizeGroupFrequency;

const ranking =
  Object.entries(freq)
    .map(([grupo, ocorrencias]) => ({
      grupo,
      ocorrencias
    }))
    .sort((a, b) =>
      b.ocorrencias - a.ocorrencias ||
      a.grupo.localeCompare(b.grupo)
    );

const report = {
  totalDraws: result.experimental.totalDraws,
  distinctGroups: ranking.length,
  ranking
};

fs.writeFileSync(
  "tmp/v4_frequency_report.json",
  JSON.stringify(report, null, 2),
  "utf8"
);

console.log("");
console.log("===== TOP 10 GRUPOS =====");

console.table(ranking.slice(0, 10));

console.log("");
console.log("===== BOTTOM 10 GRUPOS =====");

console.table(ranking.slice(-10));

console.log("");
console.log("Relatório salvo em:");
console.log("tmp/v4_frequency_report.json");
