const { getDb } = require("../service/firebaseAdmin");

async function readDay(db, ymd) {
  const snap = await db.collection("draws").where("ymd", "==", ymd).get();

  console.log(`\n========== ${ymd} | docs=${snap.size} ==========`);

  for (const doc of snap.docs) {
    const d = doc.data();
    const prizes = await doc.ref.collection("prizes").orderBy("position", "asc").get();

    console.log({
      id: doc.id,
      lottery: d.lottery_key,
      ymd: d.ymd,
      date: d.date,
      hour: d.close_hour || d.hour,
      prizes: prizes.size,
      numbers: prizes.docs.map(p => p.data()?.number || p.data()?.milhar || p.data()?.value || null),
    });
  }
}

(async () => {
  const db = getDb();

  await readDay(db, "2026-07-06");
  await readDay(db, "2026-07-07");
  await readDay(db, "2026-07-08");

  process.exit(0);
})();
