"use strict";

/**
 * TPP-01.04
 *
 * Harness experimental para medir a contribuição dos
 * módulos frequency e context no reranqueamento oficial.
 *
 * Este arquivo não é utilizado pela produção.
 */

const fs = require("fs");
const path = require("path");

const {
  runOfficialBacktest,
} = require("./backtestTop3Official");

const VALID_VARIANTS = new Map([
  ["A00", "BASELINE_COMPLETO"],
  ["BASELINE", "BASELINE_COMPLETO"],
  ["BASELINE_COMPLETO", "BASELINE_COMPLETO"],

  ["A01", "SEM_FREQUENCY"],
  ["SEM_FREQUENCY", "SEM_FREQUENCY"],

  ["A02", "SEM_CONTEXT"],
  ["SEM_CONTEXT", "SEM_CONTEXT"],
]);

function parseStringFlag(
  args,
  name,
  fallback = null
) {
  const prefix = `--${name}=`;

  const match = args.find(
    (arg) => String(arg).startsWith(prefix)
  );

  if (!match) return fallback;

  return String(match)
    .slice(prefix.length)
    .trim();
}

function parseIntegerFlag(
  args,
  name,
  fallback = null
) {
  const raw = parseStringFlag(
    args,
    name,
    null
  );

  if (
    raw == null ||
    raw === ""
  ) {
    return fallback;
  }

  const value = Number(raw);

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `Parâmetro --${name} inválido.`
    );
  }

  return value;
}

function normalizeVariant(value) {
  const key = String(
    value || "A00"
  )
    .trim()
    .toUpperCase();

  const normalized =
    VALID_VARIANTS.get(key);

  if (!normalized) {
    throw new Error(
      `Variante inválida: ${value}. ` +
      "Use A00, A01 ou A02."
    );
  }

  return normalized;
}

function firstFiniteNumber(
  values,
  fallback = null
) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return fallback;
}

function normalizeMetricBucket(
  bucket = {},
  fallbackTotal = null
) {
  const hits = firstFiniteNumber(
    [
      bucket?.hits,
      bucket?.hit,
      bucket?.correct,
      bucket?.successes,
      bucket?.count,
    ],
    null
  );

  const total = firstFiniteNumber(
    [
      bucket?.total,
      bucket?.evaluated,
      bucket?.cases,
      bucket?.samples,
      fallbackTotal,
    ],
    null
  );

  let rate = firstFiniteNumber(
    [
      bucket?.rate,
      bucket?.percentage,
      bucket?.percent,
      bucket?.accuracy,
    ],
    null
  );

  if (
    rate == null &&
    hits != null &&
    total != null &&
    total > 0
  ) {
    rate =
      (hits / total) * 100;
  }

  return {
    hits,
    total,
    rate,
  };
}

function pickComparableResult(result = {}) {
  const globalBucket =
    result?.global ||
    result?.overall ||
    result?.summary ||
    result?.metrics ||
    {};

  const evaluated = firstFiniteNumber(
    [
      result?.evaluated,
      result?.evaluationCount,
      result?.casesEvaluated,
      result?.totalEvaluated,
      globalBucket?.evaluated,
      globalBucket?.total,
      globalBucket?.cases,
      globalBucket?.samples,
    ],
    null
  );

  const top1Bucket =
    globalBucket?.top1 ||
    result?.top1 ||
    result?.metrics?.top1 ||
    result?.summary?.top1 ||
    {};

  const top3Bucket =
    globalBucket?.top3 ||
    result?.top3 ||
    result?.metrics?.top3 ||
    result?.summary?.top3 ||
    {};

  const top1 = normalizeMetricBucket(
    {
      ...top1Bucket,
      hits: firstFiniteNumber(
        [
          top1Bucket?.hits,
          globalBucket?.top1Hits,
          result?.top1Hits,
          result?.metrics?.top1Hits,
          result?.summary?.top1Hits,
        ],
        null
      ),
      total: firstFiniteNumber(
        [
          top1Bucket?.total,
          globalBucket?.top1Total,
          result?.top1Total,
          evaluated,
        ],
        null
      ),
      rate: firstFiniteNumber(
        [
          top1Bucket?.rate,
          globalBucket?.top1Rate,
          result?.top1Rate,
          result?.metrics?.top1Rate,
          result?.summary?.top1Rate,
        ],
        null
      ),
    },
    evaluated
  );

  const top3 = normalizeMetricBucket(
    {
      ...top3Bucket,
      hits: firstFiniteNumber(
        [
          top3Bucket?.hits,
          globalBucket?.top3Hits,
          result?.top3Hits,
          result?.metrics?.top3Hits,
          result?.summary?.top3Hits,
        ],
        null
      ),
      total: firstFiniteNumber(
        [
          top3Bucket?.total,
          globalBucket?.top3Total,
          result?.top3Total,
          evaluated,
        ],
        null
      ),
      rate: firstFiniteNumber(
        [
          top3Bucket?.rate,
          globalBucket?.top3Rate,
          result?.top3Rate,
          result?.metrics?.top3Rate,
          result?.summary?.top3Rate,
        ],
        null
      ),
    },
    evaluated
  );

  const errors = firstFiniteNumber(
    [
      result?.errors,
      globalBucket?.errors,
      result?.errorCount,
      result?.summary?.errors,
      result?.metrics?.errors,
    ],
    0
  );

  return {
    ok: result.ok === true,
    lotteryKey:
      result.lotteryKey || null,
    engine:
      result.engine || null,
    evaluated,
    skipped: firstFiniteNumber(
      [
        result?.skipped,
        globalBucket?.skipped,
      ],
      0
    ),
    top1,
    top3,
    errors,
    byHour:
      result.byHour || {},
    byWeekday:
      result.byWeekday || {},
    byMonth:
      result.byMonth || {},
  };
}

