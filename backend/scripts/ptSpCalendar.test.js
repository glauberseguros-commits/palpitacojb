"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  getPtSpSourceRegistry,
  getPtSpAllSlots,
  getPtSpKnownSourceSlotsByDate,
  resolvePtSpSourceDraw,
  getPtSpExpectedRawMinute,
  getPtSpCalendarByDate,
  isPtSpCurrentOperationalSlot,
} =
  require("./ptSpCalendar");

const ALL = [
  "08:00",
  "10:00",
  "12:00",
  "13:00",
  "15:00",
  "17:00",
  "19:00",
  "20:00",
];

test(
  "PT_SP possui exatamente oito fontes registradas",
  () => {
    const registry =
      getPtSpSourceRegistry();

    assert.equal(
      registry.sources.length,
      8
    );

    assert.deepEqual(
      getPtSpAllSlots(),
      ALL
    );
  }
);

test(
  "13h historico resolve por UUID sem truncar 13:10",
  () => {
    const resolved =
      resolvePtSpSourceDraw({
        lottery_id:
          "991998f0-a960-4298-8f29-39e0b3db70b9",
        lottery_name:
          "LT PT SP 13HS",
        close_hour:
          "13:10",
      });

    assert.equal(
      resolved.matched,
      true
    );

    assert.equal(
      resolved.matchedBy,
      "UUID"
    );

    assert.equal(
      resolved.canonicalSlot,
      "13:00"
    );

    assert.equal(
      resolved.rawCloseHour,
      "13:10"
    );
  }
);

test(
  "BAND 15h preserva identidade e raw separado",
  () => {
    const resolved =
      resolvePtSpSourceDraw({
        lotteryId:
          "9ba690f8-3efc-46da-99ff-85dc77176fa7",
        lottery_name:
          "LT BAND 15HS",
        close_hour:
          "15:10",
      });

    assert.equal(
      resolved.matched,
      true
    );

    assert.equal(
      resolved.canonicalSlot,
      "15:00"
    );

    assert.equal(
      resolved.rawCloseHour,
      "15:10"
    );

    assert.equal(
      resolved.source.sourceName,
      "LT BAND 15HS"
    );

    assert.equal(
      resolved
        .source
        .preserveSourceIdentity,
      true
    );
  }
);

test(
  "nome da fonte resolve quando UUID nao existe no payload",
  () => {
    const resolved =
      resolvePtSpSourceDraw({
        lottery_name:
          "LT PT SP 20HS",
        close_hour:
          "20:09",
      });

    assert.equal(
      resolved.matched,
      true
    );

    assert.equal(
      resolved.matchedBy,
      "SOURCE_NAME"
    );

    assert.equal(
      resolved.canonicalSlot,
      "20:00"
    );

    assert.equal(
      resolved.rawCloseHour,
      "20:09"
    );
  }
);

test(
  "conflito UUID x nome e bloqueado",
  () => {
    const resolved =
      resolvePtSpSourceDraw({
        lottery_id:
          "991998f0-a960-4298-8f29-39e0b3db70b9",
        lottery_name:
          "LT BAND 15HS",
        close_hour:
          "13:10",
      });

    assert.equal(
      resolved.matched,
      false
    );

    assert.equal(
      resolved.conflict,
      true
    );
  }
);

test(
  "fonte desconhecida nao ganha slot inventado",
  () => {
    const resolved =
      resolvePtSpSourceDraw({
        lottery_id:
          "00000000-0000-0000-0000-000000000000",
        lottery_name:
          "LT DESCONHECIDA 13HS",
        close_hour:
          "13:10",
      });

    assert.equal(
      resolved.matched,
      false
    );

    assert.equal(
      resolved.conflict,
      false
    );

    assert.equal(
      resolved.canonicalSlot,
      ""
    );
  }
);

test(
  "antes de 06/07/2022 nao ha fonte King conhecida",
  () => {
    assert.deepEqual(
      getPtSpKnownSourceSlotsByDate(
        "2022-07-05"
      ),
      []
    );
  }
);

