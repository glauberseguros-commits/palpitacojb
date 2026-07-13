const fs = require("fs");
const path = require("path");

const root = process.cwd();

const targets = [
  { date: "2026-07-11", hour: "21:00" },
  { date: "2026-07-12", hour: "16:00" },
];

const files = [
  path.join(root, "backend", "data", "no_draw_days", "PT_RIO.json"),
  path.join(root, "backend", "data", "source_gaps", "PT_RIO.json"),
];

function normalizeHour(v) {
  const s = String(v ?? "").trim();

  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}$/.test(s)) return `${s}:00`;

  return s;
}

function itemDate(obj) {
  return String(
    obj?.date ??
    obj?.ymd ??
    obj?.day ??
    obj?.draw_date ??
    ""
  ).trim();
}

function itemHour(obj) {
  return normalizeHour(
    obj?.hour ??
    obj?.slotHour ??
    obj?.slot_hour ??
    obj?.close_hour ??
    obj?.close ??
    ""
  );
}

function matchesTarget(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;

  const date = itemDate(obj);
  const hour = itemHour(obj);

  return targets.some((t) => t.date === date && t.hour === hour);
}

function cleanNode(node, stats) {
  if (Array.isArray(node)) {
    const result = [];

    for (const item of node) {
      if (matchesTarget(item)) {
        stats.removed++;
        continue;
      }

      result.push(cleanNode(item, stats));
    }

    return result;
  }

  if (!node || typeof node !== "object") return node;

  const out = {};

  for (const [key, value] of Object.entries(node)) {
    const keyMatches = targets.some((t) =>
      key === `${t.date}::${t.hour}` ||
      key === `${t.date}_${t.hour}` ||
      key === `${t.date}|${t.hour}` ||
      key === `${t.date}-${t.hour}`
    );

    if (keyMatches) {
      stats.removed++;
      continue;
    }

    out[key] = cleanNode(value, stats);
  }

  return out;
}

for (const file of files) {
  console.log(`\n[CONFIG] ${path.relative(root, file)}`);

  if (!fs.existsSync(file)) {
    console.log("Arquivo não encontrado. Ignorado.");
    continue;
  }

  const raw = fs.readFileSync(file, "utf8");
  const json = JSON.parse(raw);

  const backup = `${file}.bak-20260713`;
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(file, backup);
    console.log(`Backup criado: ${path.basename(backup)}`);
  }

  const stats = { removed: 0 };
  const cleaned = cleanNode(json, stats);

  if (stats.removed > 0) {
    fs.writeFileSync(file, JSON.stringify(cleaned, null, 2) + "\n", "utf8");
    console.log(`Registros incorretos removidos: ${stats.removed}`);
  } else {
    console.log("Nenhum registro correspondente encontrado.");
  }
}
