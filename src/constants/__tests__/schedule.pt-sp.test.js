import {
  getScheduleByLottery,
} from "../schedule";

describe("PT_SP schedule foundation", () => {
  const expected = [
    "08:00",
    "10:00",
    "12:00",
    "13:00",
    "15:00",
    "17:00",
    "19:00",
    "20:00",
  ];

  test("PT_SP possui os oito slots operacionais conhecidos", () => {
    expect(
      getScheduleByLottery("PT_SP")
    ).toEqual(expected);
  });

  test("alias SP resolve para PT_SP", () => {
    expect(
      getScheduleByLottery("SP")
    ).toEqual(expected);
  });

  test("loteria desconhecida nao cai em PT_RIO", () => {
    expect(
      getScheduleByLottery("LOTTERY_INEXISTENTE")
    ).toEqual([]);
  });
});
