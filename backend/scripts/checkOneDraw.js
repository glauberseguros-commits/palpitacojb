"use strict";

const { getDb } = require("../service/firebaseAdmin");

function usage() {
  console.log("Uso:");
  console.log(
    "  node backend/scripts/checkOneDraw.js LOTTERY YYYY-MM-DD HH:MM [--list] [--tol=2] [--prizes]"
  );
  console.log("");
  console.log("Exemplos:");
  console.log("  node backend/scripts/checkOneDraw.js PT_RIO 2022-06-07 09:09");
  console.log("  node backend/scripts/checkOneDraw.js PT_RIO 2022-06-07 09:09 --list");
  console.log("  node backend/scripts/checkOneDraw.js PT_RIO 2022-06-07 09:09 --tol=2");
  console.log("  node backend/scripts/checkOneDraw.js PT_RIO 2022-06-07 09:09 --prizes");
}

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function isHHMM(s) {
  return /^\d{2}:\d{2}$/.test(String(s || "").trim());
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function normalizeHHMM(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";

  if (isHHMM(s)) return s;

  // "10h" => "10:00"
  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${pad2(m1[1])}:00`;

  // "10" => "10:00"
  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  // "10:9" => "10:09"
  const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m3) return `${pad2(m3[1])}:${pad2(m3[2])}`;

  return "";
}

function parseArg(name) {
  const prefix = `--${name}=`;
  const a = process.argv.find((x) => String(x).startsWith(prefix));
  if (!a) return null;
  return String(a).slice(prefix.length);
}

/**
 * Gera candidatos de close_hour com tolerância (minutos)
 * Ex.: base 09:09 tol=2 => 09:07..09:11
 */
function closeCandidates(hhmm, tol) {
  const s = normalizeHHMM(hhmm);
  if (!isHHMM(s)) return [];

  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(3, 5));

  const t = Number.isFinite(Number(tol)) ? Math.max(0, Math.min(15, Number(tol))) : 2;

  const out = [];
  for (let d = -t; d <= t; d++) {
    const mm = m + d;
    if (mm < 0 || mm > 59) continue;
    out.push(`${pad2(h)}:${pad2(mm)}`);
  }
  return Array.from(new Set(out));
}

async function listDay(db, lotteryKey, ymd) {
  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", lotteryKey)
    .where("ymd", "==", ymd)
    .get();

  if (snap.empty) {
    console.log(`[LIST] Nenhum draw encontrado para ${lotteryKey} em ${ymd}.`);
    return;
  }

  const hours = [];
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    if (d.close_hour) hours.push(normalizeHHMM(d.close_hour) || String(d.close_hour).trim());
  }

  hours.sort();
  console.log(
    `[LIST] ${lotteryKey} ${ymd} close_hours (${hours.length}): ${hours.join(", ")}`
  );
}

async function countPrizes(docRef) {
  try {
    // lê só alguns para confirmar que existe (evita custo alto)
    const snap = await docRef.collection("prizes").limit(200).get();
    return snap.size;
  } catch (e) {
    return null;
  }
}

async function main() {
  const lotteryKey = String(process.argv[2] || "").trim().toUpperCase() || null;
  const ymd = String(process.argv[3] || "").trim();
  const closeHourRaw = String(process.argv[4] || "").trim();

  const doList = process.argv.includes("--list");
  const doPrizes = process.argv.includes("--prizes");
  const tolArg = parseArg("tol");
  const tol = Number.isFinite(Number(tolArg)) ? Number(tolArg) : 2;

  const closeHour = normalizeHHMM(closeHourRaw);

  if (!lotteryKey || !isISODate(ymd) || !isHHMM(closeHour)) {
    usage();
    process.exit(1);
  }

  const db = getDb();
  const candidates = closeCandidates(closeHour, tol);

  console.log(
    `[CHECK] lottery=${lotteryKey} ymd=${ymd} target=${closeHour} tol=${tol} candidates=${candidates.join(
      ","
    )}`
  );

  const foundDocs = [];

  for (const ch of candidates) {
    const q = db
      .collection("draws")
      .where("lottery_key", "==", lotteryKey)
      .where("ymd", "==", ymd)
      .where("close_hour", "==", ch)
      .limit(10);

    const snap = await q.get();
    if (snap.empty) continue;

    for (const doc of snap.docs) {
      foundDocs.push(doc);
    }
  }

  if (!foundDocs.length) {
    console.log(
      `[CHECK] NOT FOUND: lottery=${lotteryKey} ymd=${ymd} close_hour≈${closeHour} (tol=${tol})`
    );
    if (doList) await listDay(db, lotteryKey, ymd);
    process.exit(0);
  }

  console.log(
    `[CHECK] FOUND ${foundDocs.length} doc(s) (candidates match): lottery=${lotteryKey} ymd=${ymd} close_hour≈${closeHour}`
  );

  // remove duplicados por docId
  const uniq = new Map();
  for (const d of foundDocs) uniq.set(d.id, d);

  for (const doc of uniq.values()) {
    const d = doc.data() || {};
    console.log("--------------------------------------------------");
    console.log("docId:", doc.id);
    console.log("ymd:", d.ymd ?? null);
    console.log("date:", d.date ?? null);
    console.log("close_hour:", d.close_hour ?? null);
    if (d.lottery_key) console.log("lottery_key:", d.lottery_key);
    if (d.uf) console.log("uf:", d.uf);
    if (d.importedAt) console.log("importedAt:", d.importedAt);
    if (typeof d.prizesCount !== "undefined") console.log("prizesCount(field):", d.prizesCount);

    if (doPrizes) {
      const n = await countPrizes(doc.ref);
      console.log("prizesCount(subcollection<=200):", n);
    }
  }

  if (doList) await listDay(db, lotteryKey, ymd);
}

main().catch((e) => {
  console.error("ERRO:", e?.stack || e?.message || e);
  process.exit(1);
});
