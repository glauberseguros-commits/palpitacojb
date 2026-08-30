import {
  getScheduleForLottery,
  isFederalDrawDay,
} from "../top3.engine";

import {
  FEDERAL_SCHEDULE,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
} from "../top3.constants";

function schedule(ymd) {
  return getScheduleForLottery({
    lotteryKey: "FEDERAL",
    ymd,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });
}

describe(
  "TOP3 - Federal - calendário histórico oficial",
  () => {
    test(
      "quarta 29/10/2025 é 19h",
      () => {
        expect(
          schedule("2025-10-29")
        ).toEqual(["19:00"]);
      }
    );

    test(
      "sábado 01/11/2025 é 19h",
      () => {
        expect(
          schedule("2025-11-01")
        ).toEqual(["19:00"]);
      }
    );

    test(
      "quarta 05/11/2025 passa para 20h",
      () => {
        expect(
          schedule("2025-11-05")
        ).toEqual(["20:00"]);
      }
    );

    test(
      "sábado 08/11/2025 passa para 20h",
      () => {
        expect(
          schedule("2025-11-08")
        ).toEqual(["20:00"]);
      }
    );

    test(
      "sábado 18/07/2026 ainda é 20h",
      () => {
        expect(
          schedule("2026-07-18")
        ).toEqual(["20:00"]);
      }
    );

    test(
      "domingo 19/07/2026 é 11:30",
      () => {
        expect(
          isFederalDrawDay(
            "2026-07-19"
          )
        ).toBe(true);

        expect(
          schedule("2026-07-19")
        ).toEqual(["11:30"]);
      }
    );

    test(
      "quarta atual permanece 20h",
      () => {
        expect(
          schedule("2026-07-22")
        ).toEqual(["20:00"]);
      }
    );

    test(
      "sábado atual não tem Federal",
      () => {
        expect(
          isFederalDrawDay(
            "2026-07-25"
          )
        ).toBe(false);

        expect(
          schedule("2026-07-25")
        ).toEqual([]);
      }
    );
  }
);