function assertComparableMetrics(
  comparable,
  label
) {
  const failures = [];

  if (
    !Number.isFinite(
      Number(comparable?.evaluated)
    ) ||
    Number(comparable.evaluated) <= 0
  ) {
    failures.push(
      "evaluated ausente ou igual a zero"
    );
  }

  if (
    !Number.isFinite(
      Number(comparable?.top1?.hits)
    )
  ) {
    failures.push(
      "TOP1 hits não localizado"
    );
  }

  if (
    !Number.isFinite(
      Number(comparable?.top1?.total)
    ) ||
    Number(comparable.top1.total) <= 0
  ) {
    failures.push(
      "TOP1 total ausente ou igual a zero"
    );
  }

  if (
    !Number.isFinite(
      Number(comparable?.top3?.hits)
    )
  ) {
    failures.push(
      "TOP3 hits não localizado"
    );
  }

  if (
    !Number.isFinite(
      Number(comparable?.top3?.total)
    ) ||
    Number(comparable.top3.total) <= 0
  ) {
    failures.push(
      "TOP3 total ausente ou igual a zero"
    );
  }

  if (failures.length) {
    throw new Error(
      `${label}: métricas inválidas — ` +
      failures.join("; ")
    );
  }
}

function stableSortObject(value) {
  if (Array.isArray(value)) {
    return value.map(stableSortObject);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.keys(value)
      .sort()
      .reduce((out, key) => {
        out[key] =
          stableSortObject(value[key]);

        return out;
      }, {});
  }

  return value;
}

function stableJson(value) {
  return JSON.stringify(
    stableSortObject(value)
  );
}

async function runWithVariant(
  variant,
  options
) {
  const previous =
    globalThis.__TOP3_ABLATION__;

  try {
    if (
      variant === "BASELINE_OFICIAL"
    ) {
      delete globalThis.__TOP3_ABLATION__;
    } else {
      globalThis.__TOP3_ABLATION__ =
        variant;
    }

    return await runOfficialBacktest(
      {
        ...options,
        progress: false,
        telemetry: true,
      }
    );
  } finally {
    if (previous == null) {
      delete globalThis.__TOP3_ABLATION__;
    } else {
      globalThis.__TOP3_ABLATION__ =
        previous;
    }
  }
}

