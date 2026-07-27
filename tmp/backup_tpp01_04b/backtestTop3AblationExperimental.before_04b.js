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

function pickComparableResult(result = {}) {
  return {
    ok: result.ok === true,
    lotteryKey:
      result.lotteryKey || null,
    engine:
      result.engine || null,
    evaluated:
      Number(result.evaluated || 0),
    skipped:
      Number(result.skipped || 0),
    top1: {
      hits: Number(
        result?.global?.top1?.hits ??
        result?.top1?.hits ??
        0
      ),
      total: Number(
        result?.global?.top1?.total ??
        result?.top1?.total ??
        result.evaluated ??
        0
      ),
      rate: Number(
        result?.global?.top1?.rate ??
        result?.top1?.rate ??
        0
      ),
    },
    top3: {
      hits: Number(
        result?.global?.top3?.hits ??
        result?.top3?.hits ??
        0
      ),
      total: Number(
        result?.global?.top3?.total ??
        result?.top3?.total ??
        result.evaluated ??
        0
      ),
      rate: Number(
        result?.global?.top3?.rate ??
        result?.top3?.rate ??
        0
      ),
    },
    errors: Number(
      result?.global?.errors ??
      result?.errors ??
      0
    ),
    byHour:
      result.byHour || {},
    byWeekday:
      result.byWeekday || {},
    byMonth:
      result.byMonth || {},
  };
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
        telemetry: false,
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
    variantResult:
      variantComparable,
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
