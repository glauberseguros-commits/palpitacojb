"use strict";

const { getDb } = require("../service/firebaseAdmin");

async function main() {

  const db = getDb();

  const runs = await db
    .collection("prediction_runs")
    .limit(10)
    .get();

  console.log("");
  console.log("==================================");
  console.log("PREDICTION RUNS");
  console.log("==================================");
  console.log("Total encontrados:", runs.size);

  for (const doc of runs.docs) {

    console.log("");
    console.log(doc.id);

    const data = doc.data() || {};

    console.log({
      lottery_key: data.lottery_key,
      date: data.date,
      close_hour: data.close_hour,
      algorithm: data.algorithm,
      status: data.status,
    });

    const preds = await doc.ref
      .collection("predictions")
      .get();

    console.log("Predictions:", preds.size);

    for (const p of preds.docs.slice(0,3)) {

      const d = p.data();

      console.log(
        "  ",
        d.grupo,
        d.animal,
        "score=" + d.score,
        "confidence=" + d.confidence
      );
    }
  }

  console.log("");
  console.log("==================================");
}

main().catch((e)=>{
  console.error(e);
  process.exit(1);
});
