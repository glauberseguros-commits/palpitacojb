"use strict";

const express = require("express");
const { getDb } = require("../service/firebaseAdmin");

const router = express.Router();

/**
 * Helpers (robustos e previsíveis)
 */
function pad2(n) {
  return String(n).padStart(2, "0");
}

function isISODate(s) {
  const str = String(s || "").trim();
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

function isHHMM(s) {
  const str = String(s || "").trim();
  const m = str.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;

  const hh = Number(m[1]);
  const mm = Number(m[2]);

  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

// aceita "21", "21h", "21:0", "21:00"
function normalizeHHMM(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";

  if (isHHMM(s)) return s;

  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) {
    const hh = Number(m1[1]);
    if (hh >= 0 && hh <= 23) return `${pad2(hh)}:00`;
    return "";
  }

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) {
    const hh = Number(m2[1]);
    if (hh >= 0 && hh <= 23) return `${pad2(hh)}:00`;
    return "";
  }

  const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m3) {
    const hh = Number(m3[1]);
    const mm = Number(m3[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${pad2(hh)}:${pad2(mm)}`;
    }
    return "";
  }

  return "";
}

function normalizeLotteryKey(v) {
  const s = String(v ?? "").trim().toUpperCase();

  if (s === "RJ" || s === "RIO" || s === "PT-RIO" || s === "PT_RIO") return "PT_RIO";
  if (s === "FED" || s === "FEDERAL" || s === "BR") return "FEDERAL";

  return "";
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

function grupoFromDezena2(dezena2) {
  const s = String(dezena2 || "").trim();
  if (!/^\d{2}$/.test(s)) return null;

  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 99) return null;

  if (n === 0) return 25;

  const g = Math.ceil(n / 4);
  return g >= 1 && g <= 25 ? g : null;
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

function normalizeResultRow(r) {
  const pos = Number(r?.prize);

  if (!Number.isFinite(pos) || pos < 1) return null;

  const milhar = to4(r?.milhar ?? r?.numero ?? r?.number ?? r?.valor ?? "");
  const centena = to3(r?.centena || milhar);
  const dezena = to2(r?.dezena || milhar);
  const grupo = grupoFromDezena2(dezena);

  if (!milhar) return null;

  return {
    position: pos,
    milhar,
    centena,
    dezena,
    grupo,
    grupo2: grupo,
    numero: milhar,
    valor: milhar,
  };
}

router.post("/receive_results", async (req, res) => {
  try {
    const a = authOk(req);
    if (!a.ok) return res.status(401).json({ ok: false, error: a.error });

    const body = req.body && typeof req.body === "object" ? req.body : null;
    if (!body) return res.status(400).json({ ok: false, error: "body_invalid" });

    const source = String(body.source || "").trim() || "unknown";
    const lottery = normalizeLotteryKey(body.lottery);
    const date = String(body.date || "").trim();
    const close = normalizeHHMM(body.close);
    const results = Array.isArray(body.results) ? body.results : null;

    if (!lottery) {
      return res.status(400).json({
        ok: false,
        error: "lottery_invalid",
      });
    }

    if (!isISODate(date)) {
      return res.status(400).json({
        ok: false,
        error: "date_invalid",
      });
    }

    if (!close) {
      return res.status(400).json({
        ok: false,
        error: "close_invalid",
      });
    }

    if (!results || !results.length) {
      return res.status(400).json({
        ok: false,
        error: "results_required",
      });
    }

    const normalizedRows = results
      .map(normalizeResultRow)
      .filter(Boolean)
      .sort((a, b) => a.position - b.position);

    if (!normalizedRows.length) {
      return res.status(400).json({
        ok: false,
        error: "results_invalid",
      });
    }

    const db = getDb();
    const hhmm = close.replace(":", "-");
    const drawId = `${lottery}__${date}__${hhmm}__RECEIVE`;
    const drawRef = db.collection("draws").doc(drawId);

    await drawRef.set(
      {
        date,
        ymd: date,
        lottery_key: lottery,
        close_hour: close,
        source,
        provider: "receive_results",
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    let prizesSaved = 0;

    for (const row of normalizedRows) {
      await drawRef.collection("prizes").doc(`p${pad2(row.position)}`).set(
        {
          position: row.position,
          milhar: row.milhar,
          centena: row.centena,
          dezena: row.dezena,
          grupo: row.grupo,
          grupo2: row.grupo2,
          numero: row.numero,
          valor: row.valor,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      prizesSaved += 1;
    }

    return res.json({
      ok: true,
      drawId,
      prizesSaved,
      lottery,
      date,
      close_hour: close,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "erro" });
  }
});

module.exports = router;