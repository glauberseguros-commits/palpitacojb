"use strict";

const fs = require("fs");
const path = require("path");

const {
  runOfficialBacktest,
} = require(
  "../backend/scripts/backtestTop3Official"
);

const OUTPUT = path.resolve(
  "tmp/TOP3_RETORNO_BACKTEST_AUDITORIA.txt"
);

(async () => {
  const result =
    await runOfficialBacktest({
      lotteryKey: "PT_RIO",
      limit: 1,
      minHistory: 100,
      telemetry: true,
    });

  const lines = [];

  lines.push(
    "===== CHAVES DO OBJETO RETORNADO ====="
  );
  lines.push("");

  for (
    const key of Object.keys(result).sort()
  ) {
    const value = result[key];

    const type =
      Array.isArray(value)
        ? "array"
        : typeof value;

    const size =
      Array.isArray(value)
        ? ` (${value.length} itens)`
        : "";

    lines.push(
      `${key} -> ${type}${size}`
    );
  }

  lines.push("");
  lines.push(
    "===== PROCURA POR TELEMETRIA ====="
  );
  lines.push("");

  const candidates = [
    "telemetry",
    "telemetryCases",
    "cases",
    "rows",
    "details",
    "metadata",
    "debug",
    "diagnostics",
  ];

  for (const name of candidates) {
    const exists =
      Object.prototype.hasOwnProperty.call(
        result,
        name
      );

    lines.push(
      `${name.padEnd(18)} : ${
        exists ? "SIM" : "NÃO"
      }`
    );

    if (!exists) {
      continue;
    }

    const value = result[name];

    if (Array.isArray(value)) {
      lines.push(
        `   tamanho = ${value.length}`
      );

      if (
        value.length &&
        value[0] &&
        typeof value[0] === "object"
      ) {
        lines.push(
          `   primeiras chaves = ${
            Object.keys(value[0]).join(", ")
          }`
        );
      }

      continue;
    }

    if (
      value &&
      typeof value === "object"
    ) {
      lines.push(
        `   chaves = ${
          Object.keys(value).join(", ")
        }`
      );

      continue;
    }

    lines.push(
      `   valor = ${String(value)}`
    );
  }

  fs.writeFileSync(
    OUTPUT,
    lines.join("\n"),
    "utf8"
  );

  console.log(
    lines.join("\n")
  );
})().catch((error) => {
  console.error(
    error?.stack ||
    error?.message ||
    error
  );

  process.exit(1);
});