async function main() {
  const args =
    process.argv.slice(2);

  const lotteryKey = String(
    args[0] || "PT_RIO"
  )
    .trim()
    .toUpperCase();

  const requestedVariant =
    parseStringFlag(
      args,
      "variant",
      "A00"
    );

  const variant =
    normalizeVariant(
      requestedVariant
    );

  const limit =
    parseIntegerFlag(
      args,
      "limit",
      100
    );

  const minHistory =
    parseIntegerFlag(
      args,
      "min-history",
      100
    );

  const from =
    parseStringFlag(
      args,
      "from",
      null
    );

  const to =
    parseStringFlag(
      args,
      "to",
      null
    );

  const outputDir = path.resolve(
    parseStringFlag(
      args,
      "output-dir",
      "tmp"
    )
  );

  fs.mkdirSync(
    outputDir,
    {
      recursive: true,
    }
  );

  const commonOptions = {
    lotteryKey,
    limit,
    minHistory,
    from,
    to,
  };

  console.log("");
  console.log(
    "===== TPP-01.04 - HARNESS DE ABLAÇÃO ====="
  );
  console.log("");
  console.log(
    "Loteria............:",
    lotteryKey
  );
  console.log(
    "Variante solicitada:",
    requestedVariant
  );
  console.log(
    "Variante normalizada:",
    variant
  );
  console.log(
    "Limite.............:",
    limit
  );
  console.log(
    "Histórico mínimo...:",
    minHistory
  );
  console.log("");

  const baselineOfficial =
    await runWithVariant(
      "BASELINE_OFICIAL",
      commonOptions
    );

  const variantResult =
    await runWithVariant(
      variant,
      commonOptions
    );

  const baselineComparable =
    pickComparableResult(
      baselineOfficial
    );

  const variantComparable =
    pickComparableResult(
      variantResult
    );

  assertComparableMetrics(
    baselineComparable,
    "BASELINE OFICIAL"
  );

  assertComparableMetrics(
    variantComparable,
    "VARIANTE"
  );

  const equivalent =
    stableJson(
      baselineComparable
    ) ===
    stableJson(
      variantComparable
    );

  const result = {
    ok: true,
    generatedAt:
      new Date().toISOString(),
    experiment:
      "TPP-01.04",
    lotteryKey,
    requestedVariant,
    variant,
    limit,
    minHistory,
    from,
    to,
    baselineOfficial:
      baselineComparable,

    baselineTelemetry:
      baselineOfficial.telemetry,
    variantResult:
      variantComparable,

    variantTelemetry:
      variantResult.telemetry,
    comparison: {
      equivalent,
      top1HitsDelta:
        variantComparable.top1.hits -
        baselineComparable.top1.hits,
      top3HitsDelta:
        variantComparable.top3.hits -
        baselineComparable.top3.hits,
      errorsDelta:
        variantComparable.errors -
        baselineComparable.errors,
    },
  };

  const jsonPath = path.join(
    outputDir,
    "tpp01_04_harness_validation.json"
  );

  const txtPath = path.join(
    outputDir,
    "tpp01_04_harness_validation.txt"
  );

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      result,
      null,
      2
    ) + "\n",
    "utf8"
  );

  const lines = [
    "=".repeat(100),
    "TPP-01.04 - VALIDAÇÃO DO HARNESS",
    "=".repeat(100),
    "",
    `Loteria: ${lotteryKey}`,
    `Variante: ${variant}`,
    `Casos: ${limit}`,
    `Histórico mínimo: ${minHistory}`,
    "",
    `Casos avaliados no baseline: ${baselineComparable.evaluated}`,
    `Casos avaliados na variante: ${variantComparable.evaluated}`,
    "",
    "BASELINE OFICIAL",
    `TOP1: ${baselineComparable.top1.hits}`,
    `TOP3: ${baselineComparable.top3.hits}`,
    `Erros: ${baselineComparable.errors}`,
    "",
    "RESULTADO DA VARIANTE",
    `TOP1: ${variantComparable.top1.hits}`,
    `TOP3: ${variantComparable.top3.hits}`,
    `Erros: ${variantComparable.errors}`,
    "",
    "COMPARAÇÃO",
    `Equivalente: ${equivalent ? "SIM" : "NÃO"}`,
    `Delta TOP1: ${result.comparison.top1HitsDelta}`,
    `Delta TOP3: ${result.comparison.top3HitsDelta}`,
    `Delta erros: ${result.comparison.errorsDelta}`,
    "",
  ];

  if (
    variant === "BASELINE_COMPLETO" &&
    !equivalent
  ) {
    lines.push(
      "STATUS: FALHA — A00 divergiu do baseline oficial."
    );
  } else if (
    variant === "BASELINE_COMPLETO"
  ) {
    lines.push(
      "STATUS: OK — A00 equivalente ao baseline oficial."
    );
  } else {
    lines.push(
      "STATUS: VARIANTE EXPERIMENTAL EXECUTADA."
    );
  }

  fs.writeFileSync(
    txtPath,
    lines.join("\n") + "\n",
    "utf8"
  );

  console.log(
    lines.join("\n")
  );

  console.log("");
  console.log(
    `JSON: ${jsonPath}`
  );
  console.log(
    `TXT : ${txtPath}`
  );

  if (
    variant === "BASELINE_COMPLETO" &&
    !equivalent
  ) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("");
  console.error(
    "Falha no harness de ablação:"
  );
  console.error(
    error?.stack ||
    error?.message ||
    error
  );

  process.exitCode = 1;
});

