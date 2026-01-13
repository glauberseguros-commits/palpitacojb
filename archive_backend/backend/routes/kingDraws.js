"use strict";

const express = require("express");
const admin = require("firebase-admin");

const router = express.Router();

/**
 * Firestore init (robusto):
 * - tenta reutilizar app já inicializado
 * - se não existir, inicializa com Application Default Credentials (ADC)
 */
let _db = null;

function getDb() {
  if (_db) return _db;

  if (!admin.apps.length) {
    // Usa GOOGLE_APPLICATION_CREDENTIALS (ADC) se estiver definido no ambiente
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  _db = admin.firestore();
  return _db;
}

/**
 * Helpers
 */
function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function isHHMM(s) {
  return /^\d{2}:\d{2}$/.test(String(s || "").trim());
}

function normalizeHHMM(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";

  // já é HH:MM
  if (isHHMM(s)) return s;

  // "10h" => "10:00"
  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) {
    return `${String(m1[1]).padStart(2, "0")}:00`;
  }

  // "10" => "10:00"
  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) {
    return `${String(m2[1]).padStart(2, "0")}:00`;
  }

  // "10:9" => "10:09"
  const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m3) {
    const hh = String(m3[1]).padStart(2, "0");
    const mm = String(m3[2]).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  // formato desconhecido: não quebra, mas evita entrar em janela
  return "";
}

function cmpHHMM(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function inRangeHHMM(hhmm, from, to) {
  const h = String(hhmm || "").trim();
  if (!h || !isHHMM(h)) return false;
  if (from && cmpHHMM(h, from) < 0) return false;
  if (to && cmpHHMM(h, to) > 0) return false;
  return true;
}

/**
 * KING DRAWS (Opção A) — endpoint técnico (bruto)
 *
 * GET /api/king/draws?date=2026-01-02&lottery=PT_RIO&from=09:00&to=16:40&includePrizes=1
 *
 * Observação premium (anti-índice composto):
 * - Query filtra SOMENTE por date
 * - lottery_key e janela de horário são filtrados em memória
 */
router.get("/draws", async (req, res) => {
  try {
    const db = getDb();

    const date = String(req.query.date || "").trim();
    const lottery = String(req.query.lottery || "PT_RIO").trim();

    const fromRaw = req.query.from != null ? String(req.query.from).trim() : "";
    const toRaw = req.query.to != null ? String(req.query.to).trim() : "";

    const from = fromRaw ? normalizeHHMM(fromRaw) : "";
    const to = toRaw ? normalizeHHMM(toRaw) : "";

    const includePrizesRaw = String(req.query.includePrizes ?? "1").trim();
    const includePrizes =
      includePrizesRaw === "1" ||
      includePrizesRaw.toLowerCase() === "true" ||
      includePrizesRaw.toLowerCase() === "yes";

    if (!isISODate(date)) {
      return res.status(400).json({
        ok: false,
        error: "Parâmetro inválido: date (use YYYY-MM-DD)",
      });
    }

    if (!lottery) {
      return res.status(400).json({
        ok: false,
        error: "Parâmetro inválido: lottery (ex.: PT_RIO)",
      });
    }

    if (fromRaw && !from) {
      return res.status(400).json({
        ok: false,
        error: "Parâmetro inválido: from (use HH:MM, 10h ou 10)",
      });
    }

    if (toRaw && !to) {
      return res.status(400).json({
        ok: false,
        error: "Parâmetro inválido: to (use HH:MM, 10h ou 10)",
      });
    }

    // Query mínima: SOMENTE date (evita índice composto)
    const snap = await db
      .collection("draws")
      .where("date", "==", date)
      .get();

    const rawDraws = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        ...data,
        close_hour: normalizeHHMM(data.close_hour),
      };
    });

    // Filtra lottery em memória
    const byLottery = rawDraws.filter(
      (d) => String(d.lottery_key || "").trim() === lottery
    );

    // Ordena por close_hour
    byLottery.sort((a, b) => cmpHHMM(a.close_hour, b.close_hour));

    // Filtra por janela de horário
    const drawsWindow = byLottery.filter((d) => {
      if (!from && !to) return true;
      return inRangeHHMM(d.close_hour, from || "", to || "");
    });

    if (!includePrizes) {
      return res.json({
        ok: true,
        date,
        lottery,
        from: from || null,
        to: to || null,
        count: drawsWindow.length,
        draws: drawsWindow,
      });
    }

    // Carrega prizes por draw (sequencial, estável)
    const draws = [];
    for (const d of drawsWindow) {
      const docRef = db.collection("draws").doc(d.id);

      const prizesSnap = await docRef
        .collection("prizes")
        .orderBy("position", "asc")
        .get();

      draws.push({
        ...d,
        prizes: prizesSnap.docs.map((p) => p.data()),
      });
    }

    return res.json({
      ok: true,
      date,
      lottery,
      from: from || null,
      to: to || null,
      count: draws.length,
      draws,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e?.message || "erro",
    });
  }
});

module.exports = router;
