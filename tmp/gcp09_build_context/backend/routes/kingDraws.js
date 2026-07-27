"use strict";

const express = require("express");
const { getDb } = require("../service/firebaseAdmin");

const router = express.Router();

console.log("[KING] routes loaded from:", __filename);

/* =========================
   NORMALIZAÇÃO
========================= */
function normalizeLotteryKey(v) {
  const s = String(v ?? "").trim().toUpperCase();

  if (s === "RJ" || s === "RIO" || s === "PT-RIO" || s === "PT_RIO") return "PT_RIO";
  if (s === "FED" || s === "FEDERAL" || s === "BR") return "FEDERAL";

  return "";
}

/* =========================
   REGRAS DE HORÁRIOS
========================= */
function getExpectedHours(lottery, date, hasFederal) {
  if (lottery !== "PT_RIO") return [];

  const dt = new Date(`${date}T12:00:00`);
  const dow = dt.getDay(); // 0 = domingo

  // Domingo: só 09, 11, 14, 16
  if (dow === 0) {
    return ["09:00", "11:00", "14:00", "16:00"];
  }

  // Base fixa todos os outros dias
  const expected = ["09:00", "11:00", "14:00", "16:00"];

  // 21h existe fora domingo
  expected.push("21:00");

  // 18h só se NÃO tiver Federal no dia
  if (!hasFederal) {
    expected.push("18:00");
  }

  return expected.sort();
}

function checkDrawIntegrity(draws, lottery, date, hasFederal) {
  const expectedHours = getExpectedHours(lottery, date, hasFederal);

  if (!expectedHours.length) {
    return {
      ok: true,
      missing: [],
      extra: [],
      expectedHours: [],
      hasFederal: Boolean(hasFederal),
    };
  }

  const gotHours = (Array.isArray(draws) ? draws : [])
    .map((d) => String(d?.close_hour || "").trim())
    .filter(Boolean);

  const missing = expectedHours.filter((h) => !gotHours.includes(h));
  const extra = gotHours.filter((h) => !expectedHours.includes(h));

  if (missing.length || extra.length) {
    console.warn(
      `[DRAW ALERT] ${lottery} ${date} missing=${missing.join(", ")} extra=${extra.join(", ")} hasFederal=${hasFederal ? "1" : "0"}`
    );
  }

  return {
    ok: missing.length === 0 && extra.length === 0,
    missing,
    extra,
    expectedHours,
    hasFederal: Boolean(hasFederal),
  };
}

/* =========================
   HELPERS
========================= */
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

