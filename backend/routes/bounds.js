"use strict";

const express = require("express");
const { admin, getDb } = require("../service/firebaseAdmin");

const router = express.Router();

function pad2(n) { return String(n).padStart(2, "0"); }

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

async function scanMaxYmd(db, lotteryKey, scanLimit = 80) {
  const DOC_ID = admin.firestore.FieldPath.documentId();

  const base = db
    .collection("draws")
    .where("lottery_key", "==", String(lotteryKey).trim().toUpperCase());

  const descSnap = await base
    .orderBy("ymd", "desc")
    .orderBy(DOC_ID, "desc")
    .limit(scanLimit)
    .get();

  for (const doc of descSnap.docs) {
    const d = doc.data() || {};
    const y = normalizeToYMD(d.ymd ?? d.date);
    if (y && isISODateStrict(y)) return { maxYmd: y, maxDocId: doc.id };
  }

  // fallback: hoje UTC
  const now = new Date();
  const today = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
  return { maxYmd: today, maxDocId: null };
}

/**
 * GET /api/bounds?lottery=PT_RIO
 * GET /api/bounds?lottery=FEDERAL
 */
router.get("/bounds", async (req, res) => {
  try {
    const db = getDb();
    const lottery = String(req.query.lottery || "PT_RIO").trim().toUpperCase();

    // ✅ mínimos oficiais
    const MIN_BY_LOTTERY = {
      PT_RIO: "2022-06-07",   // RJ
      FEDERAL: "2022-06-08",  // Federal
    };

    const minYmd = MIN_BY_LOTTERY[lottery] || "2022-06-07";
    const { maxYmd, maxDocId } = await scanMaxYmd(db, lottery, 80);

    return res.json({
      ok: true,
      lottery,
      minYmd,
      maxYmd,
      source: "min_fixed + scanMaxYmd(desc)",
      maxDocId: maxDocId || null,
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
