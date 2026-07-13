import {
  buildMilharRecommendation,
  rankMilharCandidates,
} from "../modules/milharProbabilityEngine";

function prize(milhar) {
  return { milhar };
}

describe("Motor de milhares com fallback individual", () => {
  test("usa primeiro a própria centena no recorte atual", () => {
    const current = [
      prize("1105"),
      prize("7105"),
      prize("1105"),

      // Prefixo forte em outras centenas:
      ...Array.from(
        { length: 80 },
        (_, index) =>
          prize(
            `9${String(200 + (index % 40)).padStart(3, "0")}`
          )
      ),
    ];

    const historical = [
      prize("8105"),
      prize("8105"),
      prize("8105"),
      prize("8105"),
    ];

    const recommendation = buildMilharRecommendation({
      centena: "105",
      prizes: current,
      fallbackPrizes: historical,
    });

    expect(recommendation.ok).toBe(true);
    expect(recommendation.milhar).toBe("1105");
    expect(recommendation.sampleSize).toBe(3);
  });

  test("usa o histórico da própria centena quando não ocorreu no recorte", () => {
    const current = [
      prize("7958"),
      prize("2058"),
      prize("7059"),
      prize("3160"),
    ];

    const historical = [
      prize("4157"),
      prize("2657"),
      prize("4157"),
      prize("8158"),
    ];

    const recommendation = buildMilharRecommendation({
      centena: "157",
      prizes: current,
      fallbackPrizes: historical,
    });

    expect(recommendation.ok).toBe(true);
    expect(recommendation.milhar).toBe("4157");
    expect(recommendation.sampleSize).toBe(2);
  });

  test("produz recomendação mesmo sem ocorrência exata da centena", () => {
    const current = [
      prize("7958"),
      prize("2058"),
      prize("7059"),
      prize("3160"),
    ];

    const recommendation = buildMilharRecommendation({
      centena: "257",
      prizes: current,
      fallbackPrizes: [],
    });

    expect(recommendation.ok).toBe(true);
    expect(recommendation.milhar).toMatch(/^\d257$/);
  });

  test("todas as alternativas preservam a centena solicitada", () => {
    const ranking = rankMilharCandidates({
      centena: "160",
      prizes: [
        prize("3160"),
        prize("4160"),
        prize("3160"),
        prize("7958"),
      ],
      fallbackPrizes: [
        prize("9160"),
      ],
    });

    expect(ranking).toHaveLength(10);

    for (const item of ranking) {
      expect(item.milhar.endsWith("160")).toBe(true);
    }
  });
});
