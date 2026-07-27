const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

const START = "2022-06-07";
const END = "2026-07-08";
const LOTTERY = "PT_RIO";
const EXPECTED = ["09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];

function addDays(ymd, n) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function normHour(v) {
  const s = String(v || "").trim();
  const m = s.match(/(\d{1,2})[:hH]?(\d{2})?/);
  if (!m) return "";
  return String(Number(m[1])).padStart(2, "0") + ":00";
}

(async () => {
  const db = getDb();

  const missing = [];
  const incomplete = [];
  const daily = [];

  for (let ymd = START; ymd <= END; ymd = addDays(ymd, 1)) {
    const snap = await db.collection("draws").where("ymd", "==", ymd).get();

    const byHour = new Map();

    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.lottery_key !== LOTTERY) continue;

      const hour = normHour(d.close_hour || d.hour);
      if (!hour) continue;

      const prizes = await doc.ref.collection("prizes").get();

      byHour.set(hour, {
        id: doc.id,
        prizes: prizes.size,
      });
    }

    const found = [...byHour.keys()].sort();

    daily.push({
      ymd,
      found: found.length,
      hours: found,
    });

    for (const h of EXPECTED) {
      const row = byHour.get(h);

      if (!row) {
        missing.push({ ymd, hour: h });
      } else if (row.prizes < 7) {
        incomplete.push({ ymd, hour: h, prizes: row.prizes, id: row.id });
      }
    }
  }

  const report = {
    lottery: LOTTERY,
    start: START,
    end: END,
    expectedPerDay: EXPECTED,
    missingCount: missing.length,
    incompleteCount: incomplete.length,
    missing,
    incomplete,
    daily,
  };

  const out = path.join(process.cwd(), "backend", "logs", `auditFirestore-${LOTTERY}-${START}_to_${END}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");

  console.log("\n========== AUDITORIA FIRESTORE ==========");
  console.log("Loteria:", LOTTERY);
  console.log("Período:", START, "até", END);
  console.log("Furos:", missing.length);
  console.log("Incompletos:", incomplete.length);
  console.log("Arquivo:", out);

  console.log("\n--- ÚLTIMOS 80 FUROS ---");
  console.table(missing.slice(-80));

  console.log("\n--- ÚLTIMOS 40 INCOMPLETOS ---");
  console.table(incomplete.slice(-40));

  process.exit(0);
})();
