"use strict";

const { getDb } = require("../service/firebaseAdmin");

async function main() {

  const db = getDb();

  const snap = await db
    .collection("draws")
    .limit(1)
    .get();

  if (snap.empty) {
    console.log("Nenhum draw encontrado.");
    return;
  }

  const doc = snap.docs[0];

  console.log("==================================");
  console.log("DRAW ID");
  console.log("==================================");
  console.log(doc.id);

  console.log("");

  console.log("==================================");
  console.log("FIELDS");
  console.log("==================================");

  const data = doc.data();

  console.log(Object.keys(data).sort());

  console.log("");

  console.log("==================================");
  console.log("DATA");
  console.log("==================================");

  console.dir(data, { depth: 2 });

  const prizes = await doc.ref.collection("prizes").limit(3).get();

  console.log("");

  console.log("==================================");
  console.log("PRIZES");
  console.log("==================================");

  console.log("Qtd:", prizes.size);

  prizes.docs.forEach((p) => {
    console.dir(p.data(), { depth: 2 });
  });

}

main().catch(console.error);
