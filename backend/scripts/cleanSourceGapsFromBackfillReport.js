"use strict";

const fs = require("fs");
const path = require("path");

function safeStr(v) {
  return String(v ?? "").trim();
}

function toNum(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function usage(exitCode = 0) {
  const msg = `
Uso:
  node backend/scripts/cleanSourceGapsFromBackfillReport.js <backfillRun.json> [source_gaps.json]

Opções:
  -h, --help              Mostra esta ajuda
  --report <arquivo>      (alternativo) caminho do backfillRun.json
  --gaps <arquivo>        (alternativo) caminho do source_gaps.json

Exemplos:
  node backend/scripts/cleanSourceGapsFromBackfillReport.js logs/backfillRun-PT_RIO-20260228-225534.json
  node backend/scripts/cleanSourceGapsFromBackfillReport.js logs/backfillRun-PT_RIO-20260228-225534.json backend/data/source_gaps/PT_RIO.json
  node backend/scripts/cleanSourceGapsFromBackfillReport.js --report logs/backfillRun-PT_RIO-20260228-225534.json --gaps backend/data/source_gaps/PT_RIO.json
`.trim();
  console.log(msg);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    reportPathArg: null,
    gapsPathArg: null,
  };

  const a = argv.slice(2).map(String);

  // help
  if (a.includes("--help") || a.includes("-h")) usage(0);

  // suporte flags longas simples
  for (let i = 0; i < a.length; i++) {
    const cur = a[i];

    if (cur === "--report") {
      args.reportPathArg = a[i + 1];
      i++;
      continue;
    }

    if (cur.startsWith("--report=")) {
      args.reportPathArg = cur.split("=").slice(1).join("=");
      continue;
    }

    if (cur === "--gaps") {
      args.gapsPathArg = a[i + 1];
      i++;
      continue;
    }

    if (cur.startsWith("--gaps=")) {
      args.gapsPathArg = cur.split("=").slice(1).join("=");
      continue;
    }
  }

  // fallback posicional: <report> [gaps]
  const positionals = a.filter((x) => !x.startsWith("-"));
  if (!args.reportPathArg) args.reportPathArg = positionals[0] || null;
  if (!args.gapsPathArg) args.gapsPathArg = positionals[1] || null;

  return args;
}

function main() {
  const { reportPathArg, gapsPathArg } = parseArgs(process.argv);

  if (!reportPathArg) {
    console.error("Erro: informe o caminho do backfillRun.json.\n");
    usage(1);
  }

  const reportPath = path.resolve(reportPathArg);
  if (!fs.existsSync(reportPath)) {
    console.error("Erro: report não encontrado:", reportPath, "\n");
    usage(1);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const lottery = safeStr(report.lottery || "").toUpperCase() || "PT_RIO";

  const gapsPath = gapsPathArg
    ? path.resolve(gapsPathArg)
    : path.resolve("backend", "data", "source_gaps", lottery + ".json");

  if (!fs.existsSync(gapsPath)) {
    console.error("Erro: source_gaps não encontrado:", gapsPath, "\n");
    usage(1);
  }

  const gaps = JSON.parse(fs.readFileSync(gapsPath, "utf8"));
  gaps.gapsByDay = gaps.gapsByDay || {};

  // Motivos que indicam que aquele "missingHour" não deve mais ficar no gaps:
  // - API_NO_SLOT = fonte não tem aquele slot
  // - FS_ALREADY_HAS/CAPTURED/UPDATED... = já está resolvido no Firestore
  const REMOVE_REASONS = new Set([
    "API_NO_SLOT",
    "FS_ALREADY_HAS",
    "CAPTURED",
    "UPDATED",
    "UPDATED_SLOT",
    "UPDATED_SLOTS",
  ]);

  const toRemove = new Map();

  // o seu report atual usa report.results[], com day.attempted[]
  const days = Array.isArray(report.results) ? report.results : [];

  for (const dayRes of days) {
    const ymd = safeStr(dayRes.ymd || dayRes.date);
    if (!ymd) continue;

    const attempted = Array.isArray(dayRes.attempted) ? dayRes.attempted : [];
    for (const slotRes of attempted) {
      const reason = safeStr(slotRes?.doneReason);
      if (!REMOVE_REASONS.has(reason)) continue;

      const hourNum = toNum(slotRes?.hour);
      if (hourNum == null) continue;

      if (!toRemove.has(ymd)) toRemove.set(ymd, new Set());
      toRemove.get(ymd).add(hourNum);
    }
  }

  let removedHard = 0;
  let removedSoft = 0;
  let daysTouched = 0;

  for (const [ymd, hoursSet] of toRemove.entries()) {
    const day = gaps.gapsByDay[ymd];
    if (!day) continue;

    const hard = Array.isArray(day.removedHard) ? day.removedHard : [];
    const soft = Array.isArray(day.removedSoft) ? day.removedSoft : [];

    const hardNums = hard.map(toNum).filter((n) => n != null);
    const softNums = soft.map(toNum).filter((n) => n != null);

    const newHardNums = hardNums.filter((h) => !hoursSet.has(h));
    const newSoftNums = softNums.filter((h) => !hoursSet.has(h));

    const dh = hardNums.length - newHardNums.length;
    const ds = softNums.length - newSoftNums.length;

    if (dh || ds) {
      removedHard += dh;
      removedSoft += ds;

      day.removedHard = uniq(newHardNums).sort((a, b) => a - b);
      day.removedSoft = uniq(newSoftNums).sort((a, b) => a - b);

      daysTouched += 1;
    }
  }

  const outPath =
    gapsPath.replace(/\.json$/i, "") +
    `.cleaned_${path.basename(reportPath).replace(/[^a-z0-9_.-]/gi, "_")}.json`;

  fs.writeFileSync(outPath, JSON.stringify(gaps, null, 2));

  console.log("OK cleaned saved:", outPath);
  console.log("lottery=", lottery);
  console.log("daysInReport=", days.length);
  console.log("daysTouched=", daysTouched);
  console.log("removedHard=", removedHard, "removedSoft=", removedSoft);
  console.log(
    "note: removeu horas com doneReason em:",
    Array.from(REMOVE_REASONS).join(", ")
  );
}

main();