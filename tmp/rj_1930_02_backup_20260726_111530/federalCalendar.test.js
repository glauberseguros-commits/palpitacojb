"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getFederalScheduleForDate,
  normalizeFederalRequestedSlot,
  normalizeFederalSourceSlot,
} = require("./federalCalendar");

const scheduleConfig =
  require("../data/slot_schedule/FEDERAL.json");

test("Federal historica: quarta 15/07/2026 as 20h", () => {
  assert.deepEqual(
    getFederalScheduleForDate("2026-07-15"),
    ["20:00"]
  );
});

test("Federal historica: sabado 18/07/2026 as 20h", () => {
  assert.deepEqual(
    getFederalScheduleForDate("2026-07-18"),
    ["20:00"]
  );
});

test("Federal nova: domingo 19/07/2026 as 11h", () => {
  assert.deepEqual(
    getFederalScheduleForDate("2026-07-19"),
    ["11:00"]
  );
});

test("Federal nova: quarta 22/07/2026 as 20h", () => {
  assert.deepEqual(
    getFederalScheduleForDate("2026-07-22"),
    ["20:00"]
  );
});

test("Federal nova: sabado 25/07/2026 sem sorteio", () => {
  assert.deepEqual(
    getFederalScheduleForDate("2026-07-25"),
    []
  );
});

test("Fonte 20h de domingo vira slot oficial 11h", () => {
  assert.equal(
    normalizeFederalSourceSlot({
      date: "2026-07-19",
      rawSlot: "20:00",
    }),
    "11:00"
  );
});

test("Fonte 20h de quarta permanece 20h", () => {
  assert.equal(
    normalizeFederalSourceSlot({
      date: "2026-07-22",
      rawSlot: "20:00",
    }),
    "20:00"
  );
});

test("Pedido 11h permanece 11h e probe 19h vira 20h", () => {
  assert.equal(
    normalizeFederalRequestedSlot("11:00"),
    "11:00"
  );

  assert.equal(
    normalizeFederalRequestedSlot("19:00"),
    "20:00"
  );
});

test("Arquivo de grade preserva historia e nova regra", () => {
  const ranges = scheduleConfig.ranges || [];

  const historical = ranges.find(
    (range) =>
      range.from === "2022-06-08" &&
      range.to === "2026-07-18"
  );

  const current = ranges.find(
    (range) =>
      range.from === "2026-07-19" &&
      range.to === null
  );

  assert.ok(historical);
  assert.ok(current);

  assert.deepEqual(
    historical.dow["3"].hard,
    ["20"]
  );

  assert.deepEqual(
    historical.dow["6"].hard,
    ["20"]
  );

  assert.deepEqual(
    current.dow["0"].hard,
    ["11"]
  );

  assert.deepEqual(
    current.dow["3"].hard,
    ["20"]
  );
});
