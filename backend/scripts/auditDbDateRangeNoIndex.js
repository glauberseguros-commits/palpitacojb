"use strict";

const { admin, getDb } = require("../service/firebaseAdmin");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isISODateStrict(s) {
  const str = String(s || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;

  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function normalizeToYMD(input) {
  if (!input) return null;

  // Timestamp (admin)
  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
        d.getUTCDate()
      )}`;
    }
  }

  // Timestamp-like { seconds } / { _seconds }
  if (
    typeof input === "object" &&
    (Number.isFinite(Number(input.seconds)) ||
      Number.isFinite(Number(input._seconds)))
  ) {
    const sec = Number.isFinite(Number(input.seconds))
      ? Number(input.seconds)
      : Number(input._seconds);
    const d = new Date(sec * 1000);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
        d.getUTCDate()
      )}`;
    }
  }

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return `${input.getUTCFullYear()}-${pad2(input.getUTCMonth() + 1)}-${pad2(
      input.getUTCDate()
    )}`;
  }

  const s = String(input || "").trim();
  if (!s) return null;

  // ISO (aceita "YYYY-MM-DD..." e pega só o começo)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // BR
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
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

/**
 * Pega o primeiro YMD válido dentro de um conjunto de docs.
 */
function pickFirstValidYmd(docs, fieldName) {
  for (const doc of docs || []) {
    const d = doc?.data ? doc.data() : doc || {};
    const raw = d?.[fieldName] ?? d?.date ?? d?.ymd;
    const y = normalizeToYMD(raw);
    if (y && isISODateStrict(y)) {
      return { ymd: y, docId: doc?.id || null, raw };
    }
  }
  return { ymd: null, docId: null, raw: null };
}

function pickMinMaxFromDocs(docs, fieldName) {
  let minYmd = null;
  let maxYmd = null;

  for (const doc of docs || []) {
    const d = doc?.data ? doc.data() : doc || {};
    const raw = d?.[fieldName] ?? d?.date ?? d?.ymd;
    const y = normalizeToYMD(raw);

    if (!y || !isISODateStrict(y)) continue;
    if (!minYmd || y < minYmd) minYmd = y;
    if (!maxYmd || y > maxYmd) maxYmd = y;
  }

  return { minYmd, maxYmd };
}

/**
 * ✅ FIX: evita "limit(1)" cair em doc inválido.
 * Faz scan curto ASC/DESC e pega o primeiro válido.
 *
 * Se lotteryKey for passado, filtra por where(lottery_key == lotteryKey).
 */
async function tryMinMaxByField(db, fieldName, { lotteryKey = null, scanLimit = 50 } = {}) {
  const DOC_ID = admin.firestore.FieldPath.documentId();

  let base = db.collection("draws");
  if (lotteryKey) {
    base = base.where("lottery_key", "==", String(lotteryKey).trim().toUpperCase());
  }

  const ascSnap = await base
    .orderBy(fieldName, "asc")
    .orderBy(DOC_ID, "asc")
    .limit(scanLimit)
    .get();

  const descSnap = await base
    .orderBy(fieldName, "desc")
    .orderBy(DOC_ID, "desc")
    .limit(scanLimit)
    .get();

  const minPick = pickFirstValidYmd(ascSnap.docs, fieldName);
  const maxPick = pickFirstValidYmd(descSnap.docs, fieldName);

  return {
    ok: !!(minPick.ymd && maxPick.ymd),
    minYmd: minPick.ymd,
    maxYmd: maxPick.ymd,
    minDocId: minPick.docId,
    maxDocId: maxPick.docId,
    minRaw: minPick.raw ?? null,
    maxRaw: maxPick.raw ?? null,
    source: `${lotteryKey ? "where(lottery_key)+":""
      }orderBy(${fieldName})+docId(scan=${scanLimit})`,
  };
}

