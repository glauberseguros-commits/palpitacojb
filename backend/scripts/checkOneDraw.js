"use strict";

const { getDb } = require("../service/firebaseAdmin");

function usage() {
  console.log("Uso:");
  console.log("  node backend/scripts/checkOneDraw.js LOTTERY YYYY-MM-DD HH:MM [--list]");
  console.log("");
  console.log("Exemplos:");
  console.log("  node backend/scripts/checkOneDraw.js PT_RIO 2022-06-07 09:09");
  console.log("  node backend/scripts/checkOneDraw.js PT_RIO 2022-06-07 09:09 --list");
}

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function isHHMM(s) {
  return /^\d{2}:\d{2}$/.test(String(s || "").trim());
}

async function listDay(db, lotteryKey, ymd) {
  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", lotteryKey)
    .where("ymd", "==", ymd)
    .get();

  if (snap.empty) {
    console.log(`[LIST] Nenhum draw encontrado para ${lotteryKey} em ${ymd}.`);
    return;
  }

  const hours = [];
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    if (d.close_hour) hours.push(String(d.close_hour));
  }

  hours.sort();
  console.log(`[LIST] ${lotteryKey} ${ymd} close_hours (${hours.length}): ${hours.join(", ")}`);
}

async function main() {
  const lotteryKey =
    String(process.argv[2] || "").trim().toUpperCase() || null;
  const ymd = String(process.argv[3] || "").trim();
  const closeHour = String(process.argv[4] || "").trim();
  const doList = process.argv.includes("--list");

  if (!lotteryKey || !isISODate(ymd) || !isHHMM(closeHour)) {
    usage();
    process.exit(1);
  }

  const db = getDb();

  const q = db
    .collection("draws")
    .where("lottery_key", "==", lotteryKey)
    .where("ymd", "==", ymd)
    .where("close_hour", "==", closeHour)
    .limit(10);

  const snap = await q.get();

  if (snap.empty) {
    console.log(`[CHECK] NOT FOUND: lottery=${lotteryKey} ymd=${ymd} close_hour=${closeHour}`);
    if (doList) await listDay(db, lotteryKey, ymd);
    process.exit(0);
  }

  console.log(`[CHECK] FOUND ${snap.size} doc(s): lottery=${lotteryKey} ymd=${ymd} close_hour=${closeHour}`);
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    console.log("--------------------------------------------------");
    console.log("docId:", doc.id);
    console.log("ymd:", d.ymd);
    console.log("date:", d.date);
    console.log("close_hour:", d.close_hour);
    if (d.lottery_key) console.log("lottery_key:", d.lottery_key);
    if (d.uf) console.log("uf:", d.uf);
    if (d.importedAt) console.log("importedAt:", d.importedAt);
    if (typeof d.prizesCount !== "undefined") console.log("prizesCount:", d.prizesCount);
  }

  if (doList) await listDay(db, lotteryKey, ymd);
}

main().catch((e) => {
  console.error("ERRO:", e?.stack || e?.message || e);
  process.exit(1);
});
