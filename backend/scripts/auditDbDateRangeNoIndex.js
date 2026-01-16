"use strict";

const { getDb } = require("../service/firebaseAdmin");

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

async function main() {
  const db = getDb();

  // MIN(date) global
  const minSnap = await db
    .collection("draws")
    .orderBy("date", "asc")
    .limit(1)
    .get();

  // MAX(date) global
  const maxSnap = await db
    .collection("draws")
    .orderBy("date", "desc")
    .limit(1)
    .get();

  const minDoc = minSnap.docs[0];
  const maxDoc = maxSnap.docs[0];

  const minDate = minDoc ? String(minDoc.data()?.date || "").trim() : null;
  const maxDate = maxDoc ? String(maxDoc.data()?.date || "").trim() : null;

  const safeMin = isISODate(minDate) ? minDate : null;
  const safeMax = isISODate(maxDate) ? maxDate : null;

  console.log("==================================");
  console.log("[BASE] draws (global)");
  console.log(`minDate: ${safeMin || "N/A"}`);
  console.log(`maxDate: ${safeMax || "N/A"}`);
  console.log("==================================");
}

main().catch((e) => {
  console.error("ERRO:", e?.message || e);
  process.exit(1);
});
