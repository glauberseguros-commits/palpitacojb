const { getDb } = require("../backend/service/firebaseAdmin");

const db = getDb();

async function run() {
  const docId = "PT_RIO_2026-03-16_21:00";

  const data = {
    lottery_key: "PT_RIO",
    ymd: "2026-03-16",
    close_hour: "21:00",
    drawId: docId,
    prizes: [
      { position: 1, grupo: 24, milhar: "0396" },
      { position: 2, grupo: 9, milhar: "8034" },
      { position: 3, grupo: 12, milhar: "2147" },
      { position: 4, grupo: 10, milhar: "5237" },
      { position: 5, grupo: 6, milhar: "7623" },
      { position: 6, grupo: 10, milhar: "3437" },
      { position: 7, grupo: 21, milhar: "0181" }
    ],
    prizesCount: 7,
    manual_override: true,
    source: "manual_script_fix"
  };

  const ref = db.collection("draws").doc(docId);

  const existing = await ref.get();

  if (existing.exists) {
    console.log("⚠️ Documento já existe. Abortando para não duplicar.");
    return;
  }

  await ref.set(data);

  console.log("✅ Draw inserido com sucesso:", docId);
}

run().catch(console.error);