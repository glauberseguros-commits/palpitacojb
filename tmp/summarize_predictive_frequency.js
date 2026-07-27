"use strict";

const fs = require("fs");

const report = JSON.parse(
  fs.readFileSync(
    "tmp/predictive_frequency_integrated.json",
    "utf8"
  )
);

const details = Array.isArray(report.details)
  ? report.details
  : [];

const histogram = {};
let sum = 0;

let top3 = 0;
let top5 = 0;
let top10 = 0;

for (const item of details) {

  const p = Number(item.rankingPosition);

  if (!Number.isFinite(p) || p <= 0)
    continue;

  histogram[p] =
    (histogram[p] || 0) + 1;

  sum += p;

  if (p <= 3) top3++;
  if (p <= 5) top5++;
  if (p <= 10) top10++;
}

const evaluated = details.length;

const orderedHistogram =
  Object.fromEntries(
    Object.entries(histogram)
      .sort(
        (a,b)=>
          Number(a[0])-Number(b[0])
      )
  );

const summary = {
  evaluated,
  averageRanking:
    evaluated
      ? Number((sum/evaluated).toFixed(2))
      : null,

  top3,
  top5,
  top10,

  top3Rate:
    evaluated
      ? Number((100*top3/evaluated).toFixed(2))
      : 0,

  top5Rate:
    evaluated
      ? Number((100*top5/evaluated).toFixed(2))
      : 0,

  top10Rate:
    evaluated
      ? Number((100*top10/evaluated).toFixed(2))
      : 0,

  histogram: orderedHistogram
};

fs.writeFileSync(
  "tmp/predictive_frequency_summary.json",
  JSON.stringify(summary,null,2),
  "utf8"
);

console.log("");
console.log("===== RESUMO =====");
console.log(JSON.stringify(summary,null,2));

console.log("");
console.log("Arquivo salvo:");
console.log("tmp/predictive_frequency_summary.json");
