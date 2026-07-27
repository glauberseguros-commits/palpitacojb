"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const INPUT_DIR = path.resolve(
  ROOT,
  "tmp/tpp03_06_telemetry_runs"
);

const OUTPUT_JSON = path.resolve(
  ROOT,
  "tmp/tpp03_07_case_by_case_comparison.json"
);

const OUTPUT_TXT = path.resolve(
  ROOT,
  "tmp/tpp03_07_case_by_case_comparison.txt"
);

const OUTPUT_CSV = path.resolve(
  ROOT,
  "tmp/tpp03_07_changed_cases.csv"
);

const FILES = {
  A00: path.join(
    INPUT_DIR,
    "tpp03_06_A00_BASELINE_COMPLETO_limit_500.json"
  ),
  A01: path.join(
    INPUT_DIR,
    "tpp03_06_A01_SEM_FREQUENCY_limit_500.json"
  ),
  A02: path.join(
    INPUT_DIR,
    "tpp03_06_A02_SEM_CONTEXT_limit_500.json"
  ),
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Arquivo não encontrado: ${filePath}`
    );
  }

  return JSON.parse(
    fs.readFileSync(
      filePath,
      "utf8"
    )
  );
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function normalizeGroup(value) {
  const number = Number(value);

  return Number.isInteger(number)
    ? number
    : null;
}

function normalizeGroups(value) {
  return safeArray(value)
    .map(normalizeGroup)
    .filter(
      (group) => group != null
    )
    .slice(0, 3);
}

function normalizeBoolean(value) {
  return value === true;
}

function caseKey(item) {
  const historyIndex =
    Number(item?.historyIndex);

  if (Number.isInteger(historyIndex)) {
    return `historyIndex:${historyIndex}`;
  }

  const ymd =
    String(item?.target?.ymd || "");

  const hour =
    String(item?.target?.hour || "");

  const caseNumber =
    Number(item?.caseNumber);

  return [
    "target",
    ymd,
    hour,
    Number.isInteger(caseNumber)
      ? caseNumber
      : "",
  ].join(":");
}

function indexCases(cases) {
  const map = new Map();

  for (const item of safeArray(cases)) {
    const key = caseKey(item);

    if (map.has(key)) {
      throw new Error(
        `Caso duplicado na telemetria: ${key}`
      );
    }

    map.set(
      key,
      item
    );
  }

  return map;
}

function arraysEqual(a, b) {
  return (
    a.length === b.length &&
    a.every(
      (value, index) =>
        value === b[index]
    )
  );
}

function sameMembership(a, b) {
  const sortedA = [...a].sort(
    (x, y) => x - y
  );

  const sortedB = [...b].sort(
    (x, y) => x - y
  );

  return arraysEqual(
    sortedA,
    sortedB
  );
}

function difference(a, b) {
  const setB = new Set(b);

  return a.filter(
    (value) => !setB.has(value)
  );
}

function getCandidateMap(item) {
  const map = new Map();

  for (
    const candidate of safeArray(
      item?.candidates
    )
  ) {
    const group = normalizeGroup(
      candidate?.grupo ??
      candidate?.group
    );

    if (group == null) {
      continue;
    }

    map.set(
      group,
      {
        rank:
          Number(candidate?.rank) || null,
        score:
          Number.isFinite(
            Number(candidate?.score)
          )
            ? Number(candidate.score)
            : null,
        scoreProb:
          Number.isFinite(
            Number(candidate?.scoreProb)
          )
            ? Number(candidate.scoreProb)
            : null,
        frequency:
          Number.isFinite(
            Number(candidate?.frequency)
          )
            ? Number(candidate.frequency)
            : null,
        context:
          candidate?.context ?? null,
      }
    );
  }

  return map;
}

function compareCandidateScores(
  baselineCase,
  variantCase
) {
  const baselineMap =
    getCandidateMap(baselineCase);

  const variantMap =
    getCandidateMap(variantCase);

  const groups = Array.from(
    new Set([
      ...baselineMap.keys(),
      ...variantMap.keys(),
    ])
  ).sort(
    (a, b) => a - b
  );

  const changes = [];

  for (const group of groups) {
    const baseline =
      baselineMap.get(group) || null;

    const variant =
      variantMap.get(group) || null;

    const baselineScore =
      baseline?.score;

    const variantScore =
      variant?.score;

    const scoreChanged =
      baselineScore !== variantScore;

    const rankChanged =
      baseline?.rank !== variant?.rank;

    if (
      scoreChanged ||
      rankChanged
    ) {
      changes.push({
        group,
        baselineRank:
          baseline?.rank ?? null,
        variantRank:
          variant?.rank ?? null,
        baselineScore:
          baselineScore ?? null,
        variantScore:
          variantScore ?? null,
        scoreDelta:
          Number.isFinite(baselineScore) &&
          Number.isFinite(variantScore)
            ? variantScore - baselineScore
            : null,
      });
    }
  }

  return changes;
}

function classifyOutcome(
  baselineTop1Hit,
  variantTop1Hit,
  baselineTop3Hit,
  variantTop3Hit
) {
  let top1Impact = "UNCHANGED";
  let top3Impact = "UNCHANGED";

  if (
    !baselineTop1Hit &&
    variantTop1Hit
  ) {
    top1Impact = "IMPROVEMENT";
  } else if (
    baselineTop1Hit &&
    !variantTop1Hit
  ) {
    top1Impact = "REGRESSION";
  }

  if (
    !baselineTop3Hit &&
    variantTop3Hit
  ) {
    top3Impact = "IMPROVEMENT";
  } else if (
    baselineTop3Hit &&
    !variantTop3Hit
  ) {
    top3Impact = "REGRESSION";
  }

  return {
    top1Impact,
    top3Impact,
  };
}

function compareVariant({
  code,
  name,
  baselineCases,
  variantCases,
}) {
  const baselineMap =
    indexCases(baselineCases);

  const variantMap =
    indexCases(variantCases);

  const baselineKeys = Array.from(
    baselineMap.keys()
  );

  const variantKeys = Array.from(
    variantMap.keys()
  );

  const missingInVariant =
    baselineKeys.filter(
      (key) => !variantMap.has(key)
    );

  const extraInVariant =
    variantKeys.filter(
      (key) => !baselineMap.has(key)
    );

  if (
    missingInVariant.length > 0 ||
    extraInVariant.length > 0
  ) {
    throw new Error(
      `${code}: conjuntos de casos incompatíveis. ` +
      `Ausentes=${missingInVariant.length}; ` +
      `extras=${extraInVariant.length}`
    );
  }

  const summary = {
    totalCases: baselineKeys.length,
    identicalCases: 0,
    changedCases: 0,

    top1Changed: 0,
    top3ExactOrderChanged: 0,
    top3MembershipChanged: 0,
    orderOnlyChanged: 0,

    groupsEnteredTop3: 0,
    groupsExitedTop3: 0,

    top1Improvements: 0,
    top1Regressions: 0,

    top3Improvements: 0,
    top3Regressions: 0,

    changedWithoutHitImpact: 0,
    candidateScoreChangedCases: 0,
  };

  const changedCases = [];

  for (const key of baselineKeys) {
    const baselineCase =
      baselineMap.get(key);

    const variantCase =
      variantMap.get(key);

    const baselineGroups =
      normalizeGroups(
        baselineCase?.prediction?.groups
      );

    const variantGroups =
      normalizeGroups(
        variantCase?.prediction?.groups
      );

    if (
      baselineGroups.length !== 3 ||
      variantGroups.length !== 3
    ) {
      throw new Error(
        `${code}: Top3 inválido no caso ${key}.`
      );
    }

    const actualGroup =
      normalizeGroup(
        baselineCase?.actual?.group
      );

    const variantActualGroup =
      normalizeGroup(
        variantCase?.actual?.group
      );

    if (
      actualGroup !== variantActualGroup
    ) {
      throw new Error(
        `${code}: grupo real divergente no caso ${key}.`
      );
    }

    const baselineTop1Hit =
      normalizeBoolean(
        baselineCase?.prediction?.top1Hit
      );

    const variantTop1Hit =
      normalizeBoolean(
        variantCase?.prediction?.top1Hit
      );

    const baselineTop3Hit =
      normalizeBoolean(
        baselineCase?.prediction?.top3Hit
      );

    const variantTop3Hit =
      normalizeBoolean(
        variantCase?.prediction?.top3Hit
      );

    const exactOrderEqual =
      arraysEqual(
        baselineGroups,
        variantGroups
      );

    const membershipEqual =
      sameMembership(
        baselineGroups,
        variantGroups
      );

    const top1Changed =
      baselineGroups[0] !==
      variantGroups[0];

    const entered =
      difference(
        variantGroups,
        baselineGroups
      );

    const exited =
      difference(
        baselineGroups,
        variantGroups
      );

    const outcome =
      classifyOutcome(
        baselineTop1Hit,
        variantTop1Hit,
        baselineTop3Hit,
        variantTop3Hit
      );

    const scoreChanges =
      compareCandidateScores(
        baselineCase,
        variantCase
      );

    const candidateScoresChanged =
      scoreChanges.length > 0;

    const caseChanged =
      !exactOrderEqual ||
      candidateScoresChanged;

    if (!caseChanged) {
      summary.identicalCases += 1;
      continue;
    }

    summary.changedCases += 1;

    if (top1Changed) {
      summary.top1Changed += 1;
    }

    if (!exactOrderEqual) {
      summary.top3ExactOrderChanged += 1;
    }

    if (!membershipEqual) {
      summary.top3MembershipChanged += 1;
    }

    if (
      membershipEqual &&
      !exactOrderEqual
    ) {
      summary.orderOnlyChanged += 1;
    }

    summary.groupsEnteredTop3 +=
      entered.length;

    summary.groupsExitedTop3 +=
      exited.length;

    if (
      outcome.top1Impact ===
      "IMPROVEMENT"
    ) {
      summary.top1Improvements += 1;
    }

    if (
      outcome.top1Impact ===
      "REGRESSION"
    ) {
      summary.top1Regressions += 1;
    }

    if (
      outcome.top3Impact ===
      "IMPROVEMENT"
    ) {
      summary.top3Improvements += 1;
    }

    if (
      outcome.top3Impact ===
      "REGRESSION"
    ) {
      summary.top3Regressions += 1;
    }

    if (
      baselineTop1Hit ===
        variantTop1Hit &&
      baselineTop3Hit ===
        variantTop3Hit
    ) {
      summary.changedWithoutHitImpact += 1;
    }

    if (candidateScoresChanged) {
      summary.candidateScoreChangedCases += 1;
    }

    changedCases.push({
      key,
      caseNumber:
        baselineCase?.caseNumber ?? null,
      historyIndex:
        baselineCase?.historyIndex ?? null,
      ymd:
        baselineCase?.target?.ymd ?? null,
      hour:
        baselineCase?.target?.hour ?? null,
      weekday:
        baselineCase?.target?.weekday ?? null,
      actualGroup,

      baselineGroups,
      variantGroups,

      top1Changed,
      exactOrderEqual,
      membershipEqual,
      orderOnlyChanged:
        membershipEqual &&
        !exactOrderEqual,

      enteredTop3: entered,
      exitedTop3: exited,

      baselineTop1Hit,
      variantTop1Hit,
      baselineTop3Hit,
      variantTop3Hit,

      top1Impact:
        outcome.top1Impact,
      top3Impact:
        outcome.top3Impact,

      candidateScoresChanged,
      scoreChanges,
    });
  }

  return {
    code,
    name,
    summary,
    changedCases,
  };
}

function compareBaselineRuns(
  datasets
) {
  const sourceEntries =
    Object.entries(datasets);

  const referenceCode =
    sourceEntries[0][0];

  const referenceCases =
    safeArray(
      sourceEntries[0][1]
        ?.baselineTelemetry
        ?.cases
    );

  const referenceMap =
    indexCases(referenceCases);

  const comparisons = [];

  for (
    let index = 1;
    index < sourceEntries.length;
    index += 1
  ) {
    const [
      code,
      dataset,
    ] = sourceEntries[index];

    const candidateCases =
      safeArray(
        dataset
          ?.baselineTelemetry
          ?.cases
      );

    const candidateMap =
      indexCases(candidateCases);

    let differences = 0;

    for (
      const [
        key,
        referenceCase,
      ] of referenceMap.entries()
    ) {
      const candidateCase =
        candidateMap.get(key);

      if (!candidateCase) {
        differences += 1;
        continue;
      }

      const referenceGroups =
        normalizeGroups(
          referenceCase
            ?.prediction
            ?.groups
        );

      const candidateGroups =
        normalizeGroups(
          candidateCase
            ?.prediction
            ?.groups
        );

      if (
        !arraysEqual(
          referenceGroups,
          candidateGroups
        ) ||
        normalizeGroup(
          referenceCase?.actual?.group
        ) !==
          normalizeGroup(
            candidateCase?.actual?.group
          )
      ) {
        differences += 1;
      }
    }

    comparisons.push({
      reference: referenceCode,
      compared: code,
      referenceCases:
        referenceMap.size,
      comparedCases:
        candidateMap.size,
      differences,
      equivalent:
        differences === 0 &&
        referenceMap.size ===
          candidateMap.size,
    });
  }

  return comparisons;
}

function csvEscape(value) {
  if (value == null) {
    return "";
  }

  const text =
    typeof value === "string"
      ? value
      : JSON.stringify(value);

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return (
      '"' +
      text.replace(
        /"/g,
        '""'
      ) +
      '"'
    );
  }

  return text;
}

const datasets = {
  A00: readJson(FILES.A00),
  A01: readJson(FILES.A01),
  A02: readJson(FILES.A02),
};

for (
  const [
    code,
    dataset,
  ] of Object.entries(datasets)
) {
  const baselineCases =
    dataset
      ?.baselineTelemetry
      ?.cases;

  const variantCases =
    dataset
      ?.variantTelemetry
      ?.cases;

  if (
    !Array.isArray(baselineCases) ||
    !Array.isArray(variantCases)
  ) {
    throw new Error(
      `${code}: telemetria ausente ou inválida.`
    );
  }

  if (
    baselineCases.length !== 500 ||
    variantCases.length !== 500
  ) {
    throw new Error(
      `${code}: esperado 500 casos em cada lado. ` +
      `Baseline=${baselineCases.length}; ` +
      `variante=${variantCases.length}`
    );
  }
}

const baselineConsistency =
  compareBaselineRuns(datasets);

const comparisons = [
  compareVariant({
    code: "A00",
    name: "BASELINE_COMPLETO",
    baselineCases:
      datasets.A00
        .baselineTelemetry
        .cases,
    variantCases:
      datasets.A00
        .variantTelemetry
        .cases,
  }),

  compareVariant({
    code: "A01",
    name: "SEM_FREQUENCY",
    baselineCases:
      datasets.A01
        .baselineTelemetry
        .cases,
    variantCases:
      datasets.A01
        .variantTelemetry
        .cases,
  }),

  compareVariant({
    code: "A02",
    name: "SEM_CONTEXT",
    baselineCases:
      datasets.A02
        .baselineTelemetry
        .cases,
    variantCases:
      datasets.A02
        .variantTelemetry
        .cases,
  }),
];

const a00 =
  comparisons.find(
    (item) => item.code === "A00"
  );

const baselineConsistent =
  baselineConsistency.every(
    (item) => item.equivalent
  );

const a00RankingEquivalent =
  a00.summary.top3ExactOrderChanged === 0;

const report = {
  ok:
    baselineConsistent &&
    a00RankingEquivalent,

  generatedAt:
    new Date().toISOString(),

  experiment:
    "TPP-03.07",

  lotteryKey:
    datasets.A00
      ?.lotteryKey ??
    "PT_RIO",

  limit: 500,

  baselineConsistency,

  controls: {
    baselineConsistent,
    a00RankingEquivalent,
    a00ChangedCases:
      a00.summary.changedCases,
  },

  comparisons,
};

fs.writeFileSync(
  OUTPUT_JSON,
  JSON.stringify(
    report,
    null,
    2
  ) + "\n",
  "utf8"
);

const csvHeader = [
  "variant",
  "variant_name",
  "case_number",
  "history_index",
  "ymd",
  "hour",
  "weekday",
  "actual_group",
  "baseline_groups",
  "variant_groups",
  "top1_changed",
  "membership_changed",
  "order_only_changed",
  "entered_top3",
  "exited_top3",
  "baseline_top1_hit",
  "variant_top1_hit",
  "baseline_top3_hit",
  "variant_top3_hit",
  "top1_impact",
  "top3_impact",
  "candidate_scores_changed",
].join(",");

const csvRows = [
  csvHeader,
];

for (const comparison of comparisons) {
  for (
    const item of comparison.changedCases
  ) {
    csvRows.push(
      [
        comparison.code,
        comparison.name,
        item.caseNumber,
        item.historyIndex,
        item.ymd,
        item.hour,
        item.weekday,
        item.actualGroup,
        item.baselineGroups.join("-"),
        item.variantGroups.join("-"),
        item.top1Changed,
        !item.membershipEqual,
        item.orderOnlyChanged,
        item.enteredTop3.join("-"),
        item.exitedTop3.join("-"),
        item.baselineTop1Hit,
        item.variantTop1Hit,
        item.baselineTop3Hit,
        item.variantTop3Hit,
        item.top1Impact,
        item.top3Impact,
        item.candidateScoresChanged,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
}

fs.writeFileSync(
  OUTPUT_CSV,
  csvRows.join("\n") + "\n",
  "utf8"
);

const lines = [];

lines.push(
  "=".repeat(90)
);

lines.push(
  "TPP-03.07 - COMPARAÇÃO DEFINITIVA CASO A CASO"
);

lines.push(
  "=".repeat(90)
);

lines.push("");
lines.push(
  "CONTROLES DE INTEGRIDADE"
);

lines.push(
  "-".repeat(90)
);

for (
  const item of baselineConsistency
) {
  lines.push(
    `${item.reference} x ${item.compared} — ` +
    `baselines equivalentes: ` +
    `${item.equivalent ? "SIM" : "NÃO"} ` +
    `(diferenças=${item.differences})`
  );
}

lines.push(
  `A00 preservou o ranking oficial: ` +
  `${a00RankingEquivalent ? "SIM" : "NÃO"}`
);

lines.push("");

for (const comparison of comparisons) {
  const summary =
    comparison.summary;

  lines.push(
    "-".repeat(90)
  );

  lines.push(
    `${comparison.code} — ${comparison.name}`
  );

  lines.push(
    "-".repeat(90)
  );

  lines.push(
    `Total de casos.....................: ${summary.totalCases}`
  );

  lines.push(
    `Casos totalmente idênticos.........: ${summary.identicalCases}`
  );

  lines.push(
    `Casos com alguma diferença.........: ${summary.changedCases}`
  );

  lines.push(
    `Top1 alterado.......................: ${summary.top1Changed}`
  );

  lines.push(
    `Ordem exata do Top3 alterada........: ${summary.top3ExactOrderChanged}`
  );

  lines.push(
    `Composição do Top3 alterada.........: ${summary.top3MembershipChanged}`
  );

  lines.push(
    `Somente ordem alterada..............: ${summary.orderOnlyChanged}`
  );

  lines.push(
    `Grupos que entraram no Top3.........: ${summary.groupsEnteredTop3}`
  );

  lines.push(
    `Grupos que saíram do Top3...........: ${summary.groupsExitedTop3}`
  );

  lines.push(
    `Melhorias no acerto Top1............: ${summary.top1Improvements}`
  );

  lines.push(
    `Regressões no acerto Top1...........: ${summary.top1Regressions}`
  );

  lines.push(
    `Melhorias no acerto Top3............: ${summary.top3Improvements}`
  );

  lines.push(
    `Regressões no acerto Top3...........: ${summary.top3Regressions}`
  );

  lines.push(
    `Mudanças sem impacto nos acertos....: ${summary.changedWithoutHitImpact}`
  );

  lines.push(
    `Casos com alteração de score/rank...: ${summary.candidateScoreChangedCases}`
  );

  lines.push("");
}

lines.push(
  "=".repeat(90)
);

lines.push(
  `STATUS DE INTEGRIDADE: ${report.ok ? "OK" : "FALHA"}`
);

lines.push(
  "=".repeat(90)
);

fs.writeFileSync(
  OUTPUT_TXT,
  lines.join("\n") + "\n",
  "utf8"
);

console.log(
  lines.join("\n")
);

console.log("");
console.log(
  `JSON detalhado: ${OUTPUT_JSON}`
);

console.log(
  `TXT resumido..: ${OUTPUT_TXT}`
);

console.log(
  `CSV diferenças: ${OUTPUT_CSV}`
);

if (!report.ok) {
  process.exitCode = 1;
}
