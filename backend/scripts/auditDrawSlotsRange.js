"use strict";

const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

// ===== Config PT_RIO (baseado no autoImportToday.js) =====
function expectedHoursPT_RIO(dow) {
  // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  if (dow === 0) return ["09", "11", "14", "16"]; // domingo
  return ["09", "11", "14", "16", "18", "21"]; // seg-sáb
}

// ===== Utils =====
const LOG_DIR = path.join(__dirname, "..", "logs");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isISODate(s) {
  const str = String(s || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(str);
}

function ymdToDowSP(ymd) {
  // usa meio-dia em -03:00 para evitar edge cases
  const d = new Date(`${ymd}T12:00:00-03:00`);
  return d.getDay();
}

function addDaysISO(ymd, days) {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

function hourFromCloseHour(closeHour) {
  const s = String(closeHour || "").trim();
  // "11:09" -> "11"
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (m) return m[1];
  return null;
}

function parseArg(name) {
  const prefix = `--${name}=`;
  const a = process.argv.find((x) => String(x).startsWith(prefix));
  if (!a) return null;
  return String(a).slice(prefix.length);
}

// ===== Main =====
async function main() {
  const lotteryKey =
    String(process.argv[2] || "PT_RIO").trim().toUpperCase() || "PT_RIO";

  const startYmd = String(process.argv[3] || "2022-06-07").trim();
  const endYmd = String(process.argv[4] || "2026-01-21").trim();

  if (!isISODate(startYmd) || !isISODate(endYmd) || startYmd > endYmd) {
    throw new Error(
      `Intervalo inválido. Use: YYYY-MM-DD YYYY-MM-DD. Recebido: ${startYmd}..${endYmd}`
    );
  }

  const details = process.argv.includes("--details");
  const limitPrint = Number(parseArg("limit") || 50);

  if (lotteryKey !== "PT_RIO") {
    throw new Error(
      `Este auditor hoje está configurado para PT_RIO. (lotteryKey recebido: ${lotteryKey})`
    );
  }

  ensureLogDir();

  const db = getDb();

  console.log("==================================");
  console.log(`[AUDIT-SLOTS] lottery_key=${lotteryKey}`);
  console.log(`range: ${startYmd} -> ${endYmd}`);
  console.log("==================================");

  // Map: ymd -> hour -> count
  const counts = new Map();

  const base = db
    .collection("draws")
    .where("lottery_key", "==", lotteryKey)
    .where("ymd", ">=", startYmd)
    .where("ymd", "<=", endYmd)
    .orderBy("ymd", "asc");

  const pageSize = 500;
  let lastDoc = null;
  let scanned = 0;
  let pages = 0;

  while (true) {
    let q = base.limit(pageSize);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    pages += 1;

    for (const doc of snap.docs) {
      scanned += 1;
      const d = doc.data() || {};
      const ymd = String(d.ymd || "").trim();
      const hh = hourFromCloseHour(d.close_hour);

      if (!isISODate(ymd) || !hh) continue;

      if (!counts.has(ymd)) counts.set(ymd, new Map());
      const dayMap = counts.get(ymd);

      dayMap.set(hh, (dayMap.get(hh) || 0) + 1);
    }

    lastDoc = snap.docs[snap.docs.length - 1];

    if (pages % 20 === 0) {
      console.log(`[PROGRESS] pages=${pages} scanned=${scanned}`);
    }
  }

  // Agora valida slots esperados por dia
  let totalDays = 0;
  let expectedSlotsTotal = 0;
  let foundSlotsTotal = 0;
  let missingSlotsTotal = 0;
  let duplicateSlotsTotal = 0;

  const missingByDay = [];
  const dupByDay = [];

  for (let ymd = startYmd; ymd <= endYmd; ymd = addDaysISO(ymd, 1)) {
    totalDays += 1;

    const dow = ymdToDowSP(ymd);
    const expectedHours = expectedHoursPT_RIO(dow);
    expectedSlotsTotal += expectedHours.length;

    const dayMap = counts.get(ymd) || new Map();

    const missing = [];
    const dup = [];

    for (const hh of expectedHours) {
      const c = dayMap.get(hh) || 0;
      if (c <= 0) missing.push(hh);
      if (c > 1) dup.push({ hh, count: c });

      if (c > 0) foundSlotsTotal += 1;
      if (c <= 0) missingSlotsTotal += 1;
      if (c > 1) duplicateSlotsTotal += (c - 1);
    }

    if (missing.length) missingByDay.push({ ymd, dow, missing });
    if (dup.length) dupByDay.push({ ymd, dow, dup });
  }

  const report = {
    lotteryKey,
    startYmd,
    endYmd,
    scannedDocs: scanned,
    totalDays,
    expectedSlotsTotal,
    foundSlotsTotal,
    missingSlotsTotal,
    duplicateSlotsExtraDocs: duplicateSlotsTotal,
    daysWithMissing: missingByDay.length,
    daysWithDuplicates: dupByDay.length,
    missingByDay,
    dupByDay,
    generatedAt: new Date().toISOString(),
  };

  const outFile = path.join(
    LOG_DIR,
    `auditSlots-${lotteryKey}-${startYmd}_to_${endYmd}.json`
  );

  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log("==================================");
  console.log(`[RESULT] docs_scanned=${scanned}`);
  console.log(
    `[RESULT] days=${totalDays} expectedSlots=${expectedSlotsTotal} foundSlots=${foundSlotsTotal}`
  );
  console.log(
    `[RESULT] missingSlots=${missingSlotsTotal} daysWithMissing=${missingByDay.length}`
  );
  console.log(
    `[RESULT] duplicateExtraDocs=${duplicateSlotsTotal} daysWithDup=${dupByDay.length}`
  );
  console.log(`[OUTPUT] ${outFile}`);
  console.log("==================================");

  // prints rápidos (limitados)
  if (missingByDay.length) {
    console.log(`\n[MISSING] primeiros ${Math.min(limitPrint, missingByDay.length)} dias:`);
    for (const r of missingByDay.slice(0, limitPrint)) {
      console.log(`- ${r.ymd} missing: ${r.missing.join(", ")}`);
    }
  } else {
    console.log("\n[MISSING] nenhum buraco detectado no intervalo.");
  }

  if (dupByDay.length) {
    console.log(`\n[DUP] primeiros ${Math.min(limitPrint, dupByDay.length)} dias:`);
    for (const r of dupByDay.slice(0, limitPrint)) {
      const s = r.dup.map((x) => `${x.hh}(${x.count})`).join(", ");
      console.log(`- ${r.ymd} dup: ${s}`);
    }
  }

  if (details) {
    console.log("\n[DETAILS] missingByDay completo e dupByDay completo estão no JSON.");
  }
}

main().catch((e) => {
  console.error("ERRO:", e?.stack || e?.message || e);
  process.exit(1);
});
