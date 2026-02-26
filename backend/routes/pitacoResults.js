"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

const router = express.Router();

/* =========================
   TIME (America/Sao_Paulo)
========================= */

function todayYMDInSaoPaulo() {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value || "1970";
    const m = parts.find((p) => p.type === "month")?.value || "01";
    const d = parts.find((p) => p.type === "day")?.value || "01";
    return `${y}-${m}-${d}`;
  } catch {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
}

function nowMinutesInSaoPaulo() {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());

    const hh = Number(parts.find((p) => p.type === "hour")?.value || "0");
    const mm = Number(parts.find((p) => p.type === "minute")?.value || "0");
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
    return hh * 60 + mm;
  } catch {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
}

function hourToMinutes(hh) {
  const n = Number(String(hh ?? "").trim());
  if (!Number.isFinite(n)) return NaN;
  return n * 60;
}

function isSlotPublishedToday(hh, nowMin, graceMin) {
  const hm = hourToMinutes(hh);
  if (!Number.isFinite(hm)) return false;
  const g = Number.isFinite(graceMin) ? graceMin : 25;
  return nowMin >= hm + g;
}

/* =========================
   LOTTERY KEY NORMALIZATION
========================= */

function normalizeLotteryKey(v) {
  const s = String(v ?? "").trim().toUpperCase();

  // RJ
  if (s === "RJ" || s === "RIO" || s === "PT-RIO" || s === "PT_RIO") return "PT_RIO";

  // FEDERAL
  if (s === "FED" || s === "FEDERAL") return "FEDERAL";

  // inválido → força 400 (projeto atual só usa PT_RIO e FEDERAL)
  return "";
}

