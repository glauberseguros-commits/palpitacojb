const { getDb } = require("../service/firebaseAdmin");

(async () => {

  const db = getDb();

  const snap = await db
    .collection("draws")
    .orderBy("ymd","desc")
    .orderBy("close_hour","desc")
    .limit(30)
    .get();

  console.log("\n========== ÚLTIMOS DRAWS ==========\n");

  for (const doc of snap.docs){

    const d = doc.data();

    console.log({
      id: doc.id,
      lottery: d.lottery_key,
      ymd: d.ymd,
      hour: d.close_hour,
      importedAt: d.importedAt || null,
      updatedAt: d.updatedAt || null
    });

  }

})();
