"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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

function getContest(obj) {
  return String(
    obj?.contest ??
    obj?.concurso ??
    obj?.drawNumber ??
    obj?.draw_number ??
    obj?.number ??
    obj?.numero ??
    obj?.id_concurso ??
    ""
  ).replace(/\D/g, "").trim();
}

function getDate(obj) {
  return String(
    obj?.date ??
    obj?.drawDate ??
    obj?.ymd ??
    obj?.draw_date ??
    ""
  ).slice(0, 10);
}

function getHour(obj) {
  return String(
    obj?.close_hour ??
    obj?.closeHour ??
    obj?.hour ??
    obj?.time ??
    ""
  ).trim();
}

function extractPrizesFromFlat(obj) {
  const out = {};
  for (let i = 1; i <= 7; i++) {
    const v =
      obj?.[`prize_${i}`] ??
      obj?.[`prize${i}`] ??
      obj?.[`premio_${i}`] ??
      obj?.[`premio${i}`] ??
      "";
    const n = normMilhar(v);
    if (n) out[i] = n;
  }
  return out;
}

function prizeHash(prizes) {
  const arr = [];
  for (let i = 1; i <= 7; i++) arr.push(prizes?.[i] || "");
  return crypto.createHash("sha1").update(arr.join("|")).digest("hex").slice(0, 12);
}

function samePrizes(a, b) {
  for (let i = 1; i <= 7; i++) {
    if ((a?.[i] || "") !== (b?.[i] || "")) return false;
  }
  return true;
}

async function readFederalFirestoreDocs() {
  const snap = await db.collection("draws").get();
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
      const milhar = normMilhar(p.milhar || p.value || p.raw || p.number);
      if (pos >= 1 && pos <= 7 && milhar) prizes[pos] = milhar;
    });

    rows.push({
      id: doc.id,
      date: getDate(d),
      hour: getHour(d),
      contest: getContest(d),
      prizeCount: Object.keys(prizes).length,
      prizes,
      hash: prizeHash(prizes),
    });
  }

  return rows;
}

async function fetchOfficialFederal() {
  const rows = [];

  for (let d = START; d <= END; d = addDays(d, 1)) {
    const payload = await fetchKingResults({ date: d, lotteryKey: LOTTERY_KEY });
    const draws = Array.isArray(payload?.data) ? payload.data : [];

    if (!draws.length) {
      console.log(`[SOURCE] ${d} sem resultado`);
      continue;
    }

    for (const draw of draws) {
      const prizes = extractPrizesFromFlat(draw);
      rows.push({
        date: d,
        hour: getHour(draw),
        contest: getContest(draw),
        prizeCount: Object.keys(prizes).length,
        prizes,
        hash: prizeHash(prizes),
      });
    }

    console.log(`[SOURCE] ${d} resultados=${draws.length}`);
  }

  return rows;
}

function keyFor(row) {
  if (row.contest) return `contest:${row.contest}`;
  return `datehash:${row.date}:${row.hash}`;
}

async function main() {
  const official = await fetchOfficialFederal();
  const firestore = await readFederalFirestoreDocs();

  const officialByKey = new Map();
  const firestoreByKey = new Map();

  for (const r of official) {
    const k = keyFor(r);
    if (!officialByKey.has(k)) officialByKey.set(k, []);
    officialByKey.get(k).push(r);
  }

  for (const r of firestore) {
    const k = keyFor(r);
    if (!firestoreByKey.has(k)) firestoreByKey.set(k, []);
    firestoreByKey.get(k).push(r);
  }

  const allKeys = new Set([...officialByKey.keys(), ...firestoreByKey.keys()]);
  const rows = [];

  let ok = 0;
  let missing = 0;
  let extra = 0;
  let divergent = 0;
  let duplicated = 0;

  for (const k of Array.from(allKeys).sort()) {
    const src = officialByKey.get(k) || [];
    const fsRows = firestoreByKey.get(k) || [];

    const srcBest = src[0] || null;
    const fsBest = fsRows[0] || null;

    let status = "ok";

    if (src.length && !fsRows.length) {
      status = "missing_firestore";
      missing++;
    } else if (!src.length && fsRows.length) {
      status = "extra_firestore";
      extra++;
    } else if (src.length && fsRows.length) {
      if (fsRows.length > 1) duplicated++;

      const hasMatchingContent = fsRows.some((f) => samePrizes(srcBest.prizes, f.prizes));

      if (!hasMatchingContent) {
        status = "conteudo_divergente";
        divergent++;
      } else {
        status = fsRows.length > 1 ? "ok_com_duplicidade" : "ok";
        ok++;
      }
    }

    rows.push({
      key: k,
      status,
      officialCount: src.length,
      firestoreCount: fsRows.length,
      official: src.map((x) => ({
        date: x.date,
        hour: x.hour,
        contest: x.contest,
        hash: x.hash,
        prizeCount: x.prizeCount,
        prizes: x.prizes,
      })),
      firestore: fsRows.map((x) => ({
        id: x.id,
        date: x.date,
        hour: x.hour,
        contest: x.contest,
        hash: x.hash,
        prizeCount: x.prizeCount,
        prizes: x.prizes,
      })),
    });
  }

  const report = {
    period: { start: START, end: END },
    lotteryKey: LOTTERY_KEY,
    officialResults: official.length,
    officialUniqueKeys: officialByKey.size,
    firestoreDocs: firestore.length,
    firestoreUniqueKeys: firestoreByKey.size,
    ok,
    missing,
    extra,
    divergent,
    duplicatedKeys: duplicated,
    problems: rows.filter((r) => r.status !== "ok"),
    rows,
    generatedAt: new Date().toISOString(),
  };

  const outFile = path.join(
    __dirname,
    "..",
    "logs",
    `federal-contest-audit-${START}_to_${END}.json`
  );

  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log("========== FEDERAL AUDITORIA POR CONCURSO/CONTEÚDO ==========");
  console.log(`Fonte oficial - resultados: ${official.length}`);
  console.log(`Fonte oficial - chaves únicas: ${officialByKey.size}`);
  console.log(`Firestore - documentos: ${firestore.length}`);
  console.log(`Firestore - chaves únicas: ${firestoreByKey.size}`);
  console.log(`OK: ${ok}`);
  console.log(`Faltando Firestore: ${missing}`);
  console.log(`Extra Firestore: ${extra}`);
  console.log(`Conteúdo divergente: ${divergent}`);
  console.log(`Chaves com duplicidade: ${duplicated}`);
  console.log(`Arquivo: ${outFile}`);

  console.log("");
  console.log("========== PROBLEMAS RESUMIDOS ==========");
  rows
    .filter((r) => r.status !== "ok")
    .slice(0, 80)
    .forEach((r) => {
      const o = r.official?.[0];
      const f = r.firestore?.[0];
      console.log(
        `${r.status} | ${r.key} | fonte=${o?.date || "-"} ${o?.hour || "-"} | fs=${f?.date || "-"} ${f?.hour || "-"} | fsDocs=${r.firestoreCount}`
      );
    });
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
