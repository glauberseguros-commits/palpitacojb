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

const draws =
  Array.isArray(input.drawsRange)
    ? input.drawsRange
    : [];

const first =
  draws.length
    ? draws[0]
    : null;

const last =
  draws.length
    ? draws[draws.length - 1]
    : null;

const report = {
  lotteryKey: input.lotteryKey,

  drawsRange: {
    exists: Array.isArray(input.drawsRange),
    count: draws.length,
    firstKeys: keys(first),
    lastKeys: keys(last),
  },

  drawLast: {
    exists: !!input.drawLast,
    keys: keys(input.drawLast),
  },

  schedules: {
    normal: Array.isArray(input.PT_RIO_SCHEDULE_NORMAL)
      ? input.PT_RIO_SCHEDULE_NORMAL.length
      : null,
    wedSat: Array.isArray(input.PT_RIO_SCHEDULE_WED_SAT)
      ? input.PT_RIO_SCHEDULE_WED_SAT.length
      : null,
    federal: Array.isArray(input.FEDERAL_SCHEDULE)
      ? input.FEDERAL_SCHEDULE.length
      : null,
  },

  sampleFirst: first,
  sampleLast: last
};

fs.writeFileSync(
  "tmp/v4_snapshot_report.json",
  JSON.stringify(report, null, 2),
  "utf8"
);

console.log("");
console.log("===== RESUMO =====");
console.log(JSON.stringify({
  lotteryKey: report.lotteryKey,
  drawsCount: report.drawsRange.count,
  firstKeys: report.drawsRange.firstKeys,
  lastKeys: report.drawsRange.lastKeys,
  drawLastKeys: report.drawLast.keys
}, null, 2));

console.log("");
console.log("Relatório salvo em:");
console.log("tmp/v4_snapshot_report.json");
