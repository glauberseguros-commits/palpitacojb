const { getDb } = require("../backend/service/firebaseAdmin");

const db = getDb();
const DRAW_ID = "PT_RIO_2026-03-16_21:00";

async function run() {
  const drawRef = db.collection("draws").doc(DRAW_ID);
  const drawSnap = await drawRef.get();

  console.log("DRAW EXISTS:", drawSnap.exists);
  if (drawSnap.exists) {
    console.log("DRAW DATA:", JSON.stringify(drawSnap.data(), null, 2));
  }

  const prizesSnap = await drawRef.collection("prizes").orderBy("position", "asc").get();
  console.log("PRIZES COUNT:", prizesSnap.size);

  prizesSnap.forEach((doc) => {
    console.log(doc.id, JSON.stringify(doc.data()));
  });
}

run().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});
