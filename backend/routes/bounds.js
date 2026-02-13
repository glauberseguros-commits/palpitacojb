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

function normalizeToYMD(input) {
  if (!input) return null;

  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
  }

  const s = String(input || "").trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null;
}

function isISODateStrict(s) {
  const str = String(s || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;

  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function todayUtcYmd() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
}

async function scanMaxYmd(db, lotteryKey, scanLimit = 80) {
  const DOC_ID = admin.firestore.FieldPath.documentId();
  const lk = String(lotteryKey || "").trim().toUpperCase() || "PT_RIO";

  const base = db.collection("draws").where("lottery_key", "==", lk);

  // 1) Caminho ideal (pode exigir índice composto em alguns projetos)
  try {
    const descSnap = await base
      .orderBy("ymd", "desc")
      .orderBy(DOC_ID, "desc")
      .limit(scanLimit)
      .get();

    for (const doc of descSnap.docs) {
      const d = doc.data() || {};
      const y = normalizeToYMD(d.ymd ?? d.date);
      if (y && isISODateStrict(y)) return { maxYmd: y, maxDocId: doc.id, source: "orderBy_ymd_desc" };
    }
  } catch (e) {
    // fallback abaixo
  }

  // 2) Fallback “sem índice”: ordena só por documentId e varre mais docs
  try {
    const fallbackLimit = Math.max(scanLimit * 5, 200);
    const snap = await base.orderBy(DOC_ID, "desc").limit(fallbackLimit).get();

    let best = null;
    let bestId = null;

    for (const doc of snap.docs) {
      const d = doc.data() || {};
      const y = normalizeToYMD(d.ymd ?? d.date);
      if (y && isISODateStrict(y)) {
        if (!best || y > best) {
          best = y;
          bestId = doc.id;
        }
      }
    }

    if (best) return { maxYmd: best, maxDocId: bestId, source: "orderBy_docId_desc_fallback" };
  } catch (e) {
    // ignora e cai pro fallback final
  }

  // fallback final: hoje UTC
  return { maxYmd: todayUtcYmd(), maxDocId: null, source: "today_utc_fallback" };
}

/**
 * GET /api/bounds?lottery=PT_RIO
 * GET /api/bounds?lottery=FEDERAL
 * compat: ?uf=RJ etc.
 */
router.get("/bounds", async (req, res) => {
  // ✅ canônico: aceita ?lottery= ou ?uf=
  const lottery = normalizeLotteryKey(req.query.lottery || req.query.uf);

  try {
    const db = getDb();

    // ✅ mínimos oficiais
    const MIN_BY_LOTTERY = {
      PT_RIO: "2022-06-07", // RJ
      FEDERAL: "2022-06-08", // Federal
    };

    const minYmd = MIN_BY_LOTTERY[lottery] || "2022-06-07";
    const r = await scanMaxYmd(db, lottery, 80);

    return res.json({
      ok: true,
      lottery,
      minYmd,
      maxYmd: r.maxYmd,
      source: `min_fixed + scanMaxYmd(${r.source})`,
      maxDocId: r.maxDocId || null,
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

