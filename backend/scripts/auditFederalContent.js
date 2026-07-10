"use strict";

const fs = require("fs");
const path = require("path");
const { db } = require("../service/firebaseAdmin");
const { fetchKingResults } = require("./importKingApostas");

const START = process.argv[2] || "2022-06-07";
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

function normalizeHHMM(value) {
  const s = String(value ?? "").trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;

  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${String(m1[1]).padStart(2, "0")}:00`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${String(m2[1]).padStart(2, "0")}:00`;

  const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m3) return `${String(m3[1]).padStart(2, "0")}:${String(m3[2]).padStart(2, "0")}`;

  return "";
}

function normalizeCloseHourForFederal(value) {
  const raw = normalizeHHMM(value);
  if (!raw) return "";
  return `${raw.slice(0, 2)}:00`;
}

function normMilhar(v) {
  const s = String(v ?? "").replace(/\D/g, "").trim();
  if (!s) return "";
  return s.slice(-4).padStart(4, "0");
}

function extractKingPrizes(draw) {
  const out = {};
  for (let i = 1; i <= 7; i++) {
    const v = normMilhar(draw?.[`prize_${i}`]);
    if (v) out[i] = v;
  }
  return out;
}

async function readFirestoreByDate(date) {
  const snap = await db.collection("draws").where("date", "==", date).get();

  const bySlot = new Map();

  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const lk = String(d.lottery_key || d.lotteryKey || "").trim().toUpperCase();
    if (lk !== LOTTERY_KEY) continue;

    const slot = normalizeCloseHourForFederal(d.close_hour || d.close || d.hour || "");
    if (!slot) continue;

    const pSnap = await doc.ref.collection("prizes").get();
    const prizes = {};

    pSnap.forEach((pdoc) => {
      const p = pdoc.data() || {};
      const pos = Number(p.position || String(pdoc.id || "").replace(/\D/g, ""));
      const milhar = normMilhar(p.milhar || p.value || p.raw);
      if (Number.isFinite(pos) && pos >= 1 && pos <= 7 && milhar) {
        prizes[pos] = milhar;
      }
    });

    const row = {
      id: doc.id,
      slot,
      prizes,
      prizeCount: Object.keys(prizes).length,
    };

    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(row);
  }

  return bySlot;
}

function pickBestDoc(arr) {
  const list = Array.isArray(arr) ? arr.slice() : [];
  list.sort((a, b) => Number(b.prizeCount || 0) - Number(a.prizeCount || 0));
  return list[0] || null;
}

async function auditDate(date) {
  const payload = await fetchKingResults({ date, lotteryKey: LOTTERY_KEY });
  const sourceDraws = Array.isArray(payload?.data) ? payload.data : [];

  const sourceBySlot = new Map();

  for (const draw of sourceDraws) {
    const slot = normalizeCloseHourForFederal(draw?.close_hour || "");
    if (!slot) continue;
    sourceBySlot.set(slot, {
      slot,
      prizes: extractKingPrizes(draw),
    });
  }

  const fsBySlot = await readFirestoreByDate(date);

  const allSlots = Array.from(
    new Set([...sourceBySlot.keys(), ...fsBySlot.keys()])
  ).sort();

  const problems = [];

  for (const slot of allSlots) {
    const src = sourceBySlot.get(slot);
    const docs = fsBySlot.get(slot) || [];
    const fsDoc = pickBestDoc(docs);

    if (!src) {
      problems.push({ date, slot, type: "extra_firestore", firestoreDocs: docs.map(x => x.id) });
      continue;
    }

    if (!fsDoc) {
      problems.push({ date, slot, type: "missing_firestore" });
      continue;
    }

    if (docs.length > 1) {
      problems.push({ date, slot, type: "duplicate_firestore", count: docs.length, docs: docs.map(x => x.id) });
    }

    for (let pos = 1; pos <= 7; pos++) {
      const a = src.prizes[pos] || "";
      const b = fsDoc.prizes[pos] || "";

      if (!a || !b || a !== b) {
        problems.push({
          date,
          slot,
          type: "prize_mismatch",
          position: pos,
          source: a,
          firestore: b,
          firestoreDoc: fsDoc.id,
        });
      }
    }
  }

  return {
    date,
    sourceSlots: Array.from(sourceBySlot.keys()).sort(),
    firestoreSlots: Array.from(fsBySlot.keys()).sort(),
    problems,
  };
}

async function main() {
  const started = Date.now();
  const results = [];
  let totalDays = 0;
  let totalSlots = 0;
  let totalProblems = 0;

  for (let d = START; d <= END; d = addDays(d, 1)) {
    totalDays++;

    try {
      const r = await auditDate(d);
      results.push(r);
      totalSlots += r.sourceSlots.length;
      totalProblems += r.problems.length;

      const status = r.problems.length ? "PROBLEM" : "OK";
      console.log(`[CONTENT] ${d} ${status} sourceSlots=${r.sourceSlots.length} problems=${r.problems.length}`);

      if (r.problems.length) {
        console.log(JSON.stringify(r.problems.slice(0, 10), null, 2));
      }
    } catch (e) {
      totalProblems++;
      const r = {
        date: d,
        sourceSlots: [],
        firestoreSlots: [],
        problems: [{ date: d, type: "audit_error", message: String(e?.message || e) }],
      };
      results.push(r);
      console.log(`[CONTENT] ${d} ERROR ${String(e?.message || e)}`);
    }
  }

  const out = {
    period: { start: START, end: END },
    lotteryKey: LOTTERY_KEY,
    totalDays,
    totalSourceSlots: totalSlots,
    totalProblems,
    ok: totalProblems === 0,
    tookMs: Date.now() - started,
    generatedAt: new Date().toISOString(),
    results,
  };

  const dir = path.join(__dirname, "..", "logs");
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, `content-audit-${LOTTERY_KEY}-${START}_to_${END}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2), "utf8");

  console.log("");
  console.log("========== AUDITORIA DE CONTEÚDO ==========");
  console.log(`Período: ${START} até ${END}`);
  console.log(`Loteria: ${LOTTERY_KEY}`);
  console.log(`Dias auditados: ${totalDays}`);
  console.log(`Sorteios fonte: ${totalSlots}`);
  console.log(`Problemas: ${totalProblems}`);
  console.log(`OK: ${out.ok ? "SIM" : "NÃO"}`);
  console.log(`Arquivo: ${file}`);

  process.exit(out.ok ? 0 : 2);
}

main().catch((e) => {
  console.error("ERRO:", e?.message || e);
  process.exit(1);
});