function isHHMM(s) {
  const str = String(s || "").trim();
  const m = str.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;

  const hh = Number(m[1]);
  const mm = Number(m[2]);

  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

function normalizeHHMM(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";

  if (isHHMM(s)) return s;

  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) {
    const hh = Number(m1[1]);
    if (hh >= 0 && hh <= 23) return `${String(hh).padStart(2, "0")}:00`;
    return "";
  }

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) {
    const hh = Number(m2[1]);
    if (hh >= 0 && hh <= 23) return `${String(hh).padStart(2, "0")}:00`;
    return "";
  }

  const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m3) {
    const hh = Number(m3[1]);
    const mm = Number(m3[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    return "";
  }

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

function parseIncludePrizes(v, defBool) {
  const raw = String(v ?? (defBool ? "1" : "0")).trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function getLotteryFromQuery(req) {
  return normalizeLotteryKey(req.query.lotteryKey ?? req.query.lottery ?? req.query.uf);
}

function getWindowFromQuery(req) {
  const fromRaw = req.query.from != null ? String(req.query.from).trim() : "";
  const toRaw = req.query.to != null ? String(req.query.to).trim() : "";

  const from = fromRaw ? normalizeHHMM(fromRaw) : "";
  const to = toRaw ? normalizeHHMM(toRaw) : "";

  if (fromRaw && !from) {
    return { error: "Parâmetro inválido: from (use HH:MM, 10h ou 10)" };
  }
  if (toRaw && !to) {
    return { error: "Parâmetro inválido: to (use HH:MM, 10h ou 10)" };
  }

  return { from, to };
}

function parsePositionsParam(v) {
  const raw = String(v ?? "").trim().toLowerCase();
  if (!raw) return { positions: null, maxPos: null };

  const m = raw.match(/^(\d+)\s*(?:\-|\.\.)\s*(\d+)$/);
  if (m) {
    const a = Math.max(1, Number(m[1]));
    const b = Math.max(1, Number(m[2]));
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const positions = [];
    for (let i = lo; i <= hi; i += 1) positions.push(i);
    return { positions, maxPos: hi };
  }

  const parts = raw
    .split(",")
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isFinite(n) && n >= 1);

  if (!parts.length) return { positions: null, maxPos: null };

  const uniq = Array.from(new Set(parts)).sort((a, b) => a - b);
  return { positions: uniq, maxPos: uniq[uniq.length - 1] };
}

/* =========================
   FIRESTORE
========================= */
async function fetchDayDraws(db, ymd) {
  const [s1, s2] = await Promise.all([
    db.collection("draws").where("ymd", "==", ymd).get(),
    db.collection("draws").where("date", "==", ymd).get(),
  ]);

  const map = new Map();

  for (const doc of s1.docs) map.set(doc.id, doc);
  for (const doc of s2.docs) map.set(doc.id, doc);

  return Array.from(map.values());
}

async function mapWithConcurrency(items, limitN, mapper) {
  const arr = Array.isArray(items) ? items : [];
  const concurrency = Math.max(1, Number(limitN) || 6);
  const results = new Array(arr.length);
  let idx = 0;

  async function worker() {
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

async function loadPrizesForDraws(db, drawsWindow, includePrizes, positionsInfo) {
  if (!includePrizes) return drawsWindow;

  const posArr =
    positionsInfo && Array.isArray(positionsInfo.positions)
      ? positionsInfo.positions
      : null;

  const posSet =
    posArr && posArr.length
      ? new Set(posArr.map((n) => Number(n)))
      : null;

  const draws = await mapWithConcurrency(drawsWindow, 6, async (d) => {
    let q = db
      .collection("draws")
      .doc(d.id)
      .collection("prizes")
      .orderBy("position", "asc");

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

/* =========================
   NORMALIZAÇÃO DE DRAW
========================= */
function normalizeDrawDoc(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    ...data,
    close_hour: normalizeHHMM(data.close_hour ?? data.close ?? data.hour),
  };
}

function sortDrawsByHourOnly(a, b) {
  return cmpHHMM(a.close_hour, b.close_hour);
}

function sortDrawsByDateThenHour(a, b) {
  const da = String(a.ymd || a.date || "");
  const db = String(b.ymd || b.date || "");
  if (da !== db) return da.localeCompare(db);
  return cmpHHMM(a.close_hour, b.close_hour);
}

function applyLotteryFilter(draws, lottery) {
  return (Array.isArray(draws) ? draws : []).filter(
    (d) => upTrim(d.lottery_key) === lottery
  );
}

function applyHourWindow(draws, from, to) {
  return (Array.isArray(draws) ? draws : []).filter((d) => {
    if (!from && !to) return true;
    return inRangeHHMM(d.close_hour, from || "", to || "");
  });
}

function hasFederalInDraws(draws) {
  return (Array.isArray(draws) ? draws : []).some(
    (d) => upTrim(d.lottery_key) === "FEDERAL"
  );
}

/* =========================
   REDIRECT / VALIDATION
========================= */
function redirect308(destPath) {
  return (req, res) => {
    const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    return res.redirect(308, `${req.baseUrl}${destPath}${q}`);
  };
}

function requireLotteryOr400(lottery, res) {
  if (!lottery) {
    res.status(400).json({
      ok: false,
      error: "Parâmetro inválido: lottery (use RJ/PT_RIO ou FED/FEDERAL)",
    });
    return false;
  }
  return true;
}

/* =========================
   ENDPOINT LEGADO
========================= */
router.get("/draws", async (req, res) => {
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

    if (!requireLotteryOr400(lottery, res)) return;

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

    const docs = await fetchDayDraws(db, date);
    const rawDraws = docs.map(normalizeDrawDoc);
    const hasFederal = hasFederalInDraws(rawDraws);

    const byLottery = applyLotteryFilter(rawDraws, lottery).sort(sortDrawsByHourOnly);
    const drawsWindow = applyHourWindow(byLottery, from || "", to || "");
    const draws = await loadPrizesForDraws(db, drawsWindow, includePrizes, positionsInfo);

    const integrity = checkDrawIntegrity(draws, lottery, date, hasFederal);

    return res.json({
      ok: true,
      integrity,
      date,
      lottery,
      from: from || null,
      to: to || null,
      includePrizes,
      count: draws.length,
      draws,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "erro" });
  }
});

/* =========================
   ROTAS CANÔNICAS
========================= */
router.get("/results/day", redirect308("/draws/day"));
router.get("/results/range", redirect308("/draws/range"));

async function handleDay(req, res) {
  try {
    const db = getDb();

    const date = String(req.query.date || "").trim();
    const lottery = getLotteryFromQuery(req);

    if (!requireLotteryOr400(lottery, res)) return;

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

    const docs = await fetchDayDraws(db, date);
    const rawDraws = docs.map(normalizeDrawDoc);
    const hasFederal = hasFederalInDraws(rawDraws);

    const byLottery = applyLotteryFilter(rawDraws, lottery).sort(sortDrawsByHourOnly);
    const drawsWindow = applyHourWindow(byLottery, win.from || "", win.to || "");
    const draws = await loadPrizesForDraws(db, drawsWindow, includePrizes, positionsInfo);

    const integrity = checkDrawIntegrity(draws, lottery, date, hasFederal);

    return res.json({
      ok: true,
      mode: "day",
      integrity,
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

async function handleRange(req, res) {
  try {
    const db = getDb();

    const dateFrom = String(req.query.dateFrom || "").trim();
    const dateTo = String(req.query.dateTo || "").trim();
    const lottery = getLotteryFromQuery(req);

    if (!requireLotteryOr400(lottery, res)) return;

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

    const includePrizes = parseIncludePrizes(req.query.includePrizes, false);
    const positionsInfo = parsePositionsParam(req.query.positions);

    const snap = await db
      .collection("draws")
      .where("ymd", ">=", dateFrom)
      .where("ymd", "<=", dateTo)
      .orderBy("ymd", "asc")
      .get();

    const rawDraws = snap.docs.map(normalizeDrawDoc);
    const byLottery = applyLotteryFilter(rawDraws, lottery).sort(sortDrawsByDateThenHour);
    const drawsWindow = applyHourWindow(byLottery, win.from || "", win.to || "");
    const draws = await loadPrizesForDraws(db, drawsWindow, includePrizes, positionsInfo);

    const groupedIntegrity = {};
    if (lottery === "PT_RIO") {
      const rawByDay = rawDraws.reduce((acc, d) => {
        const ymd = String(d.ymd || d.date || "").trim();
        if (!ymd) return acc;
        if (!acc[ymd]) acc[ymd] = [];
        acc[ymd].push(d);
        return acc;
      }, {});

      const filteredByDay = draws.reduce((acc, d) => {
        const ymd = String(d.ymd || d.date || "").trim();
        if (!ymd) return acc;
        if (!acc[ymd]) acc[ymd] = [];
        acc[ymd].push(d);
        return acc;
      }, {});

      const allDays = Array.from(
        new Set([
          ...Object.keys(rawByDay),
          ...Object.keys(filteredByDay),
        ])
      ).sort();

      for (const ymd of allDays) {
        const dayRaw = rawByDay[ymd] || [];
        const dayFiltered = filteredByDay[ymd] || [];
        const hasFederal = hasFederalInDraws(dayRaw);
        groupedIntegrity[ymd] = checkDrawIntegrity(dayFiltered, lottery, ymd, hasFederal);
      }
    }

    return res.json({
      ok: true,
      mode: "range",
      integrityByDay: groupedIntegrity,
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

router.get("/draws/day", handleDay);
router.get("/draws/range", handleRange);

module.exports = router;