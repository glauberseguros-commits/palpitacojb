import test from "node:test";
import assert from "node:assert/strict";

import {
  getScheduleForLottery,
  isFederalDrawDay,
} from "../top3.engine.js";

import {
  FEDERAL_SCHEDULE,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
} from "../top3.constants.js";

function schedule(lotteryKey, ymd) {
  return getScheduleForLottery({
    lotteryKey,
    ymd,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });
}

test("Federal histórica: quarta-feira às 20h", () => {
  assert.equal(
    isFederalDrawDay("2026-07-15"),
    true
  );

  assert.deepEqual(
    schedule("FEDERAL", "2026-07-15"),
    ["20:00"]
  );
});

test("Federal histórica: sábado às 20h até 18/07/2026", () => {
  assert.equal(
    isFederalDrawDay("2026-07-18"),
    true
  );

  assert.deepEqual(
    schedule("FEDERAL", "2026-07-18"),
    ["20:00"]
  );
});

test("Federal nova: domingo às 11h desde 19/07/2026", () => {
  assert.equal(
    isFederalDrawDay("2026-07-19"),
    true
  );

  assert.deepEqual(
    schedule("FEDERAL", "2026-07-19"),
    ["11:30"]
  );
});

test("Federal nova: quarta-feira continua às 20h", () => {
  assert.equal(
    isFederalDrawDay("2026-07-22"),
    true
  );

  assert.deepEqual(
    schedule("FEDERAL", "2026-07-22"),
    ["20:00"]
  );
});

test("Federal nova: sábado deixa de ter sorteio", () => {
  assert.equal(
    isFederalDrawDay("2026-07-25"),
    false
  );

  assert.deepEqual(
    schedule("FEDERAL", "2026-07-25"),
    []
  );
});

test("PT Rio: quarta-feira mantém 18h", () => {
  assert.deepEqual(
    schedule("PT_RIO", "2026-07-22"),
    [
      "09:00",
      "11:00",
      "14:00",
      "16:00",
      "18:00",
      "21:00",
    ]
  );
});

test("PT Rio: segunda-feira mantém grade normal com 18h", () => {
  assert.deepEqual(
    schedule("PT_RIO", "2026-07-20"),
    [
      "09:00",
      "11:00",
      "14:00",
      "16:00",
      "18:00",
      "21:00",
    ]
  );
});

test("PT Rio: sábado histórico mantém 18h", () => {
  assert.deepEqual(
    schedule("PT_RIO", "2026-07-11"),
    [
      "09:00",
      "11:00",
      "14:00",
      "16:00",
      "18:00",
      "21:00",
    ]
  );
});

test("PT Rio: sábado desde 18/07/2026 troca 18h por 19h", () => {
  assert.deepEqual(
    schedule("PT_RIO", "2026-07-18"),
    [
      "09:00",
      "11:00",
      "14:00",
      "16:00",
      "19:00",
      "21:00",
    ]
  );
});

test("PT Rio: domingo desde 19/07/2026 tem apenas 14h e 16h", () => {
  assert.deepEqual(
    schedule("PT_RIO", "2026-07-19"),
    [
      "14:00",
      "16:00",
    ]
  );
});
