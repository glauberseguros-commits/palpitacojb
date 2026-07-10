"use strict";

const fs = require("fs");
const path = require("path");
const { db } = require("../service/firebaseAdmin");
const { fetchKingResults } = require("./importKingApostas");

const START = process.argv[2] || "2022-06-08";
const END = process.argv[3] || "2026-07-08";
const LOTTERY_KEY = "FEDERAL";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function normMilhar(v) {
  const s = String(v ?? "").replace(/\D/g, "").trim();
  if (!s) return "";
  return s.slice(-4).padStart(4, "0");
}

function extractPrizes(draw) {
  const out = {};
  for (let i = 1; i <= 7; i++) {
    const v = normMilhar(draw?.[`prize_${i}`]);
    if (v) out[i] = v;
  }
  return out;
}

function samePrizes(a, b) {
  for (let i = 1; i <= 7; i++) {
    if ((a?.[i] || "") !== (b?.[i] || "")) return false;
  }
  return true;
}

async function readFederalFirestoreByDate(date) {
  const snap = await db.collection("draws").where("date", "==", date).get();
  const rows = [];

  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const lk = String(d.lottery_key || d.lotteryKey || "").trim().toUpperCase();
    if (lk !== LOTTERY_KEY) continue;

    const pSnap = await doc.ref.collection("prizes").get();
    const prizes = {};

    pSnap.forEach((pdoc) => {
      const p = pdoc.data() || {};
      const pos = Number(p.position || String(pdoc.id || "").replace(/\D/g, ""));
      const milhar = normMilhar(p.milhar || p.value || p.raw);
      if (pos >= 1 && pos <= 7 && milhar) prizes[pos] = milhar;
    });

    rows.push({
      id: doc.id,
      close_hour: String(d.close_hour || d.closeHour || d.hour || "").trim(),
      prizeCount: Object.keys(prizes).length,
      prizes,
    });
  }

  rows.sort((a, b) => Number(b.prizeCount || 0) - Number(a.prizeCount || 0));
  return rows;
}

async function main() {
  const results = [];
  let sourceDays = 0;
  let ok = 0;
  let missing = 0;
  let extraFirestoreDays = 0;
  let divergent = 0;
  let duplicateDays = 0;

  for (let d = START; d <= END; d = addDays(d, 1)) {
    const payload = await fetchKingResults({ date: d, lotteryKey: LOTTERY_KEY });
    const sourceDraws = Array.isArray(payload?.data) ? payload.data : [];
    const fsRows = await readFederalFirestoreByDate(d);

    if (!sourceDraws.length && !fsRows.length) continue;

    const source = sourceDraws[0] || null;
    const sourcePrizes = source ? extractPrizes(source) : null;
    const fsBest = fsRows[0] || null;

    const row = {
      date: d,
      sourceExists: !!source,
      sourceCloseHour: String(source?.close_hour || ""),
      firestoreCount: fsRows.length,
      firestoreHours: fsRows.map((x) => x.close_hour),
      firestoreDocs: fsRows.map((x) => x.id),
      status: "",
      mismatches: [],
    };

    if (source) sourceDays++;

    if (!source && fsRows.length) {
      row.status = "extra_firestore_sem_fonte";
      extraFirestoreDays++;
    } else if (source && !fsBest) {
      row.status = "missing_firestore";
      missing++;
    } else if (source && fsBest) {
      if (fsRows.length > 1) duplicateDays++;

      if (samePrizes(sourcePrizes, fsBest.prizes)) {
        row.status = fsRows.length > 1 ? "ok_com_duplicidade" : "ok";
        ok++;
      } else {
        row.status = "conteudo_divergente";
        divergent++;

        for (let i = 1; i <= 7; i++) {
          const a = sourcePrizes?.[i] || "";
          const b = fsBest.prizes?.[i] || "";
          if (a !== b) row.mismatches.push({ position: i, source: a, firestore: b });
        }
      }
    }

    results.push(row);
    console.log(`[FEDERAL-DATE] ${d} ${row.status} fonte=${row.sourceCloseHour || "-"} fs=${row.firestoreHours.join(",") || "-"}`);
  }

  const report = {
    period: { start: START, end: END },
    lotteryKey: LOTTERY_KEY,
    sourceDays,
    ok,
    missing,
    extraFirestoreDays,
    divergent,
    duplicateDays,
    problems: results.filter((r) => !["ok"].includes(r.status)),
    results,
    generatedAt: new Date().toISOString(),
  };

  const outFile = path.join(__dirname, "..", "logs", `federal-date-audit-${START}_to_${END}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log("========== FEDERAL AUDITORIA POR DATA ==========");
  console.log(`Fonte com resultado: ${sourceDays}`);
  console.log(`OK: ${ok}`);
  console.log(`Faltando Firestore: ${missing}`);
  console.log(`Extra Firestore sem fonte: ${extraFirestoreDays}`);
  console.log(`Conteúdo divergente: ${divergent}`);
  console.log(`Dias com duplicidade: ${duplicateDays}`);
  console.log(`Arquivo: ${outFile}`);
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
