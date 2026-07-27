"use strict";

const fs = require("fs");
const path = require("path");

const profilePath = process.argv[2];

if (!profilePath) {
  throw new Error("Caminho do CPU Profile não informado.");
}

const raw = fs.readFileSync(profilePath, "utf8");
const profile = JSON.parse(raw);

const nodes = Array.isArray(profile.nodes)
  ? profile.nodes
  : [];

const samples = Array.isArray(profile.samples)
  ? profile.samples
  : [];

const timeDeltas = Array.isArray(profile.timeDeltas)
  ? profile.timeDeltas
  : [];

const nodeById = new Map(
  nodes.map((node) => [Number(node.id), node])
);

const selfMicrosByNode = new Map();

for (let index = 0; index < samples.length; index += 1) {
  const nodeId = Number(samples[index]);
  const delta = Number(timeDeltas[index] || 0);

  selfMicrosByNode.set(
    nodeId,
    Number(selfMicrosByNode.get(nodeId) || 0) + delta
  );
}

function normalizeUrl(url) {
  return String(url || "")
    .replace(/\\/g, "/");
}

function formatMs(micros) {
  return (Number(micros || 0) / 1000).toFixed(3);
}

function formatPct(value, total) {
  if (!Number(total) || total <= 0) {
    return "0.00";
  }

  return (
    Number(value || 0) /
    Number(total) *
    100
  ).toFixed(2);
}

function buildRows(filterFn) {
  return nodes
    .map((node) => {
      const frame = node.callFrame || {};
      const selfMicros = Number(
        selfMicrosByNode.get(Number(node.id)) || 0
      );

      return {
        id: Number(node.id),
        functionName:
          String(frame.functionName || "(anonymous)"),
        url: normalizeUrl(frame.url),
        line:
          Number(frame.lineNumber ?? -1) + 1,
        column:
          Number(frame.columnNumber ?? -1) + 1,
        hitCount:
          Number(node.hitCount || 0),
        selfMicros,
      };
    })
    .filter(filterFn)
    .sort((a, b) => {
      if (b.selfMicros !== a.selfMicros) {
        return b.selfMicros - a.selfMicros;
      }

      return b.hitCount - a.hitCount;
    });
}

const totalMicros = Array.from(
  selfMicrosByNode.values()
).reduce(
  (sum, value) => sum + Number(value || 0),
  0
);

const projectRows = buildRows((row) => {
  return (
    row.selfMicros > 0 &&
    (
      row.url.includes("/src/pages/Top3/") ||
      row.url.includes("/backend/")
    ) &&
    !row.url.includes("/node_modules/")
  );
});

const engineRows = buildRows((row) => {
  return (
    row.selfMicros > 0 &&
    row.url.includes(
      "/src/pages/Top3/top3.engine.js"
    )
  );
});

const allRows = buildRows((row) => {
  return row.selfMicros > 0;
});

function section(title, rows, limit = 30) {
  const lines = [];

  lines.push("");
  lines.push("=".repeat(100));
  lines.push(title);
  lines.push("=".repeat(100));

  if (!rows.length) {
    lines.push("NENHUMA AMOSTRA ENCONTRADA.");
    return lines.join("\n");
  }

  rows
    .slice(0, limit)
    .forEach((row, index) => {
      lines.push(
        [
          String(index + 1).padStart(2, "0"),
          `self=${formatMs(row.selfMicros).padStart(12)} ms`,
          `pct=${formatPct(row.selfMicros, totalMicros).padStart(6)}%`,
          `hits=${String(row.hitCount).padStart(7)}`,
          `${row.functionName}`,
          `${row.url}:${row.line}:${row.column}`,
        ].join(" | ")
      );
    });

  return lines.join("\n");
}

const output = [];

output.push(
  "===================================================================================================="
);

output.push(
  "ANÁLISE AUTOMÁTICA DO CPU PROFILE"
);

output.push(
  "===================================================================================================="
);

output.push(`Arquivo: ${path.resolve(profilePath)}`);
output.push(`Nós: ${nodes.length}`);
output.push(`Samples: ${samples.length}`);
output.push(`Tempo amostrado: ${formatMs(totalMicros)} ms`);

output.push(
  section(
    "TOP 40 — CÓDIGO DO PROJETO",
    projectRows,
    40
  )
);

output.push(
  section(
    "TOP 40 — SOMENTE top3.engine.js",
    engineRows,
    40
  )
);

output.push(
  section(
    "TOP 30 — PERFIL GLOBAL",
    allRows,
    30
  )
);

const groupedByFunction = new Map();

for (const row of engineRows) {
  const key =
    `${row.functionName}|${row.url}`;

  const current =
    groupedByFunction.get(key) || {
      functionName: row.functionName,
      url: row.url,
      selfMicros: 0,
      hitCount: 0,
      locations: new Set(),
    };

  current.selfMicros += row.selfMicros;
  current.hitCount += row.hitCount;
  current.locations.add(
    `${row.line}:${row.column}`
  );

  groupedByFunction.set(key, current);
}

const groupedRows = Array.from(
  groupedByFunction.values()
)
  .sort(
    (a, b) =>
      b.selfMicros - a.selfMicros
  );

output.push("");
output.push("=".repeat(100));
output.push("TOP 30 — FUNÇÕES AGRUPADAS DO MOTOR");
output.push("=".repeat(100));

for (
  let index = 0;
  index < Math.min(30, groupedRows.length);
  index += 1
) {
  const row = groupedRows[index];

  output.push(
    [
      String(index + 1).padStart(2, "0"),
      `self=${formatMs(row.selfMicros).padStart(12)} ms`,
      `pct=${formatPct(row.selfMicros, totalMicros).padStart(6)}%`,
      `hits=${String(row.hitCount).padStart(7)}`,
      row.functionName,
      `locais=${Array.from(row.locations).join(",")}`,
    ].join(" | ")
  );
}

process.stdout.write(
  output.join("\n") + "\n"
);
