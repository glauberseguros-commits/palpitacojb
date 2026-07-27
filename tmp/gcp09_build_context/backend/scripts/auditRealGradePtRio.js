const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

const LOTTERY = "PT_RIO";
const START = "2022-06-07";
const END = "2026-07-08";
const END_LIMIT_HOUR = "11:00";

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

function expectedHoursForDay(ymd) {
  const dow = new Date(ymd + "T00:00:00Z").getUTCDay();

  let hours;
  if (dow === 0) {
    hours = ["09:00", "11:00", "14:00", "16:00"];
  } else if (dow === 3 || dow === 6) {
    hours = ["09:00", "11:00", "14:00", "16:00", "18:00"];
  } else {
    hours = ["09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];
  }

  if (ymd === END) {
    hours = hours.filter(h => h <= END_LIMIT_HOUR);
  }

  return hours;
}

(async () => {
  const db = getDb();

  console.log("Buscando draws PT_RIO no Firestore...");

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
  const daily = [];
  let expectedTotal = 0;

  for (let ymd = START; ymd <= END; ymd = addDays(ymd, 1)) {
    const expected = expectedHoursForDay(ymd);
    expectedTotal += expected.length;

    const found = expected.filter(h => (byKey.get(`${ymd}|${h}`) || []).length > 0);
    const absent = expected.filter(h => !(byKey.get(`${ymd}|${h}`) || []).length);

    daily.push({
      ymd,
      dow: new Date(ymd + "T00:00:00Z").getUTCDay(),
      expectedCount: expected.length,
      foundCount: found.length,
      missingCount: absent.length,
      expected,
      found,
      missing: absent,
    });

    for (const hour of expected) {
      const rows = byKey.get(`${ymd}|${hour}`) || [];
      if (!rows.length) missing.push({ ymd, hour });

      if (rows.length > 1) {
        duplicates.push({
          ymd,
          hour,
          count: rows.length,
          ids: rows.map(x => x.id),
        });
      }
    }
  }

  const report = {
    lottery: LOTTERY,
    start: START,
    end: END,
    endLimitHour: END_LIMIT_HOUR,
    totalDocsInFirestore: snap.size,
    expectedTotal,
    foundExpected: expectedTotal - missing.length,
    missingCount: missing.length,
    duplicateCount: duplicates.length,
    missing,
    duplicates,
    daily,
  };

  const base = `auditRealGrade-${LOTTERY}-${START}_to_${END}_until_${END_LIMIT_HOUR.replace(":","-")}`;
  const outJson = path.join(process.cwd(), "backend", "logs", `${base}.json`);
  const outCsv = path.join(process.cwd(), "backend", "logs", `${base}.csv`);

  fs.writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(
    outCsv,
    "type,ymd,hour,count,ids\n" +
      missing.map(x => `MISSING,${x.ymd},${x.hour},,`).join("\n") +
      "\n" +
      duplicates.map(x => `DUPLICATE,${x.ymd},${x.hour},${x.count},"${x.ids.join(" | ")}"`).join("\n"),
    "utf8"
  );

  console.log("\n========== AUDITORIA GRADE REAL PT_RIO ==========");
  console.log("Período:", START, "até", END, "limite", END_LIMIT_HOUR);
  console.log("Docs PT_RIO no Firestore:", snap.size);
  console.log("Sorteios esperados pela grade:", expectedTotal);
  console.log("Sorteios encontrados da grade:", expectedTotal - missing.length);
  console.log("Furos reais estimados:", missing.length);
  console.log("Duplicados:", duplicates.length);
  console.log("JSON:", outJson);
  console.log("CSV:", outCsv);

  console.log("\n--- ÚLTIMOS 80 FUROS REAIS ---");
  console.table(missing.slice(-80));

  console.log("\n--- DIAS COM MAIS FUROS ---");
  console.table(
    daily
      .filter(d => d.missingCount > 0)
      .sort((a,b) => b.missingCount - a.missingCount || b.ymd.localeCompare(a.ymd))
      .slice(0, 40)
      .map(d => ({
        ymd: d.ymd,
        esperado: d.expectedCount,
        encontrado: d.foundCount,
        faltando: d.missingCount,
        horas: d.missing.join(" ")
      }))
  );

  process.exit(0);
})();
