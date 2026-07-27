export const TERNO_GRUPO_MIN_QUANTITY = 1;
export const TERNO_GRUPO_MAX_QUANTITY = 2300;

function clampScore(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return 0;

  if (number >= 0 && number <= 1) {
    return number * 100;
  }

  return Math.max(0, Math.min(100, number));
}

function normalizeGrupo(value) {
  const grupo = Number(value);

  if (
    !Number.isInteger(grupo) ||
    grupo < 1 ||
    grupo > 25
  ) {
    return null;
  }

  return grupo;
}

function extractGrupo(item) {
  return normalizeGrupo(
    item?.grupo ??
      item?.group ??
      item?.grupo2 ??
      item?.animal_grupo ??
      item?.id
  );
}

function extractScore(item) {
  const candidates = [
    item?.score,
    item?.probPct,
    item?.displayConfidence,
    item?.confidence,
    item?.probCond,
    item?.scoreProb,
    item?.prob,
    item?.weight,
    item?.strength,
    item?.frequencyPct,
    item?.rate,
  ];

  for (const candidate of candidates) {
    const number = Number(candidate);

    if (Number.isFinite(number)) {
      return clampScore(number);
    }
  }

  const freq = Number(
    item?.freq ??
      item?.frequency ??
      item?.count ??
      item?.occurrences
  );

  const samples = Number(
    item?.samples ??
      item?.sampleCount ??
      item?.total
  );

  if (
    Number.isFinite(freq) &&
    Number.isFinite(samples) &&
    samples > 0
  ) {
    return clampScore(freq / samples);
  }

  return 0;
}

function collectGroupEvidence(
  value,
  accumulator,
  visited,
  depth = 0
) {
  if (
    value == null ||
    depth > 10
  ) {
    return;
  }

  if (
    typeof value !== "object"
  ) {
    return;
  }

  if (visited.has(value)) {
    return;
  }

  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      collectGroupEvidence(
        item,
        accumulator,
        visited,
        depth + 1
      );
    }

    return;
  }

  const grupo = extractGrupo(value);

  if (grupo != null) {
    const score = extractScore(value);
    const previous = accumulator.get(grupo) || {
      grupo,
      scores: [],
      evidenceCount: 0,
    };

    if (score > 0) {
      previous.scores.push(score);
    }

    previous.evidenceCount += 1;
    accumulator.set(grupo, previous);
  }

  for (const child of Object.values(value)) {
    collectGroupEvidence(
      child,
      accumulator,
      visited,
      depth + 1
    );
  }
}

function buildGroupRanking({
  analytics,
  seedGroups,
}) {
  const evidence = new Map();

  collectGroupEvidence(
    analytics,
    evidence,
    new WeakSet()
  );

  const seeds = Array.isArray(seedGroups)
    ? seedGroups
    : [];

  seeds.forEach((item, index) => {
    const grupo = extractGrupo(item);

    if (grupo == null) return;

    const previous = evidence.get(grupo) || {
      grupo,
      scores: [],
      evidenceCount: 0,
    };

    const score = extractScore(item);

    if (score > 0) {
      previous.scores.push(score);
    } else {
      previous.scores.push(
        Math.max(1, 100 - index)
      );
    }

    previous.evidenceCount += 1;
    evidence.set(grupo, previous);
  });

  const groups = [];

  for (let grupo = 1; grupo <= 25; grupo += 1) {
    const entry = evidence.get(grupo) || {
      grupo,
      scores: [],
      evidenceCount: 0,
    };

    const sortedScores = entry.scores
      .filter(Number.isFinite)
      .sort((a, b) => b - a);

    const strongest = sortedScores[0] || 0;

    const average =
      sortedScores.length > 0
        ? sortedScores.reduce(
            (sum, value) => sum + value,
            0
          ) / sortedScores.length
        : 0;

    const score =
      strongest > 0
        ? strongest * 0.7 + average * 0.3
        : 0;

    groups.push({
      grupo,
      score,
      strongest,
      average,
      evidenceCount: entry.evidenceCount,
    });
  }

  return groups.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    if (b.evidenceCount !== a.evidenceCount) {
      return b.evidenceCount - a.evidenceCount;
    }

    return a.grupo - b.grupo;
  });
}

function calculateTernoScore(items) {
  const scores = items.map(
    (item) => Number(item?.score || 0)
  );

  const average =
    scores.reduce(
      (sum, value) => sum + value,
      0
    ) / scores.length;

  const minimum = Math.min(...scores);
  const maximum = Math.max(...scores);
  const balance = Math.max(
    0,
    100 - (maximum - minimum)
  );

  return (
    average * 0.8 +
    minimum * 0.15 +
    balance * 0.05
  );
}

export function buildAllTernosGrupo({
  analytics,
  seedGroups,
}) {
  const ranking = buildGroupRanking({
    analytics,
    seedGroups,
  });

  const combinations = [];

  for (
    let first = 0;
    first < ranking.length - 2;
    first += 1
  ) {
    for (
      let second = first + 1;
      second < ranking.length - 1;
      second += 1
    ) {
      for (
        let third = second + 1;
        third < ranking.length;
        third += 1
      ) {
        const items = [
          ranking[first],
          ranking[second],
          ranking[third],
        ];

        const grupos = items
          .map((item) => item.grupo)
          .sort((a, b) => a - b);

        combinations.push({
          key: grupos.join("-"),
          grupos,
          items: grupos.map(
            (grupo) =>
              ranking.find(
                (item) => item.grupo === grupo
              )
          ),
          score: calculateTernoScore(items),
          evidenceCount: items.reduce(
            (sum, item) =>
              sum +
              Number(item?.evidenceCount || 0),
            0
          ),
        });
      }
    }
  }

  combinations.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    if (b.evidenceCount !== a.evidenceCount) {
      return (
        b.evidenceCount -
        a.evidenceCount
      );
    }

    return a.key.localeCompare(b.key);
  });

  return combinations.map(
    (combination, index) => ({
      ...combination,
      rank: index + 1,
      scorePct: Math.max(
        0,
        Math.min(100, combination.score)
      ),
      engineVersion:
        "TERNO_GRUPO_V2_2300_RANKED",
      validationRule:
        "3_GROUPS_IN_TOP5",
      orderMatters: false,
    })
  );
}

export function normalizeTernoQuantity(value) {
  const parsed = Number.parseInt(
    String(value ?? "").replace(/\D/g, ""),
    10
  );

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function validateTernoQuantity(value) {
  const quantity = normalizeTernoQuantity(value);

  if (quantity == null) {
    return {
      valid: false,
      quantity: null,
      message:
        "Informe a quantidade de ternos que deseja gerar.",
    };
  }

  if (quantity < TERNO_GRUPO_MIN_QUANTITY) {
    return {
      valid: false,
      quantity,
      message:
        "A quantidade mínima é 1 terno de grupo.",
    };
  }

  if (quantity > TERNO_GRUPO_MAX_QUANTITY) {
    return {
      valid: false,
      quantity,
      message:
        "A quantidade informada é superior às 2.300 combinações possíveis.",
    };
  }

  return {
    valid: true,
    quantity,
    message: "",
  };
}