test(
  "06/07/2022 possui as tres fontes iniciais conhecidas",
  () => {
    assert.deepEqual(
      getPtSpKnownSourceSlotsByDate(
        "2022-07-06"
      ),
      [
        "13:00",
        "15:00",
        "20:00",
      ]
    );
  }
);

test(
  "07/07/2022 adiciona 10h",
  () => {
    assert.deepEqual(
      getPtSpKnownSourceSlotsByDate(
        "2022-07-07"
      ),
      [
        "10:00",
        "13:00",
        "15:00",
        "20:00",
      ]
    );
  }
);

test(
  "03/06/2023 adiciona 17h",
  () => {
    assert.deepEqual(
      getPtSpKnownSourceSlotsByDate(
        "2023-06-03"
      ),
      [
        "10:00",
        "13:00",
        "15:00",
        "17:00",
        "20:00",
      ]
    );
  }
);

test(
  "11/04/2024 adiciona 08h",
  () => {
    assert.deepEqual(
      getPtSpKnownSourceSlotsByDate(
        "2024-04-11"
      ),
      [
        "08:00",
        "10:00",
        "13:00",
        "15:00",
        "17:00",
        "20:00",
      ]
    );
  }
);

test(
  "11/06/2024 adiciona 12h",
  () => {
    assert.deepEqual(
      getPtSpKnownSourceSlotsByDate(
        "2024-06-11"
      ),
      [
        "08:00",
        "10:00",
        "12:00",
        "13:00",
        "15:00",
        "17:00",
        "20:00",
      ]
    );
  }
);

test(
  "14/06/2024 completa as oito fontes conhecidas",
  () => {
    assert.deepEqual(
      getPtSpKnownSourceSlotsByDate(
        "2024-06-14"
      ),
      ALL
    );
  }
);

test(
  "historico nao recebe grade operacional atual retroativamente",
  () => {
    const calendar =
      getPtSpCalendarByDate(
        "2026-07-18"
      );

    assert.equal(
      calendar.mode,
      "HISTORICAL_SOURCE_DRIVEN"
    );

    assert.equal(
      calendar
        .enforceOperationalSchedule,
      false
    );

    assert.equal(
      calendar
        .operationalSlots,
      null
    );

    assert.equal(
      isPtSpCurrentOperationalSlot(
        "2026-07-18",
        "19:00"
      ),
      null
    );
  }
);

test(
  "quarta atual nao inclui 20h",
  () => {
    const calendar =
      getPtSpCalendarByDate(
        "2026-08-26"
      );

    assert.deepEqual(
      calendar.operationalSlots,
      [
        "08:00",
        "10:00",
        "12:00",
        "13:00",
        "15:00",
        "17:00",
        "19:00",
      ]
    );
  }
);

test(
  "sabado atual nao inclui 19h e preserva 20h",
  () => {
    const calendar =
      getPtSpCalendarByDate(
        "2026-08-29"
      );

    assert.deepEqual(
      calendar.operationalSlots,
      [
        "08:00",
        "10:00",
        "12:00",
        "13:00",
        "15:00",
        "17:00",
        "20:00",
      ]
    );
  }
);

test(
  "domingo atual possui oito slots",
  () => {
    assert.deepEqual(
      getPtSpCalendarByDate(
        "2026-08-30"
      ).operationalSlots,
      ALL
    );
  }
);

test(
  "raw close_hour muda de minuto 10 para 09 no anchor observado",
  () => {
    assert.equal(
      getPtSpExpectedRawMinute(
        "2025-02-05"
      ),
      "10"
    );

    assert.equal(
      getPtSpExpectedRawMinute(
        "2025-02-06"
      ),
      "09"
    );
  }
);

test(
  "validationAnchor nao afirma data formal de transicao",
  () => {
    const registry =
      getPtSpSourceRegistry();

    assert.equal(
      registry
        .currentOperationalRegime
        .formalTransitionDateClaimed,
      false
    );
  }
);