async function fallbackBoundsByDocIdEdges(db, edgeLimit, { lotteryKey = null } = {}) {
  const DOC_ID = admin.firestore.FieldPath.documentId();

  let base = db.collection("draws");
  if (lotteryKey) {
    base = base.where("lottery_key", "==", String(lotteryKey).trim().toUpperCase());
  }

  const ascSnap = await base.orderBy(DOC_ID, "asc").limit(edgeLimit).get();
  const descSnap = await base.orderBy(DOC_ID, "asc").limitToLast(edgeLimit).get();

  const merged = [...ascSnap.docs, ...descSnap.docs];

  // tenta preferir ymd (se existir), senão date
  let r = pickMinMaxFromDocs(merged, "ymd");
  if (!r.minYmd || !r.maxYmd) r = pickMinMaxFromDocs(merged, "date");

  return {
    ok: !!(r.minYmd && r.maxYmd),
    minYmd: r.minYmd || null,
    maxYmd: r.maxYmd || null,
    sampleCount: merged.length,
    firstDocId: ascSnap.docs[0]?.id || null,
    lastDocId: descSnap.docs[descSnap.docs.length - 1]?.id || null,
    source: `${lotteryKey ? "where(lottery_key)+" : ""}fallback_edges_docId(limit=${edgeLimit})`,
  };
}

async function main() {
  const db = getDb();

  // argv:
  // node script.js PT_RIO 800 50
  const lotteryArg = process.argv[2];
  const lotteryKey = lotteryArg ? String(lotteryArg).trim().toUpperCase() : null;

  const edgeArg = Number(process.argv[3]);
  const edgeLimit = Number.isFinite(edgeArg) ? Math.max(200, edgeArg) : 800;

  const scanArg = Number(process.argv[4]);
  const scanLimit = Number.isFinite(scanArg) ? Math.max(10, scanArg) : 50;

  let source = null;
  let note = null;
  let minYmd = null;
  let maxYmd = null;
  let minDocId = null;
  let maxDocId = null;
  let sampleCount = null;
  let firstDocId = null;
  let lastDocId = null;

  // 1) tenta ymd (melhor)
  try {
    const r1 = await tryMinMaxByField(db, "ymd", { lotteryKey, scanLimit });
    if (r1.ok) {
      source = r1.source;
      minYmd = r1.minYmd;
      maxYmd = r1.maxYmd;
      minDocId = r1.minDocId;
      maxDocId = r1.maxDocId;
    }
  } catch (e) {
    if (isIndexError(e)) {
      note = "faltou índice/condição para orderBy(ymd) (ok, vai para fallback).";
    } else {
      note = note || String(e?.message || e);
    }
  }

  // 2) tenta date
  if (!minYmd || !maxYmd) {
    try {
      const r2 = await tryMinMaxByField(db, "date", { lotteryKey, scanLimit });
      if (r2.ok) {
        source = r2.source + " (normalized)";
        minYmd = r2.minYmd;
        maxYmd = r2.maxYmd;
        minDocId = r2.minDocId;
        maxDocId = r2.maxDocId;
      } else {
        note = note || "campo date/ymd não está consistente como ISO (vai para fallback).";
      }
    } catch (e) {
      if (isIndexError(e)) {
        note = note || "faltou índice/condição para orderBy(date) (vai para fallback).";
      } else {
        note = note || String(e?.message || e);
      }
    }
  }

  // 3) fallback definitivo (bordas por docId)
  if (!minYmd || !maxYmd) {
    const fb = await fallbackBoundsByDocIdEdges(db, edgeLimit, { lotteryKey });
    source = fb.source;
    minYmd = fb.minYmd;
    maxYmd = fb.maxYmd;
    sampleCount = fb.sampleCount;
    firstDocId = fb.firstDocId;
    lastDocId = fb.lastDocId;
  }

  console.log("==================================");
  console.log(`[BASE] draws ${lotteryKey ? `(lottery_key=${lotteryKey})` : "(global)"}`);
  console.log(`source: ${source || "unknown"}`);
  if (note) console.log(`note: ${note}`);
  console.log(`minDate: ${minYmd || "N/A"}`);
  console.log(`maxDate: ${maxYmd || "N/A"}`);
  if (minDocId || maxDocId) {
    console.log(`minDocId: ${minDocId || "N/A"}`);
    console.log(`maxDocId: ${maxDocId || "N/A"}`);
  }
  if (sampleCount) {
    console.log(`sampleCount: ${sampleCount}`);
    console.log(`firstDocId(sample): ${firstDocId || "N/A"}`);
    console.log(`lastDocId(sample): ${lastDocId || "N/A"}`);
  }
  console.log("==================================");
}

main().catch((e) => {
  console.error("ERRO:", e?.stack || e?.message || e);
  process.exit(1);
});
