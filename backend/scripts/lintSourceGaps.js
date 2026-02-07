"use strict";

const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

function normHour(x) {
  const m = String(x ?? "").trim().match(/\d{1,2}/);
  if (!m) return "";
  return String(m[0]).padStart(2, "0");
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function existsDraw(db, lotteryKey, ymd, hh) {
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
  const lotteryKey = String(process.argv[2] || "PT_RIO").trim().toUpperCase();
  const from = String(process.argv[3] || "2022-06-07").trim();
  const to = String(process.argv[4] || "2099-12-31").trim();

  const gapsPath = path.join(__dirname, "..", "data", "source_gaps", `${lotteryKey}.json`);
  if (!fs.existsSync(gapsPath)) {
    console.error("ERRO: arquivo não encontrado:", gapsPath);
    process.exit(1);
  }

  const g = readJson(gapsPath);
  const by = g.gapsByDay || {};
  const days = Object.keys(by).filter(d => d >= from && d <= to).sort();

  const db = getDb();
  let contradictions = 0;

  for (const ymd of days) {
    const e = by[ymd] || {};
    const removedHard = Array.isArray(e.removedHard) ? e.removedHard.map(normHour) : [];

    for (const hh of removedHard) {
      if (await existsDraw(db, lotteryKey, ymd, hh)) {
        contradictions++;
        console.log(`[CONTRADICTION] ${ymd} removedHard ${hh} but DRAW EXISTS`);
      }
    }
  }

  console.log("==================================");
  console.log(`[LINT] lottery=${lotteryKey} range=${from}..${to}`);
  console.log(`[LINT] contradictions=${contradictions}`);
  console.log("==================================");

  process.exit(contradictions ? 2 : 0);
}

main().catch(err => {
  console.error("ERRO:", err);
  process.exit(1);
});
