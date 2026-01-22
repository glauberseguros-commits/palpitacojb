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

/**
 * ✅ Hora robusta:
 * aceita "11:09", "11:09:00", "11h", "11hs", "11", "09-09", "09hs", etc.
 * retorna "HH" (2 dígitos) ou null
 */
function hourFromCloseHour(closeHour) {
  const s0 = String(closeHour || "").trim();
  if (!s0) return null;

  // pega os 1-2 primeiros dígitos de hora
  // exemplos: "09:09" -> 09 | "9:09" -> 9 | "09-09" -> 09 | "09hs" -> 09
  const m = s0.match(/(\d{1,2})/);
  if (!m) return null;

  const hh = Number(m[1]);
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;

  return pad2(hh);
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
  const limitPrint = Math.max(1, Number(parseArg("limit") || 50));

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

  /**
   * ✅ Estratégia anti-índice composto:
   * - consulta por DIA: where("ymd","==",dia) (índice single-field)
   * - filtra lottery_key em memória
   * - conta horas e valida no mesmo loop
   */
  let scannedDocs = 0;
  let totalDays = 0;

  let expectedSlotsTotal = 0;
  let foundSlotsTotal = 0;
  let missingSlotsTotal = 0;

  let duplicateSlotsExtraDocs = 0;

  let unexpectedSlotsTotal = 0; // horas que existem mas não deveriam existir naquele dia
  let daysWithUnexpected = 0;

  const missingByDay = [];
  const dupByDay = [];
  const unexpectedByDay = [];

  const progressEvery = 30; // dias

  for (let ymd = startYmd; ymd <= endYmd; ymd = addDaysISO(ymd, 1)) {
    totalDays += 1;

    const dow = ymdToDowSP(ymd);
    const expectedHours = expectedHoursPT_RIO(dow);
    const expectedSet = new Set(expectedHours);

    expectedSlotsTotal += expectedHours.length;

    // Query mínima: SOMENTE ymd (não exige índice composto)
    const snap = await db.collection("draws").where("ymd", "==", ymd).get();

    // conta horas SOMENTE do PT_RIO
    const dayMap = new Map(); // hh -> count

    for (const doc of snap.docs) {
      scannedDocs += 1;
      const d = doc.data() || {};

      if (String(d.lottery_key || "").trim().toUpperCase() !== lotteryKey) continue;

      const hh = hourFromCloseHour(d.close_hour ?? d.closeHour ?? d.hour ?? d.hora);
      if (!hh) continue;

      dayMap.set(hh, (dayMap.get(hh) || 0) + 1);
    }

    // valida esperado (missing/dup) + inesperado
    const missing = [];
    const dup = [];

    for (const hh of expectedHours) {
      const c = dayMap.get(hh) || 0;

      if (c <= 0) missing.push(hh);
      if (c > 1) dup.push({ hh, count: c });

      if (c > 0) foundSlotsTotal += 1;
      if (c <= 0) missingSlotsTotal += 1;
      if (c > 1) duplicateSlotsExtraDocs += (c - 1);
    }

    // horas inesperadas (existem no dayMap mas não estão no esperado)
    const unexpected = [];
    for (const [hh, c] of dayMap.entries()) {
      if (!expectedSet.has(hh)) {
        unexpected.push({ hh, count: c });
        unexpectedSlotsTotal += c;
      }
    }
    if (unexpected.length) daysWithUnexpected += 1;

    if (missing.length) missingByDay.push({ ymd, dow, missing });
    if (dup.length) dupByDay.push({ ymd, dow, dup });
    if (unexpected.length) unexpectedByDay.push({ ymd, dow, unexpected });

    if (totalDays % progressEvery === 0) {
      console.log(`[PROGRESS] days=${totalDays} scannedDocs=${scannedDocs}`);
    }
  }

  const report = {
    lotteryKey,
    startYmd,
    endYmd,
    scannedDocs,
    totalDays,
    expectedSlotsTotal,
    foundSlotsTotal,
    missingSlotsTotal,
    duplicateSlotsExtraDocs,
    unexpectedSlotsTotal,
    daysWithMissing: missingByDay.length,
    daysWithDuplicates: dupByDay.length,
    daysWithUnexpected,
    missingByDay,
    dupByDay,
    unexpectedByDay,
    generatedAt: new Date().toISOString(),
  };

  const outFile = path.join(
    LOG_DIR,
    `auditSlots-${lotteryKey}-${startYmd}_to_${endYmd}.json`
  );

  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log("==================================");
  console.log(`[RESULT] scannedDocs=${scannedDocs}`);
  console.log(
    `[RESULT] days=${totalDays} expectedSlots=${expectedSlotsTotal} foundSlots=${foundSlotsTotal}`
  );
  console.log(
    `[RESULT] missingSlots=${missingSlotsTotal} daysWithMissing=${missingByDay.length}`
  );
  console.log(
    `[RESULT] duplicateExtraDocs=${duplicateSlotsExtraDocs} daysWithDup=${dupByDay.length}`
  );
  console.log(
    `[RESULT] unexpectedSlots=${unexpectedSlotsTotal} daysWithUnexpected=${daysWithUnexpected}`
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

  if (unexpectedByDay.length) {
    console.log(
      `\n[UNEXPECTED] primeiros ${Math.min(limitPrint, unexpectedByDay.length)} dias:`
    );
    for (const r of unexpectedByDay.slice(0, limitPrint)) {
      const s = r.unexpected.map((x) => `${x.hh}(${x.count})`).join(", ");
      console.log(`- ${r.ymd} unexpected: ${s}`);
    }
  } else {
    console.log("\n[UNEXPECTED] nenhum slot inesperado detectado no intervalo.");
  }

  if (details) {
    console.log("\n[DETAILS] missingByDay / dupByDay / unexpectedByDay completos estão no JSON.");
  }
}

main().catch((e) => {
  console.error("ERRO:", e?.stack || e?.message || e);
  process.exit(1);
});
