"use strict";

/**
 * Delete day draws + prizes (robusto e rápido)
 * Uso:
 *   node deleteDay.js YYYY-MM-DD LOTTERY_KEY [--dry]
 *
 * Estratégia:
 * - Query mínima: somente date (evita índice composto)
 * - Filtra em memória por:
 *   - lottery_key (snake)
 *   - lotteryKey (camel)
 *   - prefixo do docId: LOTTERY__YYYY-MM-DD__
 * - Deleta prizes + draw usando BulkWriter (bem mais rápido)
 */

const { admin, getDb } = require("../service/firebaseAdmin");

const DATE = String(process.argv[2] || "").trim();
const LOTTERY_KEY = String(process.argv[3] || "").trim().toUpperCase();
const DRY_RUN = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");

// Proteção: para deletar de verdade, exija --force (rode primeiro com --dry)
if (!DRY_RUN && !FORCE) {
  console.error("Proteção: para deletar de verdade use --force (ou rode primeiro com --dry).");
  process.exit(1);
}
function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

if (!DATE || !LOTTERY_KEY) {
  console.error("Uso: node deleteDay.js YYYY-MM-DD LOTTERY_KEY [--dry]");
  process.exit(1);
}
if (!isISODate(DATE)) {
  console.error("Data inválida. Use YYYY-MM-DD.");
  process.exit(1);
}

function upTrim(v) {
  return String(v ?? "").trim().toUpperCase();
}

function matchesLottery(docId, data, lotteryKey, dateYmd) {
  const lk1 = upTrim(data?.lottery_key);
  const lk2 = upTrim(data?.lotteryKey);
  if (lk1 === lotteryKey) return true;
  if (lk2 === lotteryKey) return true;

  // fallback: docId padrão: PT_RIO__2026-01-30__...
  const prefix = `${lotteryKey}__${dateYmd}__`;
  if (String(docId || "").startsWith(prefix)) return true;

  return false;
}

async function listDayDrawDocs(db, dateYmd, lotteryKey) {
  // ✅ Query mínima (evita índice composto)
  const snap = await db.collection("draws").where("date", "==", dateYmd).get();

  const picked = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (matchesLottery(doc.id, data, lotteryKey, dateYmd)) picked.push(doc);
  }

  // dedupe por id (por segurança)
  const map = new Map();
  for (const d of picked) map.set(d.id, d);
  return Array.from(map.values());
}

async function deleteDayDocs(db, docs, { dryRun }) {
  if (!docs.length) return { removedDraws: 0, removedPrizes: 0 };

  const bulk = db.bulkWriter();

  let removedDraws = 0;
  let removedPrizes = 0;

  bulk.onWriteError((err) => {
    if (err.failedAttempts < 3) return true;
    console.error("[BULK] erro definitivo:", err?.message || err);
    return false;
  });

  // concorrência controlada para listar prizes + agendar deletes
  const CONCURRENCY = 8;
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= docs.length) return;

      const doc = docs[i];

      // lista prizes desse draw
      const prizesSnap = await doc.ref.collection("prizes").get();

      if (dryRun) {
        removedPrizes += prizesSnap.size;
        removedDraws += 1;
        continue;
      }

      // agenda deletes de prizes
      for (const p of prizesSnap.docs) {
        bulk.delete(p.ref);
        removedPrizes += 1;
      }

      // agenda delete do draw
      bulk.delete(doc.ref);
      removedDraws += 1;
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, docs.length) }, () => worker());
  await Promise.all(workers);

  if (!dryRun) {
    await bulk.close(); // flush
  }

  return { removedDraws, removedPrizes };
}

(async () => {
  const db = getDb();

  console.log("==================================");
  console.log(`[DELETE] date=${DATE} lottery=${LOTTERY_KEY} dryRun=${DRY_RUN ? "YES" : "NO"}`);

  const docs = await listDayDrawDocs(db, DATE, LOTTERY_KEY);

  console.log(`[SCAN] draws encontrados => ${docs.length}`);
  if (!docs.length) {
    console.log("[OK] nada para remover.");
    console.log("==================================");
    process.exit(0);
  }

  // diagnóstico rápido (amostra)
  const sample = docs.slice(0, Math.min(5, docs.length)).map((d) => ({
    id: d.id,
    lottery_key: d.data()?.lottery_key || null,
    lotteryKey: d.data()?.lotteryKey || null,
    close_hour: d.data()?.close_hour || null,
  }));
  console.log("[SCAN] amostra:", sample);

  const { removedDraws, removedPrizes } = await deleteDayDocs(db, docs, { dryRun: DRY_RUN });

  console.log(`[OK] removidos prizes=${removedPrizes} draws=${removedDraws}`);
  console.log("==================================");
  process.exit(0);
})().catch((e) => {
  console.error("[ERRO]", e?.stack || e?.message || e);
  process.exit(1);
});

