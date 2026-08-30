"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  getFederalScheduleForDate,
  normalizeFederalRequestedSlot,
  normalizeFederalSourceSlot,
} =
  require("./federalCalendar");

const scheduleConfig =
  require("../data/slot_schedule/FEDERAL.json");

test(
  "Federal quarta permanece 19h até 29/10/2025",
  () => {
    assert.deepEqual(
      getFederalScheduleForDate(
        "2025-10-29"
      ),
      ["19:00"]
    );
  }
);

test(
  "Federal sábado permanece 19h até 01/11/2025",
  () => {
    assert.deepEqual(
      getFederalScheduleForDate(
        "2025-11-01"
      ),
      ["19:00"]
    );
  }
);

test(
  "Federal quarta passa para 20h em 05/11/2025",
  () => {
    assert.deepEqual(
      getFederalScheduleForDate(
        "2025-11-05"
      ),
      ["20:00"]
    );
  }
);

test(
  "Federal sábado passa para 20h em 08/11/2025",
  () => {
    assert.deepEqual(
      getFederalScheduleForDate(
        "2025-11-08"
      ),
      ["20:00"]
    );
  }
);

test(
  "Federal sábado 18/07/2026 ainda é 20h",
  () => {
    assert.deepEqual(
      getFederalScheduleForDate(
        "2026-07-18"
      ),
      ["20:00"]
    );
  }
);

test(
  "Federal domingo 19/07/2026 é 11:30",
  () => {
    assert.deepEqual(
      getFederalScheduleForDate(
        "2026-07-19"
      ),
      ["11:30"]
    );
  }
);

test(
  "Federal quarta atual permanece 20h",
  () => {
    assert.deepEqual(
      getFederalScheduleForDate(
        "2026-07-22"
      ),
      ["20:00"]
    );
  }
);

test(
  "Federal sábado deixa de existir após 19/07/2026",
  () => {
    assert.deepEqual(
      getFederalScheduleForDate(
        "2026-07-25"
      ),
      []
    );
  }
);

test(
  "Federal não colapsa 19h em 20h sem data",
  () => {
    assert.equal(
      normalizeFederalRequestedSlot(
        "19:00"
      ),
      "19:00"
    );

    assert.equal(
      normalizeFederalRequestedSlot(
        "20:00"
      ),
      "20:00"
    );
  }
);

test(
  "Federal 11h legado aponta para domingo 11:30",
  () => {
    assert.equal(
      normalizeFederalRequestedSlot(
        "11:00"
      ),
      "11:30"
    );

    assert.equal(
      normalizeFederalRequestedSlot(
        "11:30"
      ),
      "11:30"
    );
  }
);

test(
  "Fonte antiga é normalizada pela data oficial",
  () => {
    assert.equal(
      normalizeFederalSourceSlot({
        date: "2025-10-29",
        rawSlot: "20:00",
      }),
      "19:00"
    );

    assert.equal(
      normalizeFederalSourceSlot({
        date: "2025-11-05",
        rawSlot: "19:00",
      }),
      "20:00"
    );

    assert.equal(
      normalizeFederalSourceSlot({
        date: "2026-07-19",
        rawSlot: "20:00",
      }),
      "11:30"
    );
  }
);

test(
  "JSON preserva as três fases oficiais",
  () => {
    const ranges =
      scheduleConfig.ranges || [];

    const phase19 =
      ranges.find(
        r =>
          r.from === "2022-06-08" &&
          r.to === "2025-11-04"
      );

    const phase20 =
      ranges.find(
        r =>
          r.from === "2025-11-05" &&
          r.to === "2026-07-18"
      );

    const current =
      ranges.find(
        r =>
          r.from === "2026-07-19" &&
          r.to === null
      );

    assert.ok(phase19);
    assert.ok(phase20);
    assert.ok(current);

    assert.deepEqual(
      phase19.dow["3"].hard,
      ["19"]
    );

    assert.deepEqual(
      phase19.dow["6"].hard,
      ["19"]
    );

    assert.deepEqual(
      phase20.dow["3"].hard,
      ["20"]
    );

    assert.deepEqual(
      phase20.dow["6"].hard,
      ["20"]
    );

    assert.deepEqual(
      current.dow["0"].hard,
      ["11:30"]
    );

    assert.deepEqual(
      current.dow["3"].hard,
      ["20"]
    );

    assert.equal(
      current.dow["6"],
      undefined
    );
  }
);
