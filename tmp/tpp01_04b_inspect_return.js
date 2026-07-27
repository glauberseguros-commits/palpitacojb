"use strict";

const fs = require("fs");
const path = require("path");

const {
  runOfficialBacktest,
} = require("../backend/scripts/backtestTop3Official");

function describeValue(value) {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }

  return typeof value;
}

function collectPaths(
  value,
  currentPath = "result",
  output = [],
  depth = 0,
  maxDepth = 12
) {
  if (depth > maxDepth) {
    output.push({
      path: currentPath,
      type: "max-depth",
      value: null,
    });

    return output;
  }

  const type = describeValue(value);

  if (
    value === null ||
    typeof value !== "object"
  ) {
    output.push({
      path: currentPath,
      type,
      value:
        typeof value === "string"
          ? value.slice(0, 200)
          : value,
    });

    return output;
  }

  output.push({
    path: currentPath,
    type,
    value: null,
  });

  if (Array.isArray(value)) {
    const sampleSize = Math.min(
      value.length,
      3
    );

    for (
      let index = 0;
      index < sampleSize;
      index += 1
    ) {
      collectPaths(
        value[index],
        `${currentPath}[${index}]`,
        output,
        depth + 1,
        maxDepth
      );
    }

    return output;
  }

  for (
    const [key, child]
    of Object.entries(value)
  ) {
    collectPaths(
      child,
      `${currentPath}.${key}`,
      output,
      depth + 1,
      maxDepth
    );
  }

  return output;
}

function isRelevantPath(pathValue) {
  return (
    /evaluat|top1|top3|hit|rate|error|total|global|overall/i
  ).test(pathValue);
}

async function main() {
  const result =
    await runOfficialBacktest(
      {
        lotteryKey: "PT_RIO",
        limit: 100,
        minHistory: 100,
        progress: false,
        telemetry: false,
      }
    );

  const rawPath = path.resolve(
    "tmp/tpp01_04b_raw_backtest_result.json"
  );

  const schemaPath = path.resolve(
    "tmp/tpp01_04b_return_schema.txt"
  );

  fs.writeFileSync(
    rawPath,
    JSON.stringify(
      result,
      null,
      2
    ) + "\n",
    "utf8"
  );

  const allPaths = collectPaths(
    result
  );

  const relevant = allPaths.filter(
    (item) => isRelevantPath(item.path)
  );

  const lines = [
    "=".repeat(120),
    "TPP-01.04B - ESTRUTURA REAL DO RETORNO",
    "=".repeat(120),
    "",
    `Tipo raiz: ${describeValue(result)}`,
    `Chaves raiz: ${
      Object.keys(result || {}).join(", ")
    }`,
    "",
    "CAMINHOS RELEVANTES",
    "-".repeat(120),
  ];

  for (const item of relevant) {
    lines.push(
      `${item.path} | type=${item.type} | value=${
        item.value === null
          ? ""
          : JSON.stringify(item.value)
      }`
    );
  }

  lines.push("");
  lines.push(
    `JSON bruto: ${rawPath}`
  );

  fs.writeFileSync(
    schemaPath,
    lines.join("\n") + "\n",
    "utf8"
  );

  console.log(
    lines.join("\n")
  );
}

main().catch((error) => {
  console.error(
    error?.stack ||
    error?.message ||
    error
  );

  process.exitCode = 1;
});
