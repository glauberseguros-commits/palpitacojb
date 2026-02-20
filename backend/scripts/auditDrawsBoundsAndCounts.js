"use strict";

const { admin, getDb } = require("../service/firebaseAdmin");

function pad2(n) { return String(n).padStart(2, "0"); }

function isISODateStrict(s) {
  const str = String(s || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function normalizeToYMD(input) {
  if (!input) return null;

  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
  }

  if (typeof input === "object" &&
      (Number.isFinite(Number(input.seconds)) || Number.isFinite(Number(input._seconds)))) {
    const sec = Number.isFinite(Number(input.seconds)) ? Number(input.seconds) : Number(input._seconds);
    const d = new Date(sec * 1000);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
  }

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return `${input.getUTCFullYear()}-${pad2(input.getUTCMonth() + 1)}-${pad2(input.getUTCDate())}`;
  }

  const s = String(input || "").trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

function normalizeHourLike(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})(?:[:hH]?(\d{2}))?/);
  if (!m) return s;
  const hh = String(m[1]).padStart(2, "0");
  const mm = String(m[2] || "00").padStart(2, "0");
  return `${hh}:${mm}`;
}

function isIndexError(err) {
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "").toLowerCase();
  return (
    code.includes("failed-precondition") ||
    msg.includes("failed_precondition") ||
    (msg.includes("index") && msg.includes("create")) ||
    (msg.includes("requires") && msg.includes("index"))
  );
}

function extractYmdAndHour(docData) {
  const y = docData?.ymd || normalizeToYMD(docData?.date ?? docData?.draw_date ?? docData?.close_date ?? docData?.dt ?? docData?.data);
  const h = normalizeHourLike(docData?.close_hour ?? docData?.closeHour ?? docData?.close_hour_raw ?? docData?.hour ?? docData?.hora);
  const ymd = y && isISODateStrict(y) ? y : null;
  const hour = h || null;
  return { ymd, hour };
}

function auditCountsFromDocs(rows) {
  const setYmd = new Set();
  const setYmdHour = new Set();
  const mapKeyCount = new Map();
  let invalidYmd = 0;

  for (const r of rows) {
    const { ymd, hour } = extractYmdAndHour(r);
    if (!ymd) { invalidYmd++; continue; }
    setYmd.add(ymd);

    const key = `${ymd}__${hour || ""}`;
    mapKeyCount.set(key, (mapKeyCount.get(key) || 0) + 1);
    if (hour) setYmdHour.add(key);
  }

  const dupKeys = [...mapKeyCount.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1]);

  return {
    docs_brutos: rows.length,
    unique_ymd: setYmd.size,
    unique_ymd_hour: setYmdHour.size,
    invalid_ymd: invalidYmd,
    keys_total: mapKeyCount.size,
    keys_duplicadas: dupKeys.length,
    top_duplicadas: dupKeys.slice(0, 15),
  };
}

async function fetchRowsForRange(db, { lotteryKey, fromYmd, toYmd, pageSize = 2000, maxPages = 80 } = {}) {
  const lot = lotteryKey ? String(lotteryKey).trim().toUpperCase() : null;

  // 1) tentativa indexada
  try {
    let q = db.collection("draws");
    if (lot) q = q.where("lottery_key", "==", lot);
    if (fromYmd && toYmd) q = q.where("ymd", ">=", fromYmd).where("ymd", "<=", toYmd);
    const snap = await q.get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    return { rows, source: "query: where(lottery_key)+where(ymd>=<=)", usedFallback: false };
  } catch (e) {
    if (!isIndexError(e)) throw e;
  }

  // 2) fallback sem índice: pagina por docId e filtra em memória
  const DOC_ID = admin.firestore.FieldPath.documentId();
  let q = db.collection("draws");
  if (lot) q = q.where("lottery_key", "==", lot);
  q = q.orderBy(DOC_ID, "asc");

  let last = null;
  const out = [];

  for (let page = 1; page <= maxPages; page++) {
    let qq = q.limit(pageSize);
    if (last) qq = qq.startAfter(last);

    const snap = await qq.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const ymd = normalizeToYMD(data.ymd ?? data.date ?? data.draw_date ?? data.close_date ?? data.dt ?? data.data);
      if (!ymd || !isISODateStrict(ymd)) continue;
      if (fromYmd && ymd < fromYmd) continue;
      if (toYmd && ymd > toYmd) continue;
      out.push({ id: doc.id, ...data });
    }

    last = snap.docs[snap.docs.length - 1];
  }

  return { rows: out, source: "fallback: paginate by docId + filter(ymd)", usedFallback: true };
}

function parseArg(name, def = null) {
  const i = process.argv.findIndex((x) => x === name);
  if (i >= 0 && process.argv[i + 1] != null) return process.argv[i + 1];
  return def;
}

async function main() {
  const db = getDb();

  const lot = parseArg("--lot", "PT_RIO");
  const fromArg = parseArg("--from", null);
  const toArg = parseArg("--to", null);

  const pageSize = Math.max(200, Number(parseArg("--page", "2000")) || 2000);
  const maxPages = Math.max(1, Number(parseArg("--maxPages", "120")) || 120);

  const lotteryKey = lot ? String(lot).trim().toUpperCase() : null;

  const fromYmd = fromArg && isISODateStrict(fromArg) ? fromArg : null;
  const toYmd = toArg && isISODateStrict(toArg) ? toArg : null;

  const fr = await fetchRowsForRange(db, { lotteryKey, fromYmd, toYmd, pageSize, maxPages });
  const audit = auditCountsFromDocs(fr.rows);

  console.log("==================================");
  console.log(`[AUDIT] draws (lottery_key=${lotteryKey || "ALL"})`);
  console.log(`range: ${fromYmd || "N/A"} -> ${toYmd || "N/A"}`);
  console.log(`fetch_source: ${fr.source}${fr.usedFallback ? " (NO-INDEX fallback)" : ""}`);
  console.log("----------------------------------");
  console.log(`docs_brutos: ${audit.docs_brutos}`);
  console.log(`unique_ymd: ${audit.unique_ymd}`);
  console.log(`unique(ymd+hora): ${audit.unique_ymd_hour}`);
  console.log(`invalid_ymd: ${audit.invalid_ymd}`);
  console.log(`keys_total: ${audit.keys_total}`);
  console.log(`keys_duplicadas: ${audit.keys_duplicadas}`);
  console.log("top_duplicadas(ymd__hora => n):");
  audit.top_duplicadas.forEach(([k, n]) => console.log(`  ${k} => ${n}`));
  console.log("==================================");
}

main().catch((e) => {
  console.error("ERRO:", e?.stack || e?.message || e);
  process.exit(1);
});
