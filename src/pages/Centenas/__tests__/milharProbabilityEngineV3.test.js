import {
  buildMilharRecommendationV3,
  buildPrefixRankingV3,
  diversifyMilharRecommendationsV3,
} from "../modules/milharProbabilityEngineV3";

function prize(milhar, ymd = "2026-07-01") {
  return {
    milhar,
    ymd,
  };
}

describe("Motor contextual de unidade de milhar V3", () => {
  test("preserva integralmente a centena", () => {
    const recommendation =
      buildMilharRecommendationV3({
        centena: "634",
        prizes: [
          prize("5634"),
          prize("5123"),
          prize("5987"),
        ],
      });

    expect(recommendation.ok).toBe(true);
    expect(
      recommendation.milhar.endsWith("634")
    ).toBe(true);

    for (const candidate of recommendation.candidates) {
      expect(
        candidate.milhar.endsWith("634")
      ).toBe(true);
    }
  });

  test("não depende da repetição da milhar exata", () => {
    const recommendation =
      buildMilharRecommendationV3({
        centena: "634",
        prizes: [
          prize("5123"),
          prize("5456"),
          prize("5789"),
          prize("5012"),
          prize("1634"),
        ],
      });

    expect(recommendation.ok).toBe(true);
    expect(recommendation.milhar).toBe("5634");
  });

  test("gera ranking das dez unidades", () => {
    const ranking = buildPrefixRankingV3({
      prizes: [
        prize("1123"),
        prize("2456"),
        prize("2789"),
      ],
    });

    expect(ranking).toHaveLength(10);

    expect(
      ranking.map((item) => item.prefixo).sort()
    ).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ]);
  });

  test("histórico amplo funciona como fallback", () => {
    const recommendation =
      buildMilharRecommendationV3({
        centena: "074",
        prizes: [],
        fallbackPrizes: [
          prize("6074"),
          prize("6123"),
          prize("6456"),
        ],
      });

    expect(recommendation.ok).toBe(true);
    expect(recommendation.milhar).toBe("6074");
  });

  test("diversificação preserva cada centena", () => {
    const rows = Array.from(
      { length: 40 },
      (_, index) => {
        const centena = String(
          100 + index
        ).slice(-3);

        const recommendation =
          buildMilharRecommendationV3({
            centena,
            prizes: [
              prize("5123"),
              prize("5456"),
              prize("5789"),
            ],
          });

        return {
          centena,
          count: 0,
          milhar: recommendation.milhar,
          recommendation,
        };
      }
    );

    const diversified =
      diversifyMilharRecommendationsV3(rows, {
        maxPerPrefix: 4,
        repeatPenalty: 12,
      });

    expect(diversified).toHaveLength(40);

    for (const row of diversified) {
      expect(
        row.milhar.endsWith(row.centena)
      ).toBe(true);
    }
  });
});
