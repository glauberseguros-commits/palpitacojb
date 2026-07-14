"use strict";

const assert = require("assert");

const {
  getPtRioSlotsByDate,
  isPtRio18Expected,
} = require("./ptRioCalendar");

function allSlots(calendar) {
  return [
    ...(calendar.core || []),
    ...(calendar.opcional || []),
    ...(calendar.rara || []),
  ];
}

function assertNo18(date) {
  const calendar = getPtRioSlotsByDate(
    date,
    { federal20Exists: true }
  );

  assert.strictEqual(
    calendar.ptRio18Expected,
    false,
    `${date}: ptRio18Expected deveria ser false`
  );

  assert.strictEqual(
    allSlots(calendar).includes("18:00"),
    false,
    `${date}: 18:00 não poderia permanecer no calendário`
  );

  assert.ok(
    calendar.operationalRulesApplied.includes(
      "FEDERAL_20_REMOVES_PT_RIO_18"
    ),
    `${date}: regra operacional não registrada`
  );

  assert.strictEqual(
    isPtRio18Expected(
      date,
      { federal20Exists: true }
    ),
    false,
    `${date}: helper deveria retornar false`
  );
}

function assertRegularDay(date) {
  const calendar = getPtRioSlotsByDate(
    date,
    { federal20Exists: false }
  );

  assert.strictEqual(
    calendar.ptRio18Expected,
    true,
    `${date}: sem Federal 20h, 18h não deve ser removido pela regra operacional`
  );

  assert.strictEqual(
    isPtRio18Expected(
      date,
      { federal20Exists: false }
    ),
    true,
    `${date}: helper deveria retornar true`
  );
}

assertNo18("2026-07-04");
assertNo18("2026-07-08");
assertNo18("2026-07-11");

assertRegularDay("2026-07-10");
assertRegularDay("2026-07-13");

console.log(
  "OK: regra FEDERAL 20h remove PT_RIO 18h."
);
