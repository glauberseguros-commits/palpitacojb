
import {
  selectRadarCentenaDigits,
  buildRadarCentenas24Rows,
  applyRadarCentenas24,
} from "./radarCentenas24";

describe("Radar contextual - 24 milhares", () => {
  const prizes = [];

  for (const [digit, count] of [
    ["4", 12],
    ["5", 11],
    ["0", 10],
    ["1", 9],
    ["6", 8],
    ["7", 7],
    ["2", 6],
    ["3", 5],
    ["8", 4],
    ["9", 3],
  ]) {
    for (let i = 0; i < count; i++) {
      const dezena = ["81", "82", "83", "84"][i % 4];
      prizes.push({
        milhar4: `9${digit}${dezena}`,
        centena3: `${digit}${dezena}`,
      });
    }
  }

  test("seleciona seis digitos distintos na ordem da frequencia", () => {
    expect(selectRadarCentenaDigits(prizes, 21))
      .toEqual(["0", "1", "4", "5", "2", "3"]);
  });

  test("forma quatro dezenas e 24 centenas e milhares unicas", () => {
    const rows = buildRadarCentenas24Rows({
      group: 21,
      prizes,
      historicalPrizes: prizes,
    });

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.dezena))
      .toEqual(["81", "82", "83", "84"]);

    const centenas = rows.flatMap((row) =>
      row.numbers.map((number) => number.centena)
    );
    const milhares = rows.flatMap((row) =>
      row.numbers.map((number) => number.milhar)
    );

    expect(centenas).toHaveLength(24);
    expect(new Set(centenas).size).toBe(24);
    expect(new Set(milhares).size).toBe(24);
    expect(centenas).toContain("081");
    expect(centenas).toHaveLength(24);
    expect(rows.every((row) => row.numbers.length === 6)).toBe(true);
  });

  test("mantem o animal, rank e modo existentes", () => {
    const cards = [{
      group: 21,
      rank: 4,
      mode: "TOP1",
      rows: [],
      milhares: [],
    }];

    const result = applyRadarCentenas24(cards, {
      valid: true,
      prizes,
      historicalPrizes: prizes,
    });

    expect(result[0].group).toBe(21);
    expect(result[0].rank).toBe(4);
    expect(result[0].mode).toBe("TOP1");
    expect(result[0].milhares).toHaveLength(24);
  });
});

describe("Radar 24 - recorte dinamico", () => {
  test("recortes com frequencias diferentes geram selecoes diferentes", () => {
    const createPrize = (centena) => ({
      centena3: centena,
      milhar4: `1${centena}`,
    });

    const first = [
      ...Array(8).fill(null).map(() => createPrize("081")),
      ...Array(6).fill(null).map(() => createPrize("182")),
      ...Array(4).fill(null).map(() => createPrize("283")),
    ];

    const second = [
      ...Array(8).fill(null).map(() => createPrize("981")),
      ...Array(6).fill(null).map(() => createPrize("882")),
      ...Array(4).fill(null).map(() => createPrize("783")),
    ];

    const firstDigits = selectRadarCentenaDigits(first, 21);
    const secondDigits = selectRadarCentenaDigits(second, 21);

    expect(firstDigits).toHaveLength(6);
    expect(secondDigits).toHaveLength(6);

    expect(new Set(firstDigits).size).toBe(6);
    expect(new Set(secondDigits).size).toBe(6);

    expect(firstDigits).not.toEqual(secondDigits);

    expect(firstDigits.slice(0, 3)).toEqual(["0", "1", "2"]);
    expect(secondDigits.slice(0, 3)).toEqual(["9", "8", "7"]);
  });
});

describe("Radar 24 - seis centenas por dezena", () => {
  test("cada dezena possui ranking independente", () => {
    const prizes = [];

    function include(centena, count) {
      for (let i = 0; i < count; i++) {
        prizes.push({
          centena3: centena,
          milhar4: `1${centena}`,
        });
      }
    }

    // Coelho G10: dezenas 37, 38, 39 e 40.
    // A centena mais frequente de cada dezena
    // e intencionalmente diferente.

    include("937", 8);
    include("138", 7);
    include("739", 6);
    include("440", 5);

    const dezenas = ["37", "38", "39", "40"];
    const leaders = ["9", "1", "7", "4"];

    dezenas.forEach((dezena, index) => {
      const digits = selectRadarCentenaDigits(
        prizes,
        10,
        dezena
      );

      expect(digits).toHaveLength(6);
      expect(new Set(digits).size).toBe(6);
      expect(digits[0]).toBe(leaders[index]);
    });
  });

  test("empate prioriza a menor centena", () => {
    const prizes = [
      { centena3: "937", milhar4: "1937" },
      { centena3: "237", milhar4: "1237" },
      { centena3: "537", milhar4: "1537" },
    ];

    const digits = selectRadarCentenaDigits(
      prizes,
      10,
      "37"
    );

    expect(digits.slice(0, 3)).toEqual([
      "2", "5", "9",
    ]);
  });

  test("dezena fora do animal e rejeitada", () => {
    expect(() =>
      selectRadarCentenaDigits([], 10, "81")
    ).toThrow("RADAR24_INVALID_DEZENA");
  });
});