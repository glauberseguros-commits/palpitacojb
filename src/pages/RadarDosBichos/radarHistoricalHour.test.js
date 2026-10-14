import { normalizeRadarHistoricalHour } from "./radarCentenas24";

describe("Radar 24 - normalizacao dos horarios historicos", () => {
  test("PT_RIO 21h recebe 1260 minutos", () => {
    expect(
      normalizeRadarHistoricalHour("PT_RIO", 1260)
    ).toBe("21:00");
  });

  test("PT_RIO 09h recebe 540 minutos", () => {
    expect(
      normalizeRadarHistoricalHour("PT_RIO", 540)
    ).toBe("09:00");
  });

  test("LOOK 21h preserva horario oficial", () => {
    expect(
      normalizeRadarHistoricalHour("LOOK", 1260)
    ).toBe("21:00");
  });

  test("NACIONAL 01:49 pertence ao sorteio 02h", () => {
    expect(
      normalizeRadarHistoricalHour("NACIONAL", 109)
    ).toBe("02:00");
  });

  test("NACIONAL 07:49 pertence ao sorteio 08h", () => {
    expect(
      normalizeRadarHistoricalHour("NACIONAL", 469)
    ).toBe("08:00");
  });

  test("NACIONAL 22:49 pertence ao sorteio 23h", () => {
    expect(
      normalizeRadarHistoricalHour("NACIONAL", 1369)
    ).toBe("23:00");
  });

  test("horarios oficiais diferentes continuam distintos", () => {
    expect(
      normalizeRadarHistoricalHour("PT_RIO", 540)
    ).not.toBe(
      normalizeRadarHistoricalHour("PT_RIO", 660)
    );
  });
});