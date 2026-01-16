"use strict";

const { getDb } = require("../service/firebaseAdmin");

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

async function main() {
  const lotteryKey = String(process.argv[2] || "PT_RIO").trim() || "PT_RIO";

  const db = getDb();

  // 1) Pega a menor date (ordenando asc)
  const minSnap = await db
    .collection("draws")
    .where("lottery_key", "==", lotteryKey)
    .orderBy("date", "asc")
    .limit(1)
    .get();

  // 2) Pega a maior date (ordenando desc)
  const maxSnap = await db
    .collection("draws")
    .where("lottery_key", "==", lotteryKey)
    .orderBy("date", "desc")
    .limit(1)
    .get();

  const minDoc = minSnap.docs[0];
  const maxDoc = maxSnap.docs[0];

  const minDate = minDoc ? String(minDoc.data()?.date || "").trim() : null;
  const maxDate = maxDoc ? String(maxDoc.data()?.date || "").trim() : null;

  // Validação simples para evitar “lixo”
  const safeMin = isISODate(minDate) ? minDate : null;
  const safeMax = isISODate(maxDate) ? maxDate : null;

  console.log("==================================");
  console.log(`[BASE] lottery_key=${lotteryKey}`);
  console.log(`minDate: ${safeMin || "N/A"}`);
  console.log(`maxDate: ${safeMax || "N/A"}`);
  console.log("==================================");

  process.exit(0);
}

main().catch((e) => {
  console.error("ERRO:", e?.message || e);
  process.exit(1);
});
