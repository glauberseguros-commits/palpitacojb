const { getDb } = require("../backend/service/firebaseAdmin");

const db = getDb();

const DRAW_ID = "PT_RIO_2026-03-16_21:00";

const prizes = [
  { position: 1, grupo: 24, milhar: "0396", numero: "0396" },
  { position: 2, grupo: 9,  milhar: "8034", numero: "8034" },
  { position: 3, grupo: 12, milhar: "2147", numero: "2147" },
  { position: 4, grupo: 10, milhar: "5237", numero: "5237" },
  { position: 5, grupo: 6,  milhar: "7623", numero: "7623" },
  { position: 6, grupo: 10, milhar: "3437", numero: "3437" },
  { position: 7, grupo: 21, milhar: "181",  numero: "181"  },
];

async function run() {
  const drawRef = db.collection("draws").doc(DRAW_ID);
  const drawSnap = await drawRef.get();

  if (!drawSnap.exists) {
    throw new Error(`Draw não encontrado: ${DRAW_ID}`);
  }

  const batch = db.batch();

  prizes.forEach((p) => {
    const prizeRef = drawRef.collection("prizes").doc(String(p.position));
    batch.set(prizeRef, {
      prizeId: String(p.position),
      position: p.position,
      posicao: p.position,
      grupo: p.grupo,
      milhar: p.milhar,
      numero: p.numero,
      createdAt: new Date().toISOString(),
      source: "manual_fix_terminal",
    }, { merge: true });
  });

  batch.set(drawRef, {
    prizesCount: prizes.length,
    updatedAt: new Date().toISOString(),
    source: "manual_fix_terminal",
  }, { merge: true });

  await batch.commit();

  console.log(`OK: prizes inseridos no draw ${DRAW_ID}`);
}

run().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});
