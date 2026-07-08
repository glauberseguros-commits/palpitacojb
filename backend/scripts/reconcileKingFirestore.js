const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");
const { fetchKingResults, runImport } = require("./importKingApostas");

function addDays(ymd, n = 1) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function normHour(v) {
  const m = String(v || "").match(/(\d{1,2})/);
  if (!m) return "";
  return String(Number(m[1])).padStart(2, "0") + ":00";
}

function unwrapDraws(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.draws)) return payload.draws;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.draws)) return payload.data.draws;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  return [];
}

function countSourcePrizes(draw) {
  if (Array.isArray(draw?.prizes)) return draw.prizes.length;
  let n = 0;
  for (let i = 1; i <= 15; i++) {
    if (String(draw?.[`prize_${i}`] || "").trim()) n++;
  }
  return n;
}

async function readFirestoreDay(db, ymd, lotteryKey) {
  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", lotteryKey)
    .where("ymd", "==", ymd)
    .get();

  const map = new Map();

  for (const doc of snap.docs) {
    const d = doc.data();
    const hour = normHour(d.close_hour || d.hour);
    const prizes = await doc.ref.collection("prizes").get();

    if (hour) {
      map.set(hour, {
        id: doc.id,
        hour,
        prizes: prizes.size,
      });
    }
  }

  return map;
}

async function reconcileDay({ db, ymd, lotteryKey, fix }) {
  const payload = await fetchKingResults({ date: ymd, lotteryKey });
  const sourceDraws = unwrapDraws(payload);

  const sourceByHour = new Map();

  for (const draw of sourceDraws) {
    const hour = normHour(draw?.close_hour || draw?.closeHour || draw?.hour || draw?.hora);
    const prizes = countSourcePrizes(draw);
    if (hour && prizes >= 7) {
      sourceByHour.set(hour, { hour, prizes });
    }
  }

  const firestoreByHour = await readFirestoreDay(db, ymd, lotteryKey);

  const missing = [];
  const incomplete = [];

  for (const [hour, src] of sourceByHour.entries()) {
    const dbRow = firestoreByHour.get(hour);

    if (!dbRow) {
      missing.push(hour);
    } else if (dbRow.prizes < src.prizes) {
      incomplete.push({ hour, firestorePrizes: dbRow.prizes, sourcePrizes: src.prizes });
    }
  }

  const needsFix = missing.length > 0 || incomplete.length > 0;

  let fixed = false;

  if (needsFix && fix) {
    await runImport({ date: ymd, lotteryKey });
    fixed = true;

    const afterFirestoreByHour = await readFirestoreDay(db, ymd, lotteryKey);
    const afterMissing = [];
    const afterIncomplete = [];

    for (const [hour, src] of sourceByHour.entries()) {
      const dbRow = afterFirestoreByHour.get(hour);

      if (!dbRow) {
        afterMissing.push(hour);
      } else if (dbRow.prizes < src.prizes) {
        afterIncomplete.push({
          hour,
          firestorePrizes: dbRow.prizes,
          sourcePrizes: src.prizes,
        });
      }
    }

    const stillNeedsFix = afterMissing.length > 0 || afterIncomplete.length > 0;

    return {
      ymd,
      sourceHours: Array.from(sourceByHour.keys()).sort(),
      firestoreHours: Array.from(afterFirestoreByHour.keys()).sort(),
      missing: afterMissing,
      incomplete: afterIncomplete,
      status: stillNeedsFix ? "FIX_FAILED" : "FIXED",
      fixed,
    };
  }

  return {
    ymd,
    sourceHours: Array.from(sourceByHour.keys()).sort(),
    firestoreHours: Array.from(firestoreByHour.keys()).sort(),
    missing,
    incomplete,
    status: needsFix ? "NEEDS_FIX" : "OK",
    fixed,
  };
}

(async () => {
  const start = process.argv[2];
  const end = process.argv[3] || start;
  const lotteryKey = process.argv[4] || "PT_RIO";
  const fix = process.argv.includes("--fix");

  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    console.log("Uso:");
    console.log("node backend/scripts/reconcileKingFirestore.js 2026-06-29 2026-07-08 PT_RIO --fix");
    process.exit(1);
  }

  const db = getDb();
  const report = [];

  for (let ymd = start; ymd <= end; ymd = addDays(ymd)) {
    console.log(`\n[RECONCILE] ${lotteryKey} ${ymd}`);
    const row = await reconcileDay({ db, ymd, lotteryKey, fix });
    report.push(row);

    console.log({
      status: row.status,
      source: row.sourceHours,
      firestore: row.firestoreHours,
      missing: row.missing,
      incomplete: row.incomplete,
    });
  }

  const out = path.join(
    process.cwd(),
    "backend",
    "logs",
    `reconcile-${lotteryKey}-${start}_to_${end}${fix ? "-fix" : "-dry"}.json`
  );

  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");

  console.log("\n========== RESUMO ==========");
  console.log("Período:", start, "até", end);
  console.log("Loteria:", lotteryKey);
  console.log("Modo:", fix ? "CORREÇÃO ATIVA" : "SOMENTE AUDITORIA");
  console.log("Dias com problema:", report.filter(x => x.status !== "OK").length);
  console.log("Arquivo:", out);

  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
