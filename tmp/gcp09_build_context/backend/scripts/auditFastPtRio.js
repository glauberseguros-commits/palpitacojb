const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

const LOTTERY = "PT_RIO";
const START = "2022-06-07";
const END = "2026-07-08";
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
  return `${String(Number(m[1])).padStart(2, "0")}:00`;
}

(async () => {
  const db = getDb();

  console.log("Buscando draws no Firestore...");

  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", LOTTERY)
    .get();

  const byKey = new Map();
  const duplicates = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const ymd = d.ymd || d.date;
    const hour = normHour(d.close_hour || d.hour);
    if (!ymd || !hour) continue;

    const key = `${ymd}|${hour}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ id: doc.id, ymd, hour });
  }

  const missing = [];

  for (let ymd = START; ymd <= END; ymd = addDays(ymd, 1)) {
    for (const hour of EXPECTED) {
      const rows = byKey.get(`${ymd}|${hour}`) || [];
      if (!rows.length) missing.push({ ymd, hour });
      if (rows.length > 1) duplicates.push({ ymd, hour, count: rows.length, ids: rows.map(x => x.id) });
    }
  }

  const report = {
    lottery: LOTTERY,
    start: START,
    end: END,
    totalDocs: snap.size,
    expectedPerDay: EXPECTED,
    missingCount: missing.length,
    duplicateCount: duplicates.length,
    missing,
    duplicates
  };

  const outJson = path.join(process.cwd(), "backend", "logs", `auditFast-${LOTTERY}-${START}_to_${END}.json`);
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  const outCsv = path.join(process.cwd(), "backend", "logs", `auditFast-${LOTTERY}-${START}_to_${END}.csv`);
  fs.writeFileSync(
    outCsv,
    "type,ymd,hour,count,ids\n" +
      missing.map(x => `MISSING,${x.ymd},${x.hour},,`).join("\n") +
      "\n" +
      duplicates.map(x => `DUPLICATE,${x.ymd},${x.hour},${x.count},"${x.ids.join(" | ")}"`).join("\n"),
    "utf8"
  );

  console.log("\n========== AUDITORIA RÁPIDA ==========");
  console.log("Loteria:", LOTTERY);
  console.log("Docs encontrados:", snap.size);
  console.log("Furos:", missing.length);
  console.log("Duplicados:", duplicates.length);
  console.log("JSON:", outJson);
  console.log("CSV:", outCsv);

  console.log("\n--- ÚLTIMOS 80 FUROS ---");
  console.table(missing.slice(-80));

  console.log("\n--- ÚLTIMOS 20 DUPLICADOS ---");
  console.table(duplicates.slice(-20));

  process.exit(0);
})();
