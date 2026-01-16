"use strict";
const { getDb } = require("../service/firebaseAdmin");

async function main() {
  const db = getDb();

  // pegue 1 doc qualquer
  const snap = await db.collection("draws").limit(1).get();
  if (snap.empty) {
    console.log("Sem docs em draws.");
    return;
  }

  const doc = snap.docs[0];
  const d = doc.data();

  console.log("docId:", doc.id);
  console.log("ymd:", d.ymd);
  console.log("date:", d.date);
  console.log("close_hour:", d.close_hour);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
