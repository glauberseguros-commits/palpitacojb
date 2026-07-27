import {
  getScheduleForLottery,
  getPtRioScheduleForYmd,
  isFederalDrawDay,
} from "../top3.public-api";

import {
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
} from "../top3.constants";

function schedule(lotteryKey, ymd) {
  return getScheduleForLottery({
    lotteryKey,
    ymd,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });
}

describe("TOP3 — transição oficial de horários", () => {
  test("preserva Federal histórica no sábado 18/07/2026 às 20h", () => {
    expect(isFederalDrawDay("2026-07-18")).toBe(true);
    expect(schedule("FEDERAL", "2026-07-18")).toEqual(["20:00"]);
  });

  test("Federal passa para domingo 19/07/2026 às 11h", () => {
    expect(isFederalDrawDay("2026-07-19")).toBe(true);
    expect(schedule("FEDERAL", "2026-07-19")).toEqual(["11:00"]);
  });

  test("Federal deixa de funcionar aos sábados após a transição", () => {
    expect(isFederalDrawDay("2026-07-25")).toBe(false);
    expect(schedule("FEDERAL", "2026-07-25")).toEqual([]);
  });

  test("Federal continua funcionando na quarta-feira às 20h", () => {
    expect(isFederalDrawDay("2026-07-22")).toBe(true);
    expect(schedule("FEDERAL", "2026-07-22")).toEqual(["20:00"]);
  });

  test("PT Rio preserva domingo histórico anterior à mudança", () => {
    const result = getPtRioScheduleForYmd(
      "2026-07-12",
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT
    );

    expect(result).toContain("09:00");
    expect(result).toContain("11:00");
  });

  test("PT Rio remove 09h e 11h do domingo após a mudança", () => {
    const result = getPtRioScheduleForYmd(
      "2026-07-19",
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT
    );

    expect(result).not.toContain("09:00");
    expect(result).not.toContain("11:00");
  });

  test("PT Rio mantém 18h no sábado depois da saída da Federal", () => {
    const result = getPtRioScheduleForYmd(
      "2026-07-25",
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT
    );

    expect(result).toContain("18:00");
  });

  test("PT Rio histórico mantém remoção de 18h no sábado com Federal", () => {
    const result = getPtRioScheduleForYmd(
      "2026-07-18",
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT
    );

    expect(result).not.toContain("18:00");
  });
});
