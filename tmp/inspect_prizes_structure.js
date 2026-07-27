"use strict";

const fs = require("fs");

const input = JSON.parse(
  fs.readFileSync(
    "tmp/v4_real_input_snapshot.json",
    "utf8"
  )
);

function keys(obj) {
  return (
    obj &&
    typeof obj === "object"
  )
    ? Object.keys(obj)
    : [];
}

const firstDraw = input.drawsRange[0];
const lastDraw = input.drawsRange[input.drawsRange.length - 1];
const drawLast = input.drawLast;

function summarize(draw) {

  const prizes =
    Array.isArray(draw?.prizes)
      ? draw.prizes
      : [];

  return {
    prizesCount: prizes.length,
    prizeKeys:
      prizes.length
        ? keys(prizes[0])
        : [],
    firstPrize:
      prizes.length
        ? prizes[0]
        : null
  };
}

const report = {

  firstDraw:
    summarize(firstDraw),

  lastDraw:
    summarize(lastDraw),

  drawLast:
    summarize(drawLast)

};

fs.writeFileSync(
  "tmp/v4_prizes_report.json",
  JSON.stringify(report, null, 2),
  "utf8"
);

console.log("");
console.log("===== RESUMO =====");

console.log(JSON.stringify({

  firstPrizeKeys:
    report.firstDraw.prizeKeys,

  prizesPerDraw:
    report.firstDraw.prizesCount

}, null, 2));

console.log("");
console.log("Relatório salvo em:");
console.log("tmp/v4_prizes_report.json");

