"use strict";

const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

function normalizeLotteryKey(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "RJ" || s === "RIO" || s === "PT-RIO") return "PT_RIO";
  return s || "PT_RIO";
}

function normHour(x) {
  const m = String(x ?? "").trim().match(/\d{1,2}/);
  if (!m) return "";
  const hh = String(m[0]).padStart(2, "0");
  // sanity: 00..23
  const n = Number(hh);
  if (!Number.isFinite(n) || n < 0 || n > 23) return "";
  return hh;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
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
  const lotteryKey = normalizeLotteryKey(process.argv[2] || "PT_RIO");
  const from = String(process.argv[3] || "2022-06-07").trim();
  const to = String(process.argv[4] || "2099-12-31").trim();

  const gapsPath = path.join(
    __dirname,
    "..",
    "data",
    "source_gaps",
    `${lotteryKey}.json`
  );
  if (!fs.existsSync(gapsPath)) {
    console.error("ERRO: arquivo não encontrado:", gapsPath);
    process.exit(1);
  }

  const g = readJson(gapsPath);
  const by = g.gapsByDay || {};
  const days = Object.keys(by)
    .filter((d) => d >= from && d <= to)
    .sort();

  const db = getDb();
  let contradictions = 0;

  for (const ymd of days) {
    const e = by[ymd] || {};
    const removedHardRaw = Array.isArray(e.removedHard) ? e.removedHard : [];
    const removedHard = Array.from(
      new Set(removedHardRaw.map(normHour).filter(Boolean))
    );

    if (!removedHard.length) continue;

    // poucas horas por dia -> paralelo seguro
    const results = await Promise.all(
      removedHard.map(async (hh) => {
        const ok = await existsDraw(db, lotteryKey, ymd, hh);
        return { hh, ok };
      })
    );

    for (const r of results) {
      if (r.ok) {
        contradictions++;
        console.log(
          `[CONTRADICTION] ${ymd} removedHard ${r.hh} but DRAW EXISTS`
        );
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
