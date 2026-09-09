"use strict";

const assert = require("assert");

const {
  groupFromEnding,
  extractPrizeGroup,
  applyTop3Radar360Rescue,
} = require("../engine/top3Radar360Rescue");

assert.strictEqual(groupFromEnding("097"), 25);
assert.strictEqual(groupFromEnding("058"), 15);
assert.strictEqual(groupFromEnding("039"), 10);
assert.strictEqual(groupFromEnding("000"), 25);

const previousDraw = {
  ymd: "2026-09-12",
  hour: "07:00",
  prizes: [
    { position: 1, milhar: "1111" },
    { position: 2, milhar: "2222" },
    { position: 3, milhar: "3333" },
    { position: 4, milhar: "4444" },
    { position: 5, milhar: "5555" },
    { position: 6, milhar: "6666" },
    { position: 7, centena: "058" },
  ],
};

assert.strictEqual(
  extractPrizeGroup(previousDraw, 7),
  15
);

const result =
  applyTop3Radar360Rescue({
    lotteryKey: "LOOK",
    date: "2026-09-12",
    closeHour: "09:00",
    drawLast: previousDraw,
    computedTop: [
      { grupo: 1 },
      { grupo: 2 },
      { grupo: 3 },
    ],
    publicApi: {
      pickDrawHour: (draw) => draw.hour,
    },
  });

assert.strictEqual(result.applied, true);
assert.deepStrictEqual(result.positions, [3,5,7]);
assert.deepStrictEqual(result.rescueGroups, [9,14,15]);
assert.deepStrictEqual(result.finalGroups, [9,14,15]);

const untouched =
  applyTop3Radar360Rescue({
    lotteryKey: "LOOK",
    date: "2026-09-09",
    closeHour: "16:00",
    drawLast: previousDraw,
    computedTop: [
      { grupo: 4 },
      { grupo: 5 },
      { grupo: 6 },
    ],
    publicApi: {
      pickDrawHour: (draw) => draw.hour,
    },
  });

assert.strictEqual(untouched.applied, false);

assert.deepStrictEqual(
  untouched.top.map((x) => Number(x.grupo)),
  [4,5,6]
);

console.log("TOP3_RADAR360_RESCUE_SMOKE=PASS");
