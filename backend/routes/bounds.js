"use strict";

// 🔒 Normalização única de lottery_key
function normalizeLotteryKey(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s === "RJ" || s === "RIO" || s === "PT-RIO") return "PT_RIO";
  if (s === "FED" || s === "FEDERAL" || s === "BR" || s === "NACIONAL") return "FEDERAL";
  return s || "PT_RIO";
}

const express = require("express");
const { admin, getDb } = require("../service/firebaseAdmin");

const router = express.Router();

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isISODateStrict(s) {
  const str = String(s || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;

  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function normalizeToYMD(input) {
  if (!input) return null;

  // Timestamp (admin)
  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
  }

  // Timestamp-like { seconds } / { _seconds }
  if (
    typeof input === "object" &&
    (Number.isFinite(Number(input.seconds)) || Number.isFinite(Number(input._seconds)))
  ) {
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

  // ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // BR (robustez)
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
      normalizeToYMD(d?.date ?? d?.data ?? d?.dt ?? d?.draw_date ?? d?.close_date);

    if (!y || !isISODateStrict(y)) continue;

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

/**
 * ✅ bounds por campo com SCAN curto (evita pegar 1 doc inválido)
 * - Busca N docs ASC e pega o primeiro que vira ISO válido
 * - Busca N docs DESC e pega o primeiro que vira ISO válido
 * - Desempate por docId (estável)
 */
async function tryBoundsByField(db, lotteryKey, field, scanLimit = 50) {
  const DOC_ID = admin.firestore.FieldPath.documentId();
  const base = db.collection("draws").where("lottery_key", "==", lotteryKey);

  const ascSnap = await base
    .orderBy(field, "asc")
    .orderBy(DOC_ID, "asc")
    .limit(scanLimit)
    .get();

  const descSnap = await base
    .orderBy(field, "desc")
    .orderBy(DOC_ID, "desc")
    .limit(scanLimit)
    .get();

  if (ascSnap.empty || descSnap.empty) {
    return {
      ok: false,
      source: `where(lottery_key)+orderBy(${field})+docId(scan=${scanLimit})`,
    };
  }

  function pickFirstValidYmdFromDocs(docs, fieldName) {
    for (const doc of docs || []) {
      const v = doc?.data()?.[fieldName];
      const y = normalizeToYMD(v);
      if (y && isISODateStrict(y)) {
        return { ymd: y, docId: doc.id, raw: v };
      }
    }
    return { ymd: null, docId: null, raw: null };
  }

  const minPick = pickFirstValidYmdFromDocs(ascSnap.docs, field);
  const maxPick = pickFirstValidYmdFromDocs(descSnap.docs, field);

  return {
    ok: !!(minPick.ymd && maxPick.ymd),
    minYmd: minPick.ymd,
    maxYmd: maxPick.ymd,
    source: `where(lottery_key)+orderBy(${field})+docId(scan=${scanLimit})`,
    minDocId: minPick.docId,
    maxDocId: maxPick.docId,
    minRaw: minPick.raw ?? null,
    maxRaw: maxPick.raw ?? null,
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

async function computeBounds(db, lotteryKey, opts = {}) {
  const lk = String(lotteryKey || "").trim().toUpperCase() || "PT_RIO";
  const scanLimit = Number.isFinite(Number(opts.scanLimit)) ? Math.max(10, Number(opts.scanLimit)) : 50;
  const edgeLimit = Number.isFinite(Number(opts.edgeLimit)) ? Math.max(200, Number(opts.edgeLimit)) : 800;

  let result = null;
  let warn = null;

  // 1) ymd
  try {
    result = await tryBoundsByField(db, lk, "ymd", scanLimit);
  } catch (e) {
    warn = e;
  }

  // 2) date (normaliza e valida ISO)
  if (!result || !result.ok) {
    try {
      const r2 = await tryBoundsByField(db, lk, "date", scanLimit);
      if (r2?.minYmd && r2?.maxYmd) {
        result = { ...r2, source: r2.source + " (normalized)" };
      }
    } catch (e) {
      warn = warn || e;
    }
  }

  // 3) fallback docId edges
  if (!result || !result.ok) {
    result = await fallbackBoundsByDocIdEdges(db, lk, edgeLimit);
  }

  return { lk, result, warn };
}

/**
 * GET /api/bounds?lottery=PT_RIO
 * GET /api/bounds?lottery=FEDERAL
 * compat: ?uf=RJ etc.
 *
 * opcional:
 * - ?scanLimit=50
 * - ?edgeLimit=800
 */
const GLOBAL_MIN_YMD = "2022-06-07";
function clampMinYmd(v) {
  const s = String(v || "").trim();
  // aceita só YYYY-MM-DD; se inválido, não mexe
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return v;
  // se o min calculado for "mais novo" que o baseline, força baseline
  return s > GLOBAL_MIN_YMD ? GLOBAL_MIN_YMD : s;
}

router.get("/bounds", async (req, res) => {
  const lottery = normalizeLotteryKey(req.query.lottery || req.query.uf);
  const scanLimit = req.query.scanLimit ? Number(req.query.scanLimit) : undefined;
  const edgeLimit = req.query.edgeLimit ? Number(req.query.edgeLimit) : undefined;

  try {
    const db = getDb();
    const { lk, result, warn } = await computeBounds(db, lottery, { scanLimit, edgeLimit });

    return res.json({
      ok: true,
      lottery: lk,
      minYmd: clampMinYmd(result?.minYmd) || null,
      maxYmd: result?.maxYmd || null,
      source: result?.source || "unknown",
      minDocId: result?.minDocId || null,
      maxDocId: result?.maxDocId || null,
      sampleCount: result?.sampleCount || null,
      firstDocId: result?.firstDocId || null,
      lastDocId: result?.lastDocId || null,
      note: warn && isIndexError(warn)
        ? "faltou índice composto em uma tentativa (ok, caiu no fallback)"
        : null,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "internal_error",
      message: String(e?.message || e || "erro"),
    });
  }
});

module.exports = router;

