import {
  getScheduleForLottery,
  getPtRioScheduleForYmd,
  getNextSlotForLottery,
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

function normalizeSchedule(hours) {
  return [...hours]
    .map((hour) => {
      const value = String(hour).trim();

      if (/^\d{1,2}h$/.test(value)) {
        return (
          value
            .replace("h", "")
            .padStart(2, "0")
          + ":00"
        );
      }

      if (/^\d{1,2}:\d{2}$/.test(value)) {
        const [hh, mm] = value.split(":");

        return `${hh.padStart(2, "0")}:${mm}`;
      }

      return value;
    })
    .sort();
}

function rioSchedule(ymd) {
  return normalizeSchedule(
    getPtRioScheduleForYmd(
      ymd,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT
    )
  );
}

describe("TOP3 — transição oficial de horários", () => {
  test("Federal histórica funciona no sábado 18/07/2026 às 20h", () => {
    expect(isFederalDrawDay("2026-07-18")).toBe(true);

    expect(
      normalizeSchedule(
        schedule("FEDERAL", "2026-07-18")
      )
    ).toEqual(["20:00"]);
  });

  test("Federal passa para domingo 19/07/2026 às 11h", () => {
    expect(isFederalDrawDay("2026-07-19")).toBe(true);

    expect(
      normalizeSchedule(
        schedule("FEDERAL", "2026-07-19")
      )
    ).toEqual(["11:00"]);
  });

  test("Federal deixa de funcionar aos sábados após a transição", () => {
    expect(isFederalDrawDay("2026-07-25")).toBe(false);
    expect(schedule("FEDERAL", "2026-07-25")).toEqual([]);
  });

  test("Federal continua funcionando na quarta-feira às 20h", () => {
    expect(isFederalDrawDay("2026-07-22")).toBe(true);

    expect(
      normalizeSchedule(
        schedule("FEDERAL", "2026-07-22")
      )
    ).toEqual(["20:00"]);
  });

  test("PT Rio preserva domingo histórico anterior à mudança", () => {
    expect(rioSchedule("2026-07-12")).toEqual([
      "09:00",
      "11:00",
      "14:00",
      "16:00",
    ]);
  });

  test("PT Rio passa a ter somente 14h e 16h no domingo", () => {
    expect(rioSchedule("2026-07-19")).toEqual([
      "14:00",
      "16:00",
    ]);
  });

  test("PT Rio preserva sábado histórico com 18h", () => {
    const result = rioSchedule("2026-07-11");

    expect(result).toContain("18:00");
    expect(result).not.toContain("19:00");
  });

  test("PT Rio substitui 18h por 19h em 18/07/2026", () => {
    expect(rioSchedule("2026-07-18")).toEqual([
      "09:00",
      "11:00",
      "14:00",
      "16:00",
      "19:00",
      "21:00",
    ]);
  });

  test("PT Rio mantém 19h nos sábados posteriores", () => {
    expect(rioSchedule("2026-07-25")).toEqual([
      "09:00",
      "11:00",
      "14:00",
      "16:00",
      "19:00",
      "21:00",
    ]);
  });

  test("PT Rio mantém 18h na quarta-feira", () => {
    const result = rioSchedule("2026-07-22");

    expect(result).toContain("18:00");
    expect(result).not.toContain("19:00");
  });

  test("PT Rio mantém 18h nos demais dias úteis", () => {
    const result = rioSchedule("2026-07-20");

    expect(result).toContain("18:00");
    expect(result).not.toContain("19:00");
  });

  test("LOOK usa a grade oficial completa", () => {
    expect(
      normalizeSchedule(
        schedule("LOOK", "2026-07-21")
      )
    ).toEqual([
      "07:00",
      "09:00",
      "11:00",
      "14:00",
      "16:00",
      "18:00",
      "21:00",
      "23:00",
    ]);
  });

  test("LOOK faz a transicao 23h para 7h do dia seguinte", () => {
    expect(
      getNextSlotForLottery({
        lotteryKey: "LOOK",
        ymd: "2026-07-20",
        hourBucket: "23:00",
        PT_RIO_SCHEDULE_NORMAL,
        PT_RIO_SCHEDULE_WED_SAT,
        FEDERAL_SCHEDULE,
      })
    ).toEqual({
      ymd: "2026-07-21",
      hour: "07h",
    });
  });

  test("Nacional usa somente os oito horarios oficiais", () => {
    const nacional = normalizeSchedule(
      schedule("NACIONAL", "2026-07-21")
    );

    expect(nacional).toEqual([
      "02:00",
      "08:00",
      "10:00",
      "12:00",
      "15:00",
      "17:00",
      "21:00",
      "23:00",
    ]);

    expect(nacional).not.toContain("09:00");
  });

  test("Nacional faz a transicao 23h para 2h do dia seguinte", () => {
    expect(
      getNextSlotForLottery({
        lotteryKey: "NACIONAL",
        ymd: "2026-07-20",
        hourBucket: "23:00",
        PT_RIO_SCHEDULE_NORMAL,
        PT_RIO_SCHEDULE_WED_SAT,
        FEDERAL_SCHEDULE,
      })
    ).toEqual({
      ymd: "2026-07-21",
      hour: "02h",
    });
  });

});
