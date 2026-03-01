"use strict";

const fs = require("fs");
const path = require("path");

/** YYYY-MM-DD estrito (formato + data válida) */
function isYmdStrict(s) {
  const str = String(s || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;

  const [y, m, d] = str.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;

  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function slice10(v) {
  return String(v ?? "").trim().slice(0, 10);
}

function pickYmd(item) {
  if (!item) return null;

  if (typeof item === "string") {
    const s = slice10(item);
    return isYmdStrict(s) ? s : null;
  }

  if (Array.isArray(item)) {
    if (!item.length) return null;
    const s = slice10(item[0]);
    return isYmdStrict(s) ? s : null;
  }

  if (typeof item === "object") {
    const cand =
      item.ymd ??
      item.date ??
      item.day ??
      item.d ??
      item.key ??
      item.YMD ??
      null;

    const s = slice10(cand);
    return isYmdStrict(s) ? s : null;
  }

  return null;
}

function readJsonFile(p) {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) {
    throw new Error(`Arquivo não encontrado: ${abs}`);
  }
  const raw = fs.readFileSync(abs, "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    throw new Error(`JSON inválido em ${abs}: ${msg}`);
  }
}

(function main() {
  const defaultLogFile = path.join(
    __dirname,
    "..",
    "logs",
    "auditSlots-FEDERAL-2022-06-08_to_2026-02-13.json"
  );

  const defaultOutFile = path.join(
    __dirname,
    "..",
    "data",
    "no_draw_days",
    "FEDERAL.json"
  );

  const logFile = process.argv[2] ? path.resolve(process.argv[2]) : defaultLogFile;
  const outFile = process.argv[3] ? path.resolve(process.argv[3]) : defaultOutFile;

  let j;
  try {
    j = readJsonFile(logFile);
  } catch (err) {
    console.error("[ERRO]", err.message || err);
    process.exitCode = 1;
    return;
  }

  console.log("[INFO] from:", logFile);

  const out = new Set();

  if (Array.isArray(j.missingHardByDay)) {
    for (const it of j.missingHardByDay) {
      const y = pickYmd(it);
      if (y) out.add(y);
    }
  }

  if (!out.size && Array.isArray(j.missingHardDays)) {
    for (const it of j.missingHardDays) {
      const y = pickYmd(it);
      if (y) out.add(y);
    }
  }

  if (!out.size) {
    const all = JSON.stringify(j);
    const re = /"(\d{4}-\d{2}-\d{2})"\s*:\s*\{\s*"missingHard\w*"\s*:/g;
    let m;
    while ((m = re.exec(all))) {
      if (isYmdStrict(m[1])) out.add(m[1]);
    }
  }

  const days = Array.from(out).sort();

  const payload = {
    lotteryKey: "FEDERAL",
    days,
    generatedFrom: path.basename(logFile),
    generatedAt: new Date().toISOString(),
  };

  try {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
  } catch (err) {
    console.error("[ERRO] Falha ao escrever saída:", err.message || err);
    process.exitCode = 1;
    return;
  }

  console.log("[OK] wrote", outFile);
  console.log("days:", days.length);
  if (days.length <= 120) console.log(days.join(", "));
})();