import {
  buildMilharCandidatesV3,
  buildMilharRecommendationV3,
  flattenDrawsForMilharV3,
  rankMilharCandidatesV3,
} from "../modules/milharProbabilityEngineV3";

function draw({
  ymd,
  hour,
  prizes,
}) {
  return {
    ymd,
    date: ymd,
    closeHour: hour,
    prizes,
  };
}

function prize(milhar, position = 1) {
  return {
    milhar,
    position,
  };
}

describe("Motor probabilístico de milhares V3", () => {
  test("gera exatamente as dez candidatas da centena", () => {
    const candidates =
      buildMilharCandidatesV3("619");

    expect(candidates).toHaveLength(10);

    expect(
      candidates.map((item) => item.milhar)
    ).toEqual([
      "0619",
      "1619",
      "2619",
      "3619",
      "4619",
      "5619",
      "6619",
      "7619",
      "8619",
      "9619",
    ]);
  });

  test("normaliza prêmios de três dígitos", () => {
    const rows = flattenDrawsForMilharV3([
      draw({
        ymd: "2026-07-01",
        hour: "09:00",
        prizes: [
          prize("763", 7),
        ],
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].milhar).toBe("0763");
    expect(rows[0].centena).toBe("763");
  });

  test("horário e posição podem superar frequência histórica geral", () => {
    const draws = [
      draw({
        ymd: "2026-06-01",
        hour: "11:00",
        prizes: [
          prize("2619", 2),
        ],
      }),

      draw({
        ymd: "2026-06-02",
        hour: "11:00",
        prizes: [
          prize("2619", 2),
        ],
      }),

      draw({
        ymd: "2026-06-03",
        hour: "11:00",
        prizes: [
          prize("2619", 2),
        ],
      }),

      draw({
        ymd: "2026-06-04",
        hour: "14:00",
        prizes: [
          prize("5619", 1),
        ],
      }),

      draw({
        ymd: "2026-06-11",
        hour: "14:00",
        prizes: [
          prize("5619", 1),
        ],
      }),

      draw({
        ymd: "2026-06-18",
        hour: "14:00",
        prizes: [
          prize("5619", 1),
        ],
      }),
    ];

    const recommendation =
      buildMilharRecommendationV3({
        centena: "619",
        draws,
        targetYmd: "2026-06-25",
        targetHour: "14:00",
        targetPosition: 1,
      });

    expect(recommendation.ok).toBe(true);
    expect(recommendation.milhar).toBe("5619");
  });

  test("preserva a centena em todo o ranking", () => {
    const ranking = rankMilharCandidatesV3({
      centena: "074",
      draws: [
        draw({
          ymd: "2026-07-01",
          hour: "09:00",
          prizes: [
            prize("3074", 1),
            prize("6074", 2),
          ],
        }),
      ],
      targetYmd: "2026-07-08",
      targetHour: "09:00",
      targetPosition: 1,
    });

    expect(ranking).toHaveLength(10);

    for (const item of ranking) {
      expect(
        item.milhar.endsWith("074")
      ).toBe(true);
    }
  });

  test("não depende de diversificação global", () => {
    const draws = [
      draw({
        ymd: "2026-07-01",
        hour: "14:00",
        prizes: [
          prize("5619", 1),
          prize("5620", 2),
        ],
      }),

      draw({
        ymd: "2026-07-08",
        hour: "14:00",
        prizes: [
          prize("5619", 1),
          prize("5620", 2),
        ],
      }),
    ];

    const a = buildMilharRecommendationV3({
      centena: "619",
      draws,
      targetYmd: "2026-07-15",
      targetHour: "14:00",
      targetPosition: 1,
    });

    const b = buildMilharRecommendationV3({
      centena: "620",
      draws,
      targetYmd: "2026-07-15",
      targetHour: "14:00",
      targetPosition: 2,
    });

    expect(a.milhar).toBe("5619");
    expect(b.milhar).toBe("5620");
  });
});
