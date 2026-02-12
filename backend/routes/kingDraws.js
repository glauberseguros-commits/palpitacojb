"use strict";



// 🔒 Normalização única de lottery_key
function normalizeLotteryKey(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s === "RJ") return "PT_RIO";
  if (s === "RIO") return "PT_RIO";
  if (s === "PT-RIO") return "PT_RIO";
  return s || "PT_RIO";
}
const express = require("express");
const { getDb } = require("../service/firebaseAdmin");

const router = express.Router();

// ✅ prova definitiva do arquivo carregado (ajuda demais em debug de "sumiu/voltou")
console.log("[KING] routes loaded from:", __filename);

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
  if (m1) return `${String(m1[1]).padStart(2, "0")}:00`;

  // "10" => "10:00"
  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${String(m2[1]).padStart(2, "0")}:00`;

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

function upTrim(v) {
  return String(v ?? "").trim().toUpperCase();
}

/**
 * Concorrência limitada (evita “flood” e mantém rápido)
 */
async function mapWithConcurrency(items, limitN, mapper) {
  const arr = Array.isArray(items) ? items : [];
  const concurrency = Math.max(1, Number(limitN) || 6);
  const results = new Array(arr.length);
  let idx = 0;

  async function worker() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const current = idx;
      idx += 1;
      if (current >= arr.length) break;
      results[current] = await mapper(arr[current], current);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, arr.length) }, () => worker())
  );
  return results;
}

/**
 * Helpers (aliases)
 */
function parseIncludePrizes(v, defBool) {
  const raw = String(v ?? (defBool ? "1" : "0"))
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function getLotteryFromQuery(req) {
  // compat: uf=PT_RIO (frontend) ou lottery=PT_RIO (técnico)
  return normalizeLotteryKey(req.query.lottery || req.query.uf || req.query.lottery);
}

function getWindowFromQuery(req) {
  const fromRaw = req.query.from != null ? String(req.query.from).trim() : "";
  const toRaw = req.query.to != null ? String(req.query.to).trim() : "";

  const from = fromRaw ? normalizeHHMM(fromRaw) : "";
  const to = toRaw ? normalizeHHMM(toRaw) : "";

  if (fromRaw && !from) return { error: "Parâmetro inválido: from (use HH:MM, 10h ou 10)" };
  if (toRaw && !to) return { error: "Parâmetro inválido: to (use HH:MM, 10h ou 10)" };

  return { from, to };
}


function parsePositionsParam(v) {
  const raw = String(v ?? "").trim().toLowerCase();
  if (!raw) return { positions: null, maxPos: null };

  // aceita "1-5" ou "1..5"
  const m = raw.match(/^(\d+)\s*(?:\-|\.\.)\s*(\d+)$/);
  if (m) {
    const a = Math.max(1, Number(m[1]));
    const b = Math.max(1, Number(m[2]));
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const positions = [];
    for (let i = lo; i <= hi; i++) positions.push(i);
    return { positions, maxPos: hi };
  }

  // aceita "1,2,3,4,5"
  const parts = raw
    .split(",")
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isFinite(n) && n >= 1);

  if (!parts.length) return { positions: null, maxPos: null };

  const uniq = Array.from(new Set(parts)).sort((a, b) => a - b);
  const maxPos = uniq[uniq.length - 1];
  return { positions: uniq, maxPos };
}

async function loadPrizesForDraws(db, drawsWindow, includePrizes, positionsInfo) {
  if (!includePrizes) return drawsWindow;

  const posArr = positionsInfo && Array.isArray(positionsInfo.positions) ? positionsInfo.positions : null;
  const posSet = posArr && posArr.length ? new Set(posArr.map((n) => Number(n))) : null;

  const draws = await mapWithConcurrency(drawsWindow, 6, async (d) => {
    let q = db
      .collection("draws")
      .doc(d.id)
      .collection("prizes")
      .orderBy("position", "asc");

    // se positions é contíguo desde 1 até maxPos, limita no Firestore
    if (positionsInfo && positionsInfo.maxPos && posArr) {
      const maxPos = Number(positionsInfo.maxPos) || null;
      const contiguousFrom1 =
        maxPos &&
        posArr.length === maxPos &&
        Number(posArr[0]) === 1 &&
        Number(posArr[posArr.length - 1]) === maxPos;

      if (contiguousFrom1) q = q.limit(maxPos);
    }

    const prizesSnap = await q.get();
    const rows = prizesSnap.docs.map((p) => p.data());

    const prizes = posSet
      ? rows.filter((r) => posSet.has(Number(r.position)))
      : rows;

    return { ...d, prizes };
  });

  return draws;
}


/**
 * ✅ Redirect 308 preservando querystring
 * - req.baseUrl aqui é "/api/king"
 */
function redirect308(destPath) {
  return (req, res) => {
  // aceita ?lottery= ou ?uf=
  const lottery = getLotteryFromQuery(req);
    const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    return res.redirect(308, `${req.baseUrl}${destPath}${q}`);
  };
}

/**
 * KING DRAWS (endpoint técnico legado)
 *
 * GET /api/king/draws?date=2026-01-02&lottery=PT_RIO&from=09:00&to=16:40&includePrizes=1
 *
 * Anti-índice composto:
 * - Query filtra SOMENTE por date
 * - lottery_key e janela de horário são filtrados em memória
 */
router.get("/draws", async (req, res) => {
  // aceita ?lottery= ou ?uf=
  const lottery = getLotteryFromQuery(req);
  try {
    const db = getDb();

    const date = String(req.query.date || "").trim();
    const lottery = getLotteryFromQuery(req);
    const fromRaw = req.query.from != null ? String(req.query.from).trim() : "";
    const toRaw = req.query.to != null ? String(req.query.to).trim() : "";

    const from = fromRaw ? normalizeHHMM(fromRaw) : "";
    const to = toRaw ? normalizeHHMM(toRaw) : "";

    const includePrizes = parseIncludePrizes(req.query.includePrizes, true);
    const positionsInfo = parsePositionsParam(req.query.positions);
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
    const snap = await db.collection("draws").where("date", "==", date).get();

    const rawDraws = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        ...data,
        close_hour: normalizeHHMM(data.close_hour),
      };
    });

    // Filtra lottery em memória (normalizado)
    const byLottery = rawDraws.filter((d) => upTrim(d.lottery_key) === lottery);

    // Ordena por close_hour
    byLottery.sort((a, b) => cmpHHMM(a.close_hour, b.close_hour));

    // Filtra por janela de horário
    const drawsWindow = byLottery.filter((d) => {
      if (!from && !to) return true;
      return inRangeHHMM(d.close_hour, from || "", to || "");
    });

    const draws = await loadPrizesForDraws(db, drawsWindow, includePrizes, positionsInfo);

    return res.json({
      ok: true,
      date,
      lottery,
      from: from || null,
      to: to || null,
      includePrizes,
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

/* =========================================================
   ✅ Rotas CANÔNICAS
   - /api/king/draws/day
   - /api/king/draws/range

   ✅ Rotas COMPAT (nunca mais “some”)
   - /api/king/results/day   -> 308 -> /api/king/draws/day
   - /api/king/results/range -> 308 -> /api/king/draws/range
========================================================= */

// ✅ compat SEM duplicar handler (tira a chance de “sumir/voltar” por divergência)
router.get("/results/day", redirect308("/draws/day"));
router.get("/results/range", redirect308("/draws/range"));

// handler compartilhado: DAY (CANÔNICO)
async function handleDay(req, res) {
  try {
    const db = getDb();

    const date = String(req.query.date || "").trim();
    const lottery = getLotteryFromQuery(req);
    if (!isISODate(date)) {
      return res.status(400).json({
        ok: false,
        error: "Parâmetro inválido: date (use YYYY-MM-DD)",
      });
    }

    const win = getWindowFromQuery(req);
    if (win.error) return res.status(400).json({ ok: false, error: win.error });

    const includePrizes = parseIncludePrizes(req.query.includePrizes, true);
    const positionsInfo = parsePositionsParam(req.query.positions);
// Query mínima: SOMENTE date (evita índice composto)
    const snap = await db.collection("draws").where("date", "==", date).get();

    const rawDraws = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        ...data,
        close_hour: normalizeHHMM(data.close_hour),
      };
    });

    const byLottery = rawDraws.filter((d) => upTrim(d.lottery_key) === lottery);
    byLottery.sort((a, b) => cmpHHMM(a.close_hour, b.close_hour));

    const drawsWindow = byLottery.filter((d) => {
      if (!win.from && !win.to) return true;
      return inRangeHHMM(d.close_hour, win.from || "", win.to || "");
    });

    const draws = await loadPrizesForDraws(db, drawsWindow, includePrizes, positionsInfo);

    return res.json({
      ok: true,
      mode: "day",
      date,
      lottery,
      from: win.from || null,
      to: win.to || null,
      includePrizes,
      count: draws.length,
      draws,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "erro" });
  }
}

// handler compartilhado: RANGE (CANÔNICO)
async function handleRange(req, res) {
  try {
    const db = getDb();

    const dateFrom = String(req.query.dateFrom || "").trim();
    const dateTo = String(req.query.dateTo || "").trim();
    const lottery = getLotteryFromQuery(req);
    if (!isISODate(dateFrom) || !isISODate(dateTo)) {
      return res.status(400).json({
        ok: false,
        error: "Parâmetro inválido: dateFrom/dateTo (use YYYY-MM-DD)",
      });
    }

    if (dateFrom > dateTo) {
      return res.status(400).json({
        ok: false,
        error: "Parâmetro inválido: dateFrom não pode ser maior que dateTo",
      });
    }

    const win = getWindowFromQuery(req);
    if (win.error) return res.status(400).json({ ok: false, error: win.error });

    // RANGE: por padrão NÃO inclui prizes (evita payload gigante)
    const includePrizes = parseIncludePrizes(req.query.includePrizes, false);
    const positionsInfo = parsePositionsParam(req.query.positions);
// Query por ymd => estável e sem índice composto
    const snap = await db
      .collection("draws")
      .where("ymd", ">=", dateFrom)
      .where("ymd", "<=", dateTo)
      .orderBy("ymd", "asc")
      .get();

    const rawDraws = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        ...data,
        close_hour: normalizeHHMM(data.close_hour),
      };
    });

    const byLottery = rawDraws.filter((d) => upTrim(d.lottery_key) === lottery);

    // Ordena por (ymd, close_hour)
    byLottery.sort((a, b) => {
      const da = String(a.ymd || a.date || "");
      const dbb = String(b.ymd || b.date || "");
      if (da !== dbb) return da.localeCompare(dbb);
      return cmpHHMM(a.close_hour, b.close_hour);
    });

    const drawsWindow = byLottery.filter((d) => {
      if (!win.from && !win.to) return true;
      return inRangeHHMM(d.close_hour, win.from || "", win.to || "");
    });

    const draws = await loadPrizesForDraws(db, drawsWindow, includePrizes, positionsInfo);

    return res.json({
      ok: true,
      mode: "range",
      dateFrom,
      dateTo,
      lottery,
      from: win.from || null,
      to: win.to || null,
      includePrizes,
      count: draws.length,
      draws,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "erro" });
  }
}

// ✅ canônicos
router.get("/draws/day", handleDay);
router.get("/draws/range", handleRange);

module.exports = router;


















