import {
  buildMilharRecommendation,
  rankMilharCandidates,
} from "../modules/milharProbabilityEngine";

function prize(milhar) {
  return { milhar };
}

describe("Motor de milhares individual por centena", () => {
  test("prefixos frequentes em outras centenas não contaminam a recomendação", () => {
    const unrelated = Array.from(
      { length: 100 },
      (_, index) => prize(`9${String(200 + (index % 40)).padStart(3, "0")}`)
    );

    const prizes = [
      ...unrelated,

      // Histórico real da centena 105:
      prize("1105"),
      prize("7105"),
      prize("1105"),
    ];

    const ranking = rankMilharCandidates({
      centena: "105",
      prizes,
    });

    expect(ranking).toHaveLength(10);
    expect(ranking[0].milhar).toBe("1105");

    const recommendation = buildMilharRecommendation({
      centena: "105",
      prizes,
    });

    expect(recommendation.ok).toBe(true);
    expect(recommendation.milhar).toBe("1105");
    expect(recommendation.prefixo).toBe("1");
    expect(recommendation.sampleSize).toBe(3);
  });

  test("não inventa milhar quando a centena não possui ocorrência histórica", () => {
    const prizes = [
      prize("9205"),
      prize("9306"),
      prize("9407"),
      prize("9508"),
    ];

    const recommendation = buildMilharRecommendation({
      centena: "105",
      prizes,
    });

    expect(recommendation.ok).toBe(false);
    expect(recommendation.status).toBe("insufficient_evidence");
    expect(recommendation.milhar).toBeNull();
    expect(recommendation.sampleSize).toBe(0);
  });

  test("todas as alternativas pertencem à centena solicitada", () => {
    const prizes = [
      prize("1105"),
      prize("2105"),
      prize("1105"),
      prize("8106"),
      prize("8107"),
      prize("8108"),
    ];

    const ranking = rankMilharCandidates({
      centena: "105",
      prizes,
    });

    expect(ranking).toHaveLength(10);

    for (const item of ranking) {
      expect(item.milhar.endsWith("105")).toBe(true);
    }
  });
});
