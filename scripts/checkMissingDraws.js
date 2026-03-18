const { getDb } = require("../backend/service/firebaseAdmin");

const db = getDb();

const UF = "PT_RIO";

const EXPECTED_HOURS = ["09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];

function getDatesBetween(start, end) {
  const dates = [];
  let d = new Date(start);
  const endDate = new Date(end);

  while (d <= endDate) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${day}`);
    d.setDate(d.getDate() + 1);
  }

  return dates;
}

async function run() {
  const start = "2026-03-01";
  const end = "2026-03-31";

  console.log(`Verificando ${start} até ${end}...\n`);

  const dates = getDatesBetween(start, end);

  for (const date of dates) {
    const snapshot = await db
      .collection("draws")
      .where("lottery_key", "==", UF)
      .where("ymd", "==", date)
      .get();

    const hoursFound = new Set();

    snapshot.forEach((doc) => {
      const d = doc.data();
      const h =
        d.close_hour || d.closeHour || d.hour || d.hora || null;

      if (h) hoursFound.add(h);
    });

    const missing = EXPECTED_HOURS.filter((h) => !hoursFound.has(h));

    if (missing.length > 0) {
      console.log(`❌ ${date} → faltando: ${missing.join(", ")}`);
    } else {
      console.log(`✅ ${date} completo`);
    }
  }

  console.log("\nFim da verificação.");
}

run().catch(console.error);