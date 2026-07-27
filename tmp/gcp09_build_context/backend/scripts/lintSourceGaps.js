"use strict";

const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

function normalizeLotteryKey(v) {
  const s = String(v ?? "").trim().toUpperCase();

  if (s === "RJ" || s === "RIO" || s === "PT-RIO" || s === "PT_RIO") return "PT_RIO";
  if (s === "FED" || s === "FEDERAL") return "FEDERAL";

  // SEM fallback silencioso (evita lintar a loteria errada)
  return "";
}

function isISODateStrict(s) {
  const str = String(s ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function normHour(x) {
  // aceita 21, "21", "21h", "21:00", "21:30" -> "21"
  const m = String(x ?? "").trim().match(/\b(\d{1,2})\b/);
  if (!m) return "";
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0 || n > 23) return "";
  return String(n).padStart(2, "0");
}

function readJson(p) {
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    const msg = err?.message || String(err);
    throw new Error(`Falha ao ler/parsear JSON: ${p} | ${msg}`);
  }
}

async function existsDraw(db, lotteryKey, ymd, hh) {
  if (!hh) return false;
  const close = `${hh}:00`;

  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", lotteryKey)
    .where("ymd", "==", ymd)
    .where("close_hour", "==", close)
    .limit(1)
    .get();

  return !snap.empty;
}

async function main() {
  const lotteryArg = process.argv[2] || "PT_RIO";
  const lotteryKey = normalizeLotteryKey(lotteryArg);
  if (!lotteryKey) {
    console.error(`ERRO: lottery inválida: ${String(lotteryArg)}`);
    process.exit(1);
  }

  const from = String(process.argv[3] || "2022-06-07").trim();
  const to = String(process.argv[4] || "2099-12-31").trim();

  if (!isISODateStrict(from) || !isISODateStrict(to) || from > to) {
    console.error(`ERRO: range inválido. Use YYYY-MM-DD. from=${from} to=${to}`);
    process.exit(1);
  }

  const gapsPath = path.join(__dirname, "..", "data", "source_gaps", `${lotteryKey}.json`);
  if (!fs.existsSync(gapsPath)) {
    console.error("ERRO: arquivo não encontrado:", gapsPath);
    process.exit(1);
  }

  const g = readJson(gapsPath);
  const by = g.gapsByDay || {};
  const days = Object.keys(by)
    .filter((d) => isISODateStrict(d) && d >= from && d <= to)
    .sort();

  const db = getDb();
  let contradictions = 0;

  for (const ymd of days) {
    const e = by[ymd] || {};
    const removedHardRaw = Array.isArray(e.removedHard) ? e.removedHard : [];
    const removedHard = Array.from(new Set(removedHardRaw.map(normHour).filter(Boolean)));

    if (!removedHard.length) continue;

    const results = await Promise.all(
      removedHard.map(async (hh) => {
        const ok = await existsDraw(db, lotteryKey, ymd, hh);
        return { hh, ok };
      })
    );

    for (const r of results) {
      if (r.ok) {
        contradictions++;
        console.log(`[CONTRADICTION] ${ymd} removedHard ${r.hh} but DRAW EXISTS`);
      }
    }
  }

  console.log("==================================");
  console.log(`[LINT] lottery=${lotteryKey} range=${from}..${to}`);
  console.log(`[LINT] contradictions=${contradictions}`);
  console.log("==================================");

  process.exit(contradictions ? 2 : 0);
}

main().catch((err) => {
  console.error("ERRO:", err?.stack || err?.message || err);
  process.exit(1);
});
