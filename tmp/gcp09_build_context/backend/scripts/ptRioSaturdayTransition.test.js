"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getPtRioSlotsByDate,
  isPtRio18Expected,
  isPtRioSaturday19Expected,
  clearCache,
} = require("./ptRioCalendar");

function allSlots(calendar) {
  return [
    ...(calendar.core || []),
    ...(calendar.opcional || []),
    ...(calendar.rara || []),
  ];
}

clearCache();

const oldSaturday =
  getPtRioSlotsByDate("2026-07-11");

assert.equal(
  isPtRioSaturday19Expected("2026-07-11"),
  false
);

assert.equal(
  isPtRio18Expected("2026-07-11"),
  true
);

assert.ok(
  allSlots(oldSaturday).includes("18:00"),
  "Sábado histórico deve preservar 18h."
);

assert.ok(
  !allSlots(oldSaturday).includes("19:00"),
  "Sábado histórico não deve receber 19h."
);

const transitionSaturday =
  getPtRioSlotsByDate("2026-07-18");

assert.equal(
  isPtRioSaturday19Expected("2026-07-18"),
  true
);

assert.equal(
  isPtRio18Expected("2026-07-18"),
  false
);

assert.ok(
  transitionSaturday.core.includes("19:00"),
  "Novo sábado deve conter 19h HARD."
);

assert.ok(
  !allSlots(transitionSaturday).includes("18:00"),
  "Novo sábado não deve esperar 18h."
);

assert.ok(
  transitionSaturday.operationalRulesApplied.includes(
    "SATURDAY_19_REPLACES_18_FROM_2026_07_18"
  )
);

const nextSaturday =
  getPtRioSlotsByDate("2026-07-25");

assert.ok(
  nextSaturday.core.includes("19:00")
);

assert.ok(
  !allSlots(nextSaturday).includes("18:00")
);

const weekday =
  getPtRioSlotsByDate("2026-07-17");

assert.ok(
  allSlots(weekday).includes("18:00"),
  "Sexta-feira deve continuar com 18h."
);

assert.ok(
  !allSlots(weekday).includes("19:00"),
  "19h deve ser exclusivo do novo sábado."
);

const schedulePath = path.join(
  __dirname,
  "..",
  "data",
  "slot_schedule",
  "PT_RIO.json"
);

const schedule = JSON.parse(
  fs.readFileSync(schedulePath, "utf8")
);

const historicalRange =
  schedule.ranges.find(
    (range) =>
      range.from === "2024-01-05" &&
      range.to === "2026-07-17"
  );

const futureRange =
  schedule.ranges.find(
    (range) =>
      range.from === "2026-07-18" &&
      range.to === "2099-12-31"
  );

assert.ok(historicalRange);
assert.ok(futureRange);

assert.ok(
  historicalRange.dow["6"].soft.includes("18"),
  "Histórico precisa preservar 18h."
);

assert.ok(
  futureRange.dow["6"].hard.includes("19"),
  "Agenda futura precisa conter 19h."
);

assert.ok(
  !futureRange.dow["6"].hard.includes("18")
);

assert.ok(
  !futureRange.dow["6"].soft.includes("18")
);

const autoImportSource = fs.readFileSync(
  path.join(__dirname, "autoImportToday.js"),
  "utf8"
);

assert.match(
  autoImportSource,
  /hour:\s*"19:00"[\s\S]{0,160}releaseAt:\s*"19:20"/
);

assert.ok(
  autoImportSource.includes(
    "isPtRioSaturday19Expected"
  )
);

console.log(
  "OK: sábado PT Rio usa 19h desde 18/07/2026 e preserva o histórico de 18h."
);
