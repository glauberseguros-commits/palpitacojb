"use strict";

const { admin, getDb } = require("../service/firebaseAdmin");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isISODate(s) {
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

  // ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // BR
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

function pickMinMaxFromDocs(docs) {
  let minYmd = null;
  let maxYmd = null;

  for (const doc of docs || []) {
    const d = doc?.data ? doc.data() : doc || {};

    const y =
      d?.ymd ||
      normalizeToYMD(
        d?.date ?? d?.data ?? d?.dt ?? d?.draw_date ?? d?.close_date
      );

    if (!y || !isISODate(y)) continue;

    if (!minYmd || y < minYmd) minYmd = y;
    if (!maxYmd || y > maxYmd) maxYmd = y;
  }

  return { minYmd, maxYmd };
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

async function tryBoundsByField(db, lotteryKey, field) {
  const base = db.collection("draws").where("lottery_key", "==", lotteryKey);

  const minSnap = await base.orderBy(field, "asc").limit(1).get();
  const maxSnap = await base.orderBy(field, "desc").limit(1).get();

  if (minSnap.empty || maxSnap.empty) {
    return {
      ok: false,
      source: `where(lottery_key)+orderBy(${field})`,
    };
  }

  const minDoc = minSnap.docs[0];
  const maxDoc = maxSnap.docs[0];

  const minVal = minDoc.data()?.[field];
  const maxVal = maxDoc.data()?.[field];

  // ✅ normaliza e valida ISO de verdade
  const minYmdRaw = normalizeToYMD(minVal);
  const maxYmdRaw = normalizeToYMD(maxVal);

  const minYmd = isISODate(minYmdRaw) ? minYmdRaw : null;
  const maxYmd = isISODate(maxYmdRaw) ? maxYmdRaw : null;

  return {
    ok: !!(minYmd && maxYmd),
    minYmd,
    maxYmd,
    source: `where(lottery_key)+orderBy(${field})`,
    minDocId: minDoc.id,
    maxDocId: maxDoc.id,
  };
}

async function fallbackBoundsByDocIdEdges(db, lotteryKey, edgeLimit) {
  const DOC_ID = admin.firestore.FieldPath.documentId();
  const base = db.collection("draws").where("lottery_key", "==", lotteryKey);

  const ascSnap = await base.orderBy(DOC_ID, "asc").limit(edgeLimit).get();
  const descSnap = await base.orderBy(DOC_ID, "asc").limitToLast(edgeLimit).get();

  const merged = [...ascSnap.docs, ...descSnap.docs];
  const { minYmd, maxYmd } = pickMinMaxFromDocs(merged);

  return {
    ok: !!(minYmd && maxYmd),
    minYmd: minYmd || null,
    maxYmd: maxYmd || null,
    source: `fallback_edges_docId(limit=${edgeLimit})`,
    sampleCount: merged.length,
    firstDocId: ascSnap.docs[0]?.id || null,
    lastDocId: descSnap.docs[descSnap.docs.length - 1]?.id || null,
  };
}

async function main() {
  const lotteryKey =
    String(process.argv[2] || "PT_RIO").trim().toUpperCase() || "PT_RIO";

  // ✅ edgeLimit robusto (evita NaN)
  const edgeArg = Number(process.argv[3]);
  const edgeLimit = Number.isFinite(edgeArg)
    ? Math.max(200, edgeArg)
    : 800;

  const db = getDb();

  let result = null;
  let warn = null;

  // 1) Melhor caso: ymd
  try {
    result = await tryBoundsByField(db, lotteryKey, "ymd");
  } catch (e) {
    warn = e;
  }

  // 2) Fallback: date (somente se normalizar e validar ISO)
  if (!result || !result.ok) {
    try {
      const r2 = await tryBoundsByField(db, lotteryKey, "date");
      if (r2?.minYmd && r2?.maxYmd) {
        result = { ...r2, source: r2.source + " (normalized)" };
      }
    } catch (e) {
      warn = warn || e;
    }
  }

  // 3) Fallback definitivo: bordas por docId
  if (!result || !result.ok) {
    result = await fallbackBoundsByDocIdEdges(db, lotteryKey, edgeLimit);
  }

  console.log("==================================");
  console.log(`[AUDIT] lottery_key=${lotteryKey}`);
  console.log(`source: ${result?.source || "unknown"}`);
  if (warn && isIndexError(warn)) {
    console.log("note: faltou índice composto em uma tentativa (ok, caiu no fallback).");
  }
  if (result?.source?.includes("fallback")) {
    console.log("note: bounds obtidos por fallback (amostragem).");
  }
  console.log(`minYmd: ${result?.minYmd || "N/A"}`);
  console.log(`maxYmd: ${result?.maxYmd || "N/A"}`);
  if (result?.sampleCount) console.log(`sampleCount: ${result.sampleCount}`);
  if (result?.firstDocId || result?.lastDocId) {
    console.log(`firstDocId(sample): ${result.firstDocId || "N/A"}`);
    console.log(`lastDocId(sample): ${result.lastDocId || "N/A"}`);
  }
  console.log("==================================");

  process.exit(0);
}

main().catch((e) => {
  console.error("ERRO:", e?.stack || e?.message || e);
  process.exit(1);
});
