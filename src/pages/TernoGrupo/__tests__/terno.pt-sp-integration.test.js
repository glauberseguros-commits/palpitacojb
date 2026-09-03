import fs from "fs";
import path from "path";

import {
  getScheduleForLottery,
  getNextSlotForLottery,
} from "../top3.engine";

import {
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  LOTTERY_OPTIONS,
} from "../top3.constants";

function schedule(ymd) {
  return getScheduleForLottery({
    lotteryKey: "PT_SP",
    ymd,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });
}

describe("Terno de Grupo - PT_SP integration", () => {
  test("exposes Sao Paulo as an independent lottery", () => {
    expect(
      LOTTERY_OPTIONS.some(
        (item) =>
          item?.value === "PT_SP" &&
          item?.label === "São Paulo"
      )
    ).toBe(true);
  });

  test("uses PT_SP canonical current schedule", () => {
    expect(
      schedule("2026-09-03")
    ).toEqual([
      "08:00",
      "10:00",
      "12:00",
      "13:00",
      "15:00",
      "17:00",
      "19:00",
      "20:00",
    ]);
  });

  test("Wednesday current PT_SP ends at 19h", () => {
    expect(
      schedule("2026-09-02")
    ).toEqual([
      "08:00",
      "10:00",
      "12:00",
      "13:00",
      "15:00",
      "17:00",
      "19:00",
    ]);

    expect(
      schedule("2026-09-02")
    ).not.toContain("20:00");
  });

  test("preserves historical PT_SP source availability", () => {
    expect(
      schedule("2022-07-06")
    ).toEqual([
      "13:00",
      "15:00",
      "20:00",
    ]);
  });

  test("Wednesday 19h advances to Thursday 08h", () => {
    expect(
      getNextSlotForLottery({
        lotteryKey: "PT_SP",
        ymd: "2026-09-02",
        hourBucket: "19:00",
        PT_RIO_SCHEDULE_NORMAL,
        PT_RIO_SCHEDULE_WED_SAT,
        FEDERAL_SCHEDULE,
      })
    ).toEqual({
      ymd: "2026-09-03",
      hour: "08h",
    });
  });

  test("strength percentage is hidden only from the UI", () => {
    const view =
      fs.readFileSync(
        path.join(
          process.cwd(),
          "src/pages/TernoGrupo/TernoGrupoView.jsx"
        ),
        "utf8"
      );

    expect(
      view
    ).not.toContain(
      "Índice de força"
    );

    expect(
      view
    ).not.toContain(
      "— ÍNDICE "
    );

    expect(
      view
    ).not.toContain(
      'className="terno-grupo-card__score"'
    );

    expect(
      view
    ).toContain(
      "const strengthLabel"
    );

    expect(
      view
    ).toContain(
      "terno.scorePct >= 85"
    );
  });
});
