"use strict";

const express = require("express");
const { getDb } = require("../service/firebaseAdmin");

const router = express.Router();

/**
 * Helpers (simples e previsíveis)
 */
function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isHHMM(s) {
  return /^\d{2}:\d{2}$/.test(String(s || "").trim());
}

// aceita "21", "21h", "21:0", "21:00"
function normalizeHHMM(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";

  if (isHHMM(s)) return s;

  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${pad2(m1[1])}:00`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m3) return `${pad2(m3[1])}:${pad2(m3[2])}`;

  return "";
}

function upTrim(v) {
  return String(v ?? "").trim().toUpperCase();
}

function onlyDigits(s) {
  return String(s ?? "").replace(/\D/g, "");
}

function to4(s) {
  const d = onlyDigits(s);
  if (!d) return "";
  return d.slice(-4).padStart(4, "0");
}

function to3(s) {
  const d = onlyDigits(s);
  if (!d) return "";
  return d.slice(-3).padStart(3, "0");
}

function to2(s) {
  const d = onlyDigits(s);
  if (!d) return "";
  return d.slice(-2).padStart(2, "0");
}

function authOk(req) {
  const required = String(process.env.RECEIVE_RESULTS_TOKEN || "").trim();
  if (!required) return { ok: true, mode: "open" };

  const h = String(req.headers.authorization || "").trim();
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m ? String(m[1] || "").trim() : "";
  if (!token) return { ok: false, error: "missing_token" };
  if (token !== required) return { ok: false, error: "invalid_token" };
  return { ok: true, mode: "bearer" };
}

router.post("/receive_results", async (req, res) => {
  try {
    const a = authOk(req);
    if (!a.ok) return res.status(401).json({ ok: false, error: a.error });

    const body = req.body && typeof req.body === "object" ? req.body : null;
    if (!body) return res.status(400).json({ ok: false, error: "body_invalid" });

    const source = String(body.source || "").trim() || "unknown";
    const lottery = upTrim(body.lottery);
    const date = String(body.date || "").trim();
    const close = normalizeHHMM(body.close);
    const results = Array.isArray(body.results) ? body.results : null;

    if (!lottery) return res.status(400).json({ ok: false, error: "lottery_required" });
    if (!isISODate(date)) return res.status(400).json({ ok: false, error: "date_invalid" });
    if (!close) return res.status(400).json({ ok: false, error: "close_required" });
    if (!results || !results.length) return res.status(400).json({ ok: false, error: "results_required" });

    const db = getDb();
    const drawId = `d_${lottery}_${date}_${close.replace(":", "")}`;
    const drawRef = db.collection("draws").doc(drawId);

    await drawRef.set(
      {
        date,
        lottery_key: lottery,
        close_hour: close,
        source,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    let prizesSaved = 0;
    for (const r of results) {
      const pos = Number(r.prize);
      if (!Number.isFinite(pos)) continue;

      await drawRef.collection("prizes").doc(`p${pad2(pos)}`).set(
        {
          position: pos,
          milhar: to4(r.milhar),
          centena: to3(r.centena),
          dezena: to2(r.dezena),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      prizesSaved++;
    }

    return res.json({ ok: true, drawId, prizesSaved });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "erro" });
  }
});

module.exports = router;