/* =========================
   HELPERS
========================= */

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function isHHMM(s) {
  return /^\d{2}:\d{2}$/.test(String(s || "").trim());
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function normalizeHHMM(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";

  if (isHHMM(s)) return s;

  // "10h" => "10:00"
  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${pad2(m1[1])}:00`;

  // "10" => "10:00"
  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  // "10:9" => "10:09"
  const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m3) {
    const hh = pad2(m3[1]);
    const mm = pad2(m3[2]);
    return `${hh}:${mm}`;
  }

  return "";
}

function hourFromCloseHour(closeHour) {
  const s0 = String(closeHour ?? "").trim();
  if (!s0) return null;
  const m = s0.match(/(\d{1,2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
  return pad2(hh);
}

function cmpHHMM(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function upTrim(v) {
  return String(v ?? "").trim().toUpperCase();
}

function parseBool01(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

function parsePosInt(v, def, min, max) {
  const s = String(v ?? "").trim();
  if (!s) return def; // ✅ evita Number('') => 0 quando v é undefined/empty

  const n = Number(s);
  if (!Number.isFinite(n)) return def;

  const i = Math.trunc(n);
  if (Number.isFinite(min) && i < min) return min;
  if (Number.isFinite(max) && i > max) return max;
  return i;
}

function uniqSorted(arr) {
  return Array.from(
    new Set((Array.isArray(arr) ? arr : []).filter(Boolean))
  ).sort();
}

function setDiff(a, bSet) {
  const out = [];
  for (const v of Array.isArray(a) ? a : []) {
    if (!bSet.has(v)) out.push(v);
  }
  return out;
}

function intersectToSet(a, bSet) {
  const out = new Set();
  for (const v of Array.isArray(a) ? a : []) {
    if (bSet.has(v)) out.add(v);
  }
  return out;
}

function isFutureISODate(ymd) {
  if (!isISODate(ymd)) return false;
  const todayBR = todayYMDInSaoPaulo();
  return String(ymd) > String(todayBR);
}

/* =========================
   Day Status cache
========================= */

const _dayStatusCache = new Map(); // lottery -> { loadedAt, map }
const DAY_STATUS_TTL_MS = 60_000; // 1 min (dev-friendly)

function readDayStatusMap(lottery, opts) {
  const key = upTrim(lottery || "PT_RIO") || "PT_RIO";
  const reload = !!(opts && opts.reload);

  const cached = _dayStatusCache.get(key);
  if (!reload && cached && Date.now() - cached.loadedAt < DAY_STATUS_TTL_MS) {
    return cached.map;
  }

  const p = path.join(__dirname, "..", "data", "day_status", `${key}.json`);
  let map = {};
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      const j = raw ? JSON.parse(raw) : {};
      if (j && typeof j === "object") map = j;
    }
  } catch {
    map = {};
  }

  _dayStatusCache.set(key, { loadedAt: Date.now(), map });
  return map;
}

function shouldBlockDayStatus(dayStatus, strict) {
  // sempre bloqueia
  if (dayStatus === "holiday_no_draw") return true;
  if (dayStatus === "incomplete") return true;

  // modo estrito: só dias "completos" (normal / normal_partial)
  if (strict && dayStatus === "partial_hard") return true;

  return false;
}

/* =========================
   SLOT SCHEDULE
========================= */

const DEFAULT_SCHEDULE_DIR = path.join(__dirname, "..", "data", "slot_schedule");
const DEFAULT_GAPS_DIR = path.join(__dirname, "..", "data", "source_gaps");

function safeReadJson(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw || "{}");
    return j && typeof j === "object" ? j : fallback;
  } catch {
    return fallback;
  }
}

function normalizeHourList(arr) {
  const out = [];
  const seen = new Set();
  for (const v of Array.isArray(arr) ? arr : []) {
    const m = String(v ?? "").match(/\d{1,2}/);
    if (!m) continue;
    const hh = pad2(Number(m[0]));
    const n = Number(hh);
    if (!Number.isFinite(n) || n < 0 || n > 23) continue;
    if (!seen.has(hh)) {
      seen.add(hh);
      out.push(hh);
    }
  }
  return out.sort();
}

function shouldInclude09ForDate(ymd, include09FromYmd) {
  if (include09FromYmd && isISODate(include09FromYmd)) return ymd >= include09FromYmd;
  return false;
}

function expectedHoursPT_RIO_FALLBACK(ymd, include09FromYmd) {
  // dow SP (-03:00) no meio-dia evita edge de DST
  const d = new Date(`${ymd}T12:00:00-03:00`);
  const dow = d.getDay(); // 0=dom

  const has09 = shouldInclude09ForDate(ymd, include09FromYmd);

  const hardWeek = ["11", "14", "16", "18", "21"];
  const hardSun = ["11", "14", "16"];

  const hard = [];
  const soft = [];

  if (dow === 0) {
    hard.push(...hardSun);
    if (has09) soft.push("09"); // domingo 09 variável
    return { hard, soft, mode: "fallback", scheduleFile: false };
  }

  if (has09) hard.push("09");
  hard.push(...hardWeek);

  return { hard, soft, mode: "fallback", scheduleFile: false };
}

function pickRangeForDate(ranges, ymd) {
  for (const r of Array.isArray(ranges) ? ranges : []) {
    const from0 = String(r?.from || "").trim();
    const to0 = String(r?.to || "").trim();

    const hasFrom = isISODate(from0);
    const hasTo = isISODate(to0);

    // sem from/to => "default" range
    if (!hasFrom && !hasTo) return r;

    // aberto
    if (!hasFrom && hasTo) {
      if (ymd <= to0) return r;
      continue;
    }
    if (hasFrom && !hasTo) {
      if (ymd >= from0) return r;
      continue;
    }

    // fechado
    if (hasFrom && hasTo && ymd >= from0 && ymd <= to0) return r;
  }
  return null;
}

function parseScheduleGlobal(scheduleRaw) {
  const hard = normalizeHourList(scheduleRaw?.hard || scheduleRaw?.expectedHard || []);
  const soft = normalizeHourList(scheduleRaw?.soft || scheduleRaw?.expectedSoft || []);
  const hours = normalizeHourList(scheduleRaw?.hours || []);
  if (hours.length) return { hard: hours, soft: [], mode: "schedule", scheduleFile: true };
  if (hard.length || soft.length) return { hard, soft, mode: "schedule", scheduleFile: true };
  return null;
}

function getExpectedForDate(lotteryKey, ymd, include09FromYmdDefault) {
  const p = path.join(DEFAULT_SCHEDULE_DIR, `${lotteryKey}.json`);
  const scheduleRaw = safeReadJson(p, null);
  const scheduleFile = !!scheduleRaw;

  // 1) se schedule existir e for "global" (sem ranges), usa
  if (scheduleRaw) {
    const global = parseScheduleGlobal(scheduleRaw);
    if (global && (global.hard.length || global.soft.length)) return global;
  }

  // 2) tenta ranges
  const ranges = Array.isArray(scheduleRaw) ? scheduleRaw : scheduleRaw?.ranges;
  const r = pickRangeForDate(ranges, ymd);

  if (r) {
    // ✅ Suporta schedule por dia da semana:
    if (r.dow && typeof r.dow === "object") {
      const d = new Date(String(ymd) + "T12:00:00-03:00");
      const dow = String(d.getDay()); // 0=dom
      const block = r.dow[dow] || r.dow[Number(dow)] || null;

      const hard = normalizeHourList(block?.hard || block?.expectedHard || []);
      const soft = normalizeHourList(block?.soft || block?.expectedSoft || []);
      const hours = normalizeHourList(block?.hours || []);

      if (hours.length) return { hard: hours, soft: [], mode: "schedule", scheduleFile: true };
      return { hard, soft, mode: "schedule", scheduleFile: true };
    }

    // formato antigo
    const hard = normalizeHourList(r?.hard || r?.expectedHard || []);
    const soft = normalizeHourList(r?.soft || r?.expectedSoft || []);
    const hours = normalizeHourList(r?.hours || []);
    if (hours.length) return { hard: hours, soft: [], mode: "schedule", scheduleFile: true };
    return { hard, soft, mode: "schedule", scheduleFile: true };
  }

  // 3) fallback: PT_RIO
  if (lotteryKey === "PT_RIO") {
    return expectedHoursPT_RIO_FALLBACK(ymd, include09FromYmdDefault || "2024-01-05");
  }

  // 4) universo vazio
  return { hard: [], soft: [], mode: "none", scheduleFile };
}

/* =========================
   SOURCE GAPS
========================= */

const _gapsCache = new Map(); // lottery -> { loadedAt, map }
const GAPS_TTL_MS = 60_000;

function readGapsMap(lottery, opts) {
  const key = upTrim(lottery || "PT_RIO") || "PT_RIO";
  const reload = !!(opts && opts.reload);

  const cached = _gapsCache.get(key);
  if (!reload && cached && Date.now() - cached.loadedAt < GAPS_TTL_MS) {
    return cached.map;
  }

  const p = path.join(DEFAULT_GAPS_DIR, `${key}.json`);
  let map = {};
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      const j = raw ? JSON.parse(raw) : {};
      if (j && typeof j === "object") map = j;
    }
  } catch {
    map = {};
  }

  _gapsCache.set(key, { loadedAt: Date.now(), map });
  return map;
}

function normalizeGapEntry(entry) {
  if (Array.isArray(entry)) {
    return {
      removedHard: normalizeHourList(entry),
      removedSoft: [],
    };
  }

  const obj = entry && typeof entry === "object" ? entry : {};
  const hard = obj.removedHard || obj.removeHard || obj.hard || obj.expectedRemovedHard || [];
  const soft = obj.removedSoft || obj.removeSoft || obj.soft || obj.expectedRemovedSoft || [];

  return {
    removedHard: normalizeHourList(hard),
    removedSoft: normalizeHourList(soft),
  };
}

function getGapsForDate(lotteryKey, ymd, opts) {
  const map = readGapsMap(lotteryKey, opts);
  const entry = map?.[ymd];
  if (!entry) return { removedHard: [], removedSoft: [] };
  return normalizeGapEntry(entry);
}

/* =========================
   CONCURRENCY
========================= */

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

/* =========================
   ROUTE
========================= */

// GET /api/pitaco/results?date=YYYY-MM-DD&lottery=PT_RIO
// compat:
// - aceita também ?uf= e ?lotteryKey=
// - &strict=1
// - &reloadDayStatus=1
// - &reloadGaps=1
// - &includePrizes=0|1 (default 1)
// - &limitDocs=120 (min 20 max 500)
// - &slotGraceMin=25
// - &noCapToday=1

function buildSlots(opts) {
  const {
    scheduleAll,
    byHour,
    baseSoft,
    removedHardApplied,
    removedSoftApplied,
    expectedHard,
    expectedSoft,
    expectedHardPublished,
    expectedSoftPublished,
    capToday,
    isToday,
    nowMinBR,
    slotGraceMin,
  } = opts || {};

  return (Array.isArray(scheduleAll) ? scheduleAll : []).map((hh) => {
    const draw = byHour?.get ? byHour.get(hh) || null : null;

    const isSoft = Array.isArray(baseSoft) && baseSoft.includes(hh);
    const kind = isSoft ? "soft" : "hard";

    // GAP (escusado)
    if (removedHardApplied?.has?.(hh) || removedSoftApplied?.has?.(hh)) {
      return { hour: hh, kind, status: "gap", reason: "source_gap", draw: null };
    }

    // válido
    if (draw) return { hour: hh, kind, status: "valid", draw };

    // ✅ HOJE + ainda não publicado → FUTURE
    if (
      capToday &&
      isToday &&
      ((expectedHard && expectedHard.includes(hh)) ||
        (expectedSoft && expectedSoft.includes(hh)))
    ) {
      const published = isSlotPublishedToday(hh, nowMinBR, slotGraceMin);
      if (!published) {
        return {
          hour: hh,
          kind,
          status: "future",
          reason: "not_yet_published",
          draw: null,
        };
      }
    }

    // faltante — apenas se já deveria ter saído
    if (expectedHardPublished && expectedHardPublished.includes(hh)) {
      return { hour: hh, kind: "hard", status: "missing", draw: null };
    }
    if (expectedSoftPublished && expectedSoftPublished.includes(hh)) {
      return { hour: hh, kind: "soft", status: "soft_missing", draw: null };
    }

    // defensivo: não esperado
    return { hour: hh, kind, status: "gap", reason: "not_expected", draw: null };
  });
}

router.get("/results", async (req, res) => {
  const slotGraceMin = parsePosInt(req.query.slotGraceMin, 25, 0, 240);
  const noCapToday = parseBool01(req.query.noCapToday);
  const capToday = !noCapToday;

  // aceita ?lottery= ou ?lotteryKey= ou ?uf=
  const lotteryRaw = String(req.query.lotteryKey || req.query.lottery || req.query.uf || "").trim();
  const lotteryKey = normalizeLotteryKey(lotteryRaw);

  try {
    const date = String(req.query.date || "").trim();
    const lottery = lotteryKey;
    const strict = parseBool01(req.query.strict);
    const reloadDayStatus = parseBool01(req.query.reloadDayStatus);
    const reloadGaps = parseBool01(req.query.reloadGaps);

    const includePrizes =
      req.query.includePrizes == null ? true : parseBool01(req.query.includePrizes);

    const limitDocs = parsePosInt(req.query.limitDocs, 120, 20, 500);

    if (!date) return res.status(400).json({ ok: false, error: "date obrigatório" });
    if (!isISODate(date)) {
      return res
        .status(400)
        .json({ ok: false, error: "date inválido (use YYYY-MM-DD)" });
    }
    if (!lotteryRaw) { return res.status(400).json({ ok: false, error: "lottery obrigatório" }); }
    if (!lottery) { return res.status(400).json({ ok: false, error: "lottery inválida: " + lotteryRaw }); }

    // ✅ HARD GUARD: bloqueia datas futuras (fuso Brasil)
    if (isFutureISODate(date)) {
      const todayBR = todayYMDInSaoPaulo();
      return res.json({
        ok: true,
        date,
        lottery,
        strict,
        includePrizes,
        limitDocs,
        dayStatus: "",
        blocked: true,
        blockedReason: "future_date",
        todayBR,
        count: 0,
        draws: [],
        slots: [],
      });
    }

    // lê day_status (hint) — MAS vamos confirmar no Firestore antes de bloquear
    const dayStatusMap = readDayStatusMap(lottery, { reload: reloadDayStatus });
    const dayStatus = String(dayStatusMap?.[date] || "").trim();

    const db = getDb();

    // Query mínima: SOMENTE date (evita índice composto)
    const snap = await db.collection("draws").where("date", "==", date).get();

    // filtra lottery em memória, sem bater prizes ainda
    const docsAll = snap.docs.filter((doc) => {
      const d = doc.data() || {};
      return upTrim(d.lottery_key) === lotteryKey;
    });

    // Se day_status mandar bloquear, confirma:
    if (dayStatus && shouldBlockDayStatus(dayStatus, strict)) {
      if (!docsAll.length) {
        return res.json({
          ok: true,
          date,
          lottery,
          strict,
          includePrizes,
          limitDocs,
          dayStatus,
          blocked: true,
          blockedReason: "day_status_confirmed_no_docs",
          count: 0,
          draws: [],
          slots: [],
        });
      }
      // existe dado real -> segue o fluxo normal
    }

    // Guard rail
    const docsFound = docsAll.length;
    const docs = docsAll.slice(0, limitDocs);
    const docsCapped = docs.length !== docsFound;

    // Esperado (universo) do dia — hard + soft (BASE schedule)
    const include09FromDefault = "2024-01-05";
    const expectedBase = getExpectedForDate(lottery, date, include09FromDefault);

    const baseHard = expectedBase?.hard || [];
    const baseSoft = expectedBase?.soft || [];

    // ✅ CAP do dia atual
    const todayBR = todayYMDInSaoPaulo();
    const isToday = date === todayBR;
    const nowMinBR = nowMinutesInSaoPaulo();

    // DEBUG CAP TODAY
    try {
      const dbg18 = isSlotPublishedToday("18", nowMinBR, slotGraceMin);
      const dbg21 = isSlotPublishedToday("21", nowMinBR, slotGraceMin);
      console.log("[pitaco/results][capToday]", {
        date,
        todayBR,
        isToday,
        nowMinBR,
        slotGraceMin,
        dbg18,
        dbg21,
      });
    } catch (e) {
      console.log("[pitaco/results][capToday] debug error", e?.message || e);
    }

    // GAPS (source gaps)
    const gaps = getGapsForDate(lottery, date, { reload: reloadGaps });
    const removedHardSet = new Set(gaps.removedHard || []);
    const removedSoftSet = new Set(gaps.removedSoft || []);

    // universo para exibir (mantém slots do schedule mesmo se gap)
    const scheduleAll = uniqSorted([...baseHard, ...baseSoft]);

    // esperado "válido" (depois de remover gaps)
    const expectedHard = setDiff(baseHard, removedHardSet);
    const expectedSoft = setDiff(baseSoft, removedSoftSet);
    const expectedAll = uniqSorted([...expectedHard, ...expectedSoft]);

    // somente slots que já deveriam ter sido publicados hoje
    const expectedHardPublished =
      capToday && isToday
        ? expectedHard.filter((hh) => isSlotPublishedToday(hh, nowMinBR, slotGraceMin))
        : expectedHard;

    const expectedSoftPublished =
      capToday && isToday
        ? expectedSoft.filter((hh) => isSlotPublishedToday(hh, nowMinBR, slotGraceMin))
        : expectedSoft;

    // contagens removidas (somente se estavam no schedule base)
    const removedHardApplied = intersectToSet(baseHard, removedHardSet);
    const removedSoftApplied = intersectToSet(baseSoft, removedSoftSet);

    // Se não incluir prizes, devolve só os docs + slots
    if (!includePrizes) {
      const drawsNoPrizes = docs.map((doc) => {
        const d = doc.data() || {};
        return {
          id: doc.id,
          ...d,
          close_hour: normalizeHHMM(d.close_hour),
          prizesCount:
            typeof d.prizesCount !== "undefined" ? d.prizesCount : undefined,
        };
      });

      drawsNoPrizes.sort((a, b) => cmpHHMM(a.close_hour, b.close_hour));

      // mapa hour -> draw
      const byHour = new Map();
      for (const dr of drawsNoPrizes) {
        const hh = hourFromCloseHour(dr?.close_hour);
        if (!hh) continue;
        const prev = byHour.get(hh);
        if (!prev) {
          byHour.set(hh, dr);
        } else {
          const a = String(prev.close_hour || "");
          const b = String(dr.close_hour || "");
          if (b && (!a || b < a)) byHour.set(hh, dr);
        }
      }

      const presentHours = uniqSorted(Array.from(byHour.keys()));

      const slots = buildSlots({
        scheduleAll,
        byHour,
        baseSoft,
        removedHardApplied,
        removedSoftApplied,
        expectedHard,
        expectedSoft,
        expectedHardPublished,
        expectedSoftPublished,
        capToday,
        isToday,
        nowMinBR,
        slotGraceMin,
      });

      const slotsSummary = {
        mode: expectedBase?.mode || "none",
        scheduleFile: !!expectedBase?.scheduleFile,

        scheduleHard: baseHard.length,
        scheduleSoft: baseSoft.length,
        scheduleAll: scheduleAll.length,

        expectedHard: expectedHard.length,
        expectedSoft: expectedSoft.length,
        expectedAll: expectedAll.length,

        presentHours: presentHours.length,

        removedHard: removedHardApplied.size,
        removedSoft: removedSoftApplied.size,

        missingHard: slots.filter((s) => s.status === "missing").length,
        missingSoft: slots.filter((s) => s.status === "soft_missing").length,
      };

      return res.json({
        ok: true,
        date,
        lottery,
        strict,
        includePrizes,
        limitDocs,
        docsFound,
        docsCapped,
        dayStatus,
        blocked: false,

        // legado
        count: drawsNoPrizes.length,
        draws: drawsNoPrizes,

        // novo
        expectedHard,
        expectedSoft,
        presentHours,
        slotsSummary,
        slots,
      });
    }

    // carrega prizes com concorrência limitada
    const draws = await mapWithConcurrency(docs, 6, async (doc) => {
      const d = doc.data() || {};

      const prizesSnap = await doc.ref
        .collection("prizes")
        .orderBy("position", "asc")
        .get();

      return {
        id: doc.id,
        ...d,
        close_hour: normalizeHHMM(d.close_hour),
        prizes: prizesSnap.docs.map((p) => p.data()),
      };
    });

    draws.sort((a, b) => cmpHHMM(a.close_hour, b.close_hour));

    // mapa hour -> draw
    const byHour = new Map();
    for (const dr of draws) {
      const hh = hourFromCloseHour(dr?.close_hour);
      if (!hh) continue;
      const prev = byHour.get(hh);
      if (!prev) {
        byHour.set(hh, dr);
      } else {
        const a = String(prev.close_hour || "");
        const b = String(dr.close_hour || "");
        if (b && (!a || b < a)) byHour.set(hh, dr);
      }
    }

    const presentHours = uniqSorted(Array.from(byHour.keys()));

    const slots = buildSlots({
      scheduleAll,
      byHour,
      baseSoft,
      removedHardApplied,
      removedSoftApplied,
      expectedHard,
      expectedSoft,
      expectedHardPublished,
      expectedSoftPublished,
      capToday,
      isToday,
      nowMinBR,
      slotGraceMin,
    });

    const slotsSummary = {
      mode: expectedBase?.mode || "none",
      scheduleFile: !!expectedBase?.scheduleFile,

      scheduleHard: baseHard.length,
      scheduleSoft: baseSoft.length,
      scheduleAll: scheduleAll.length,

      expectedHard: expectedHard.length,
      expectedSoft: expectedSoft.length,
      expectedAll: expectedAll.length,

      presentHours: presentHours.length,

      removedHard: removedHardApplied.size,
      removedSoft: removedSoftApplied.size,

      missingHard: slots.filter((s) => s.status === "missing").length,
      missingSoft: slots.filter((s) => s.status === "soft_missing").length,
    };

    return res.json({
      ok: true,
      date,
      lottery,
      strict,
      includePrizes,
      limitDocs,
      docsFound,
      docsCapped,
      dayStatus,
      blocked: false,

      // legado
      count: draws.length,
      draws,

      // novo
      expectedHard,
      expectedSoft,
      presentHours,
      slotsSummary,
      slots,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "erro" });
  }
});

module.exports = router;





