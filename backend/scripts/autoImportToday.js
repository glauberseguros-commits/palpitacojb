"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");

/* =========================
   DOW seguro para YYYY-MM-DD (independe de timezone)
   - calcula como UTC do próprio dia
========================= */
function dowFromYMD(dateYMD) {
  const m = String(dateYMD || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(dateYMD).getDay(); // fallback
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo, d)).getUTCDay();
}

const { runImport } = require("./importKingApostas");

// ✅ LOTTERY parametrizável por env (default PT_RIO)
const LOTTERY = String(process.env.LOTTERY || "PT_RIO").trim().toUpperCase() || "PT_RIO";

const LOG_DIR = path.join(__dirname, "..", "logs");

// Logs (por loteria para não misturar)
const LOG_FILE = path.join(LOG_DIR, `autoImportToday-${LOTTERY}.log`);

// Lock para evitar concorrência (por loteria)
const LOCK_FILE = path.join(LOG_DIR, `autoImport-${LOTTERY}.lock`);

// TTL do lock (ambientes locais). Em GitHub Actions, o workspace é isolado por execução.
const LOCK_TTL_MS = 90 * 1000; // 1m30s

// Auditoria: thresholds (minutos)
const WARN_AFTER_MIN = Number(process.env.AUDIT_WARN_MIN || 20);
const CRIT_AFTER_MIN = Number(process.env.AUDIT_CRIT_MIN || 60);
const FAIL_ON_CRITICAL = String(process.env.FAIL_ON_CRITICAL || "0").trim() === "1";

// ✅ Limite de catch-up pós-janela (minutos após windowEnd)
// Default 90 (reduz spam em cron fora da janela)
const CATCHUP_MAX_AFTER_END_MIN = Number(process.env.CATCHUP_MAX_AFTER_END_MIN || 90);

// ✅ PROBE/SOFT da FEDERAL: limite de tentativas por slot/dia (anti-spam)
// default 2 (tenta 2 ticks e para, mesmo que o cron rode mais vezes)
const FEDERAL_SOFT_MAX_TRIES_PER_DAY = Number(process.env.FEDERAL_SOFT_MAX_TRIES_PER_DAY || 2);

/**
 * ✅ Base URL do backend (pra ler dayStatus sem duplicar regra)
 * - Local default: http://127.0.0.1:3333
 * - Override: PITACO_API_BASE="https://seu-dominio"
 */
let PITACO_API_BASE = String(process.env.PITACO_API_BASE || "http://127.0.0.1:3333").trim();

// ✅ hardening: se vier "localhost:3334" (ou 3333 errado), cai automaticamente pro backend local padrão
try {
  const u = new URL(PITACO_API_BASE);
  const host = String(u.hostname || "").toLowerCase();
  const port = String(u.port || "");
  if ((host === "localhost" || host === "127.0.0.1") && port === "3334") {
    PITACO_API_BASE = "http://127.0.0.1:3333";
  }
} catch {}

// ✅ log da base efetiva (ajuda a detectar env poluído)
try {
  const eff = PITACO_API_BASE;
  if (!globalThis.__PITACO_API_BASE_LOGGED__) {
    globalThis.__PITACO_API_BASE_LOGGED__ = true;
    console.log(`[CFG] PITACO_API_BASE efetivo => ${eff}`);
  }
} catch {}

/**
 * ✅ Cache do DayStatus (evita bater no backend a cada tick do cron)
 * - Arquivo por (loteria+dia)
 * - TTL default: 10 min
 */
const DAYSTATUS_CACHE_TTL_SEC = Number(process.env.DAYSTATUS_CACHE_TTL_SEC || 600);

function dayStatusCacheFile(dateYMD) {
  return path.join(LOG_DIR, `dayStatusCache-${LOTTERY}-${dateYMD}.json`);
}

function readJsonSafeFile(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonSafeFile(p, obj) {
  try {
    ensureLogDir();
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, p);
  } catch {}
}

async function fetchDayStatusCached({ date, lottery }) {
  const f = dayStatusCacheFile(date);
  const nowMs = Date.now();
  const cached = readJsonSafeFile(f);

  if (cached && cached.atMs && nowMs - Number(cached.atMs) < DAYSTATUS_CACHE_TTL_SEC * 1000) {
    return cached.value || null;
  }

  const value = await fetchDayStatusFromBackend({ date, lottery });
  writeJsonSafeFile(f, { atMs: nowMs, iso: new Date().toISOString(), value });
  return value;
}

/* =========================
   Schedules (por loteria)
========================= */
const SCHEDULES = {
  PT_RIO: [
    { hour: "09:00", windowStart: "09:05", releaseAt: "09:29", windowEnd: "09:35" },
    { hour: "11:00", windowStart: "11:05", releaseAt: "11:29", windowEnd: "11:35" },
    { hour: "14:00", windowStart: "14:05", releaseAt: "14:29", windowEnd: "14:35" },
    { hour: "16:00", windowStart: "16:05", releaseAt: "16:29", windowEnd: "16:35" },
    { hour: "18:00", windowStart: "18:05", releaseAt: "18:29", windowEnd: "18:35" },
    // 21h: janela longa
    { hour: "21:00", windowStart: "21:05", releaseAt: "21:05", windowEnd: "21:45" },
  ],

  // FEDERAL
  // - 19:00 = PROBE (SOFT)
  // - 20:00 = HARD (padrão)
  FEDERAL: [
    { hour: "19:00", windowStart: "18:50", releaseAt: "19:00", windowEnd: "19:20" }, // PROBE (SOFT)
    { hour: "20:00", windowStart: "19:50", releaseAt: "20:00", windowEnd: "20:20" }, // HARD
  ],
};

const SCHEDULE = Array.isArray(SCHEDULES[LOTTERY]) ? SCHEDULES[LOTTERY] : SCHEDULES.PT_RIO;

/* =========================
   Utils
========================= */
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function tsLocal() {
  try {
    const fmt = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return fmt.format(new Date()).replace(",", "");
  } catch {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }
}

function logLine(msg, level = "INFO") {
  ensureLogDir();
  const line = `[${tsLocal()}] [${level}] [${LOTTERY}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
  if (level === "ERROR") console.error(msg);
  else console.log(msg);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function todayYMDInSaoPaulo() {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
}

function nowHMInSaoPaulo() {
  // ✅ Override para testes (sem mexer no relógio do sistema)
  const ov = String(process.env.NOW_HM || "").trim();
  const mOv = ov.match(/^(\d{2}):(\d{2})$/);
  if (mOv) {
    const h = Number(mOv[1]);
    const m = Number(mOv[2]);
    if (Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { h, m };
    }
  }

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(new Date())
      .split(":");
    return { h: Number(parts[0]), m: Number(parts[1]) };
  } catch {
    const d = new Date();
    return { h: d.getHours(), m: d.getMinutes() };
  }
}

function isNowHmOverrideActive() {
  const ov = String(process.env.NOW_HM || "").trim();
  return /^\d{2}:\d{2}$/.test(ov);
}

function isFutureISODate(ymd) {
  if (!isISODate(ymd)) return false;
  const todayBR = todayYMDInSaoPaulo();
  return String(ymd) > String(todayBR);
}

function toMin(h, m) {
  return Number(h) * 60 + Number(m);
}

function parseHHMM(hhmm) {
  const s = String(hhmm || "").trim();
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

function parseHH(hhmm) {
  const h = Number(String(hhmm).slice(0, 2));
  const m = Number(String(hhmm).slice(3, 5));
  return { h, m };
}

function stateFile(date) {
  return path.join(LOG_DIR, `autoImportState-${LOTTERY}-${date}.json`);
}

function defaultState() {
  const init = {};
  for (const s of SCHEDULE) {
    init[s.hour] = {
      done: false,
      tries: 0,
      lastTryISO: null,
      lastResult: null,
      lastTriedCloses: null,
      na: false,
      naReason: null,
      alertMissedWindow: false,
      alertCritical: false,
    };
  }
  return init;
}

function safeWriteJson(filePath, obj) {
  ensureLogDir();
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, filePath);
}

function loadState(date) {
  const f = stateFile(date);
  if (!fs.existsSync(f)) {
    const init = defaultState();
    safeWriteJson(f, init);
    return init;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    const init = defaultState();
    safeWriteJson(f, init);
    return init;
  }

  const migrated = defaultState();
  for (const s of SCHEDULE) {
    const v = parsed?.[s.hour];

    if (typeof v === "boolean") {
      migrated[s.hour].done = v;
      continue;
    }

    if (v && typeof v === "object") {
      migrated[s.hour] = {
        ...migrated[s.hour],
        done: Boolean(v.done),
        tries: Number.isFinite(Number(v.tries)) ? Number(v.tries) : 0,
        lastTryISO: typeof v.lastTryISO === "string" ? v.lastTryISO : null,
        lastResult: v.lastResult ?? null,
        lastTriedCloses: Array.isArray(v.lastTriedCloses) ? v.lastTriedCloses : null,
        na: Boolean(v.na),
        naReason: typeof v.naReason === "string" ? v.naReason : null,
        alertMissedWindow: Boolean(v.alertMissedWindow),
        alertCritical: Boolean(v.alertCritical),
      };
    }
  }

  return migrated;
}

function saveState(date, state) {
  safeWriteJson(stateFile(date), state);
}

function isAllDoneHardOnly(state, statusMap) {
  let hardCount = 0;

  for (const sched of SCHEDULE) {
    const st = statusMap.get(sched.hour) || "OFF";
    if (st !== "HARD") continue;

    hardCount += 1;
    if (!state[sched.hour] || state[sched.hour].done !== true) {
      return false;
    }
  }

  if (hardCount === 0) return false;
  return true;
}

/**
 * Gera closes candidatos (tolerância de minutos)
 */
function closeCandidates(hhmm) {
  const parsed = parseHH(hhmm);
  if (!parsed) return [];
  const { h } = parsed;

  const out = new Set();
  const bases = [0, 9];
  const deltas = [0, 1, 2];

  for (const base of bases) {
    for (const d of deltas) {
      const mm = base + d;
      if (mm >= 0 && mm <= 59) out.add(`${pad2(h)}:${pad2(mm)}`);
    }
  }
  return Array.from(out);
}

/* =========================
   FEDERAL PROBE: valida se o resultado pertence ao horário do slot
   - usa targetDrawIds no formato: FEDERAL__YYYY-MM-DD__20-00__uuid
========================= */
function slotHourKey(slotHHMM) {
  const hh = String(slotHHMM || "").slice(0, 2);
  const mm = String(slotHHMM || "").slice(3, 5);
  if (!/^\d{2}$/.test(hh) || !/^\d{2}$/.test(mm)) return "";
  return hh + "-" + mm; // ex: "19-00"
}

function resultMatchesSlotHour(r, slotHHMM) {
  const key = slotHourKey(slotHHMM);
  if (!key) return true; // se não dá pra inferir, não bloqueia
  const ids = Array.isArray(r && r.targetDrawIds) ? r.targetDrawIds.map(String) : [];
  if (ids.length === 0) return true; // sem id, não bloqueia
  return ids.some((id) => String(id).includes("__" + key + "__"));
}

/* =========================
   Regras de aplicabilidade
========================= */
function buildTodaySlotStatusMapPT_RIO(dateYMD, dow) {
  const map = new Map();

  const isSunday = dow === 0;
  const isWed = dow === 3;
  const isSat = dow === 6;

  for (const sched of SCHEDULE) {
    const hh = sched.hour;

    if (isSunday) {
      if (hh === "18:00" || hh === "21:00") map.set(hh, "OFF");
      else map.set(hh, "HARD");
      continue;
    }

    if (isWed || isSat) {
      if (hh === "18:00") map.set(hh, "SOFT");
      else map.set(hh, "HARD");
      continue;
    }

    map.set(hh, "HARD");
  }

  if (isSunday) {
    logLine(`[CAL] PT_RIO domingo: date=${dateYMD} dow=${dow} => HARD=[09,11,14,16] OFF=[18,21]`, "INFO");
  } else if (isWed || isSat) {
    logLine(`[CAL] PT_RIO qua/sab: date=${dateYMD} dow=${dow} => HARD=[09,11,14,16,21] SOFT=[18]`, "INFO");
  } else {
    logLine(`[CAL] PT_RIO seg-sex: date=${dateYMD} dow=${dow} => HARD=[09,11,14,16,18,21]`, "INFO");
  }

  return map;
}

/**
 * FEDERAL (robusto / independente de expectedHard do backend):
 * - domingo: OFF
 * - demais dias: 19:00 = SOFT (PROBE), 20:00 = HARD (padrão)
 * Obs: ainda logamos expectedHard/expectedSoft como debug, mas não usamos como "fonte da verdade".
 */
function buildTodaySlotStatusMapFEDERAL({ dateYMD, dow, ds }) {
  const map = new Map();
  const isSunday = dow === 0;

  const expectedHard = Array.isArray(ds?.expectedHard) ? ds.expectedHard.map(String) : [];
  const expectedSoft = Array.isArray(ds?.expectedSoft) ? ds.expectedSoft.map(String) : [];

  for (const sched of SCHEDULE) {
    if (isSunday) {
      map.set(sched.hour, "OFF");
      continue;
    }

    if (sched.hour === "19:00") {
      map.set(sched.hour, "SOFT");
      continue;
    }

    if (sched.hour === "20:00") {
      map.set(sched.hour, "HARD");
      continue;
    }

    // fallback (caso adicionem mais slots no futuro)
    map.set(sched.hour, "SOFT");
  }

  logLine(
    `[CAL] FEDERAL fixed: date=${dateYMD} dow=${dow} => 19:SOFT(PROBE) 20:HARD | backend expectedHard=[${expectedHard.join(
      ","
    )}] expectedSoft=[${expectedSoft.join(",")}]`,
    "INFO"
  );

  return map;
}

function slotWindow(schedule) {
  const ws = parseHHMM(schedule.windowStart);
  const ra = parseHHMM(schedule.releaseAt);
  const we = parseHHMM(schedule.windowEnd);

  if (!ws || !ra || !we) {
    const { h } = parseHH(schedule.hour);
    return {
      start: toMin(h, 5),
      release: toMin(h, 29),
      end: toMin(h, 31),
      startLabel: `${pad2(h)}:05`,
      releaseLabel: `${pad2(h)}:29`,
      endLabel: `${pad2(h)}:31`,
    };
  }

  const start = toMin(ws.h, ws.m);
  const release = toMin(ra.h, ra.m);
  const end = toMin(we.h, we.m);

  return {
    start,
    release,
    end,
    startLabel: schedule.windowStart,
    releaseLabel: schedule.releaseAt,
    endLabel: schedule.windowEnd,
  };
}

/* =========================
   Lock (anti-concorrência)
========================= */
function acquireLock() {
  ensureLogDir();

  if (fs.existsSync(LOCK_FILE)) {
    try {
      const st = fs.statSync(LOCK_FILE);
      const age = Date.now() - st.mtimeMs;
      if (age < LOCK_TTL_MS) return { ok: false, reason: "LOCK_ATIVO" };
      fs.unlinkSync(LOCK_FILE);
    } catch {
      return { ok: false, reason: "LOCK_INACESSIVEL" };
    }
  }

  try {
    fs.writeFileSync(
      LOCK_FILE,
      JSON.stringify({ pid: process.pid, at: new Date().toISOString(), lottery: LOTTERY }, null, 2)
    );
    return { ok: true };
  } catch {
    return { ok: false, reason: "NAO_FOI_POSSIVEL_CRIAR_LOCK" };
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch {}
}

/* =========================
   DayStatus guard + agenda dinâmica
========================= */
async function fetchDayStatusFromBackend({ date, lottery }) {
  try {
    const base = PITACO_API_BASE.replace(/\/+$/, "");
    const u = `${base}/api/pitaco/results?date=${encodeURIComponent(String(date || "").trim())}&lottery=${encodeURIComponent(
      String(lottery || "").trim()
    )}`;

    const res = await axios.get(u, {
      timeout: 15000,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { "User-Agent": "palpitaco-autoImportToday" },
    });

    const j = res && res.data ? res.data : null;
    if (!j || typeof j !== "object") return null;

    return {
      ok: Boolean(j.ok),
      dayStatus: String(j.dayStatus || "").trim(),
      blocked: Boolean(j.blocked),
      blockedReason: String(j.blockedReason || "").trim(),
      count: Number.isFinite(Number(j.count)) ? Number(j.count) : null,

      // ✅ debug (não é fonte da verdade pro FEDERAL fixed)
      expectedHard: Array.isArray(j.expectedHard) ? j.expectedHard.map(String) : [],
      expectedSoft: Array.isArray(j.expectedSoft) ? j.expectedSoft.map(String) : [],
      presentHours: Array.isArray(j.presentHours) ? j.presentHours.map(String) : [],

      // debug útil
      slotsSummary: j.slotsSummary ?? null,
      slots: Array.isArray(j.slots) ? j.slots : [],
    };
  } catch {
    return null;
  }
}

function applyHolidayNoDrawToState({ state, statusMap, isoNow }) {
  let touched = 0;

  for (const sched of SCHEDULE) {
    let slot = state?.[sched.hour];

    if (!slot) {
      slot = { hour: sched.hour, done: false, na: false, tries: 0 };
      state[sched.hour] = slot;
    }

    const st = statusMap.get(sched.hour) || "OFF";
    const applies = st === "HARD" || st === "SOFT";
    if (!applies) continue;

    if (slot.done && slot.na && slot.naReason === "HOLIDAY_NO_DRAW") continue;

    slot.done = true;
    slot.na = true;
    slot.naReason = "HOLIDAY_NO_DRAW";
    slot.lastTryISO = isoNow;
    slot.lastResult = { ok: true, skipped: true, reason: "HOLIDAY_NO_DRAW" };
    touched += 1;
  }

  return touched;
}

/* =========================
   Verificação de persistência (BIRTH-GUARD)
   (mantido como no seu arquivo)
========================= */
const VERIFY_PERSISTED = String(process.env.VERIFY_PERSISTED || "1").trim() === "1";

function missingSlotsMonthFile(dateYMD) {
  const ym = String(dateYMD || "").slice(0, 7);
  return path.join(LOG_DIR, `missingSlots-${LOTTERY}-${ym}.json`);
}

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function upsertMissingSlot({ date, slotHour, calendar, closeHourTried, reason, meta }) {
  ensureLogDir();
  const file = missingSlotsMonthFile(date);
  const j =
    readJsonSafe(file) || {
      ok: true,
      lottery: LOTTERY,
      month: String(date).slice(0, 7),
      items: {},
    };

  const key = `${date}::${slotHour}`;
  if (!j.items || typeof j.items !== "object") j.items = {};

  const prev = j.items[key] && typeof j.items[key] === "object" ? j.items[key] : null;
  const now = new Date().toISOString();

  j.items[key] = {
    date,
    slotHour,
    calendar: calendar || null,
    closeHourTried: closeHourTried || null,
    firstSeenISO: prev?.firstSeenISO || now,
    lastSeenISO: now,
    hits: (prev?.hits || 0) + 1,
    reason: reason || "NOT_PERSISTED",
    meta: meta || null,
  };

  safeWriteJson(file, j);
  return file;
}

function hhFromSlotHHMM(slotHHMM) {
  const s = String(slotHHMM || "").trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s.slice(0, 2);
  if (/^\d{2}$/.test(s)) return s;
  return "";
}

function drawLooksLikeSlot(draw, slotHH) {
  const hh = hhFromSlotHHMM(slotHH);
  if (!hh) return false;

  const v =
    (draw &&
      (draw.close_hour ||
        draw.closeHour ||
        draw.close ||
        draw.hour ||
        draw.slot ||
        draw.time ||
        draw.close_hour_raw)) ??
    "";
  const s = String(v).trim();

  if (s.startsWith(hh)) return true;
  if (s.startsWith(`${hh}:`)) return true;
  if (s === hh) return true;
  if (s === `${hh}h`) return true;

  return false;
}

async function verifySlotPersistedViaBackend({ date, slotHHMM }) {
  try {
    const base = PITACO_API_BASE.replace(/\/+$/, "");
    const u = `${base}/api/pitaco/results?date=${encodeURIComponent(date)}&lottery=${encodeURIComponent(LOTTERY)}`;

    const res = await axios.get(u, {
      timeout: 15000,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { "User-Agent": "palpitaco-autoImportToday" },
    });

    const j = res && res.data ? res.data : null;
    if (!j || typeof j !== "object") return { ok: false, reason: "BAD_JSON" };

    const draws = Array.isArray(j.draws) ? j.draws : [];
    const foundInDraws = draws.some((d) => drawLooksLikeSlot(d, slotHHMM));
    if (foundInDraws) return { ok: true, where: "draws", drawsCount: draws.length };

    const slots = Array.isArray(j.slots) ? j.slots : [];
    const hh = hhFromSlotHHMM(slotHHMM);

    const foundInSlots = slots.some((s) => {
      const v = (s && (s.hour || s.close_hour || s.closeHour || s.close || s.slot || s.time || s.close_hour_raw)) ?? "";
      const t = String(v).trim();
      return t.startsWith(hh);
    });

    if (foundInSlots) return { ok: true, where: "slots", slotsCount: slots.length };

    return { ok: false, reason: "NOT_FOUND", drawsCount: draws.length, slotsCount: slots.length };
  } catch (e) {
    const code = e?.code || e?.cause?.code || "";
    const msg = e?.message || e?.cause?.message || String(e);
    const r = code ? `${code}:${msg}` : msg;
    return { ok: false, reason: `EX:${r}` };
  }
}

async function guardPersistedOrCritical({ date, slotHHMM, calendar, closeHourTried, meta }) {
  if (!VERIFY_PERSISTED) return { ok: true, skipped: true };

  if (meta && (meta.mode === "ALREADY_COMPLETE" || meta.mode === "NO_DRAW")) {
    return { ok: true, skipped: true, reason: `SKIP_${meta.mode}` };
  }

  if (meta && meta.mode === "CAPTURE_WRITE") {
    const sc = Number.isFinite(Number(meta.savedCount)) ? Number(meta.savedCount) : 0;
    const wc = Number.isFinite(Number(meta.writeCount)) ? Number(meta.writeCount) : 0;
    if (sc > 0 || wc > 0) {
      return { ok: true, verified: true, where: "import_return", skippedBackend: true };
    }
  }

  const v = await verifySlotPersistedViaBackend({ date, slotHHMM });
  if (v.ok) return { ok: true, verified: true, where: v.where };

  const file = upsertMissingSlot({
    date,
    slotHour: slotHHMM,
    calendar,
    closeHourTried,
    reason: v.reason || "NOT_PERSISTED",
    meta: { verify: v, ...(meta || {}) },
  });

  logLine(
    `[BIRTH-GUARD] CRITICAL slot=${slotHHMM} date=${date} calendar=${calendar || "—"} closeTried=${closeHourTried || "—"} reason=${
      v.reason || "NOT_PERSISTED"
    } file=${path.basename(file)}`,
    "ERROR"
  );

  if (FAIL_ON_CRITICAL) process.exitCode = 2;

  return { ok: false, verified: false, reason: v.reason || "NOT_PERSISTED", file };
}

/* =========================
   Auditoria de Furos (warning/critical)
========================= */
function auditOutFile(dateYMD) {
  return path.join(LOG_DIR, `auditCritical-${LOTTERY}-${dateYMD}.json`);
}

function buildAuditReport({ date, nowMin, isoNow, dow, statusMap, state }) {
  const todayBR = todayYMDInSaoPaulo();
  const critical = [];
  const warning = [];
  const softLate = [];

  for (const sched of SCHEDULE) {
    const slotState = state?.[sched.hour];
    if (!slotState) continue;

    const st = statusMap.get(sched.hour) || "OFF";
    const isHard = st === "HARD";
    const isSoft = st === "SOFT";
    const applies = isHard || isSoft;
    if (!applies) continue;

    if (slotState.na) continue;
    if (slotState.done) continue;

    const w = slotWindow(sched);

    if (nowMin < w.release) continue;
    const since = nowMin - w.release;

    const item = {
      slot: sched.hour,
      calendar: st,
      rule: "window",
      releaseAt: w.releaseLabel,
      windowEnd: w.endLabel,
      sinceMinutes: since,
      tries: Number(slotState.tries || 0),
      lastTryISO: slotState.lastTryISO || null,
      lastResult: slotState.lastResult || null,
    };

    if (isSoft) {
      if (since >= WARN_AFTER_MIN) softLate.push(item);
      continue;
    }

    if (since >= CRIT_AFTER_MIN) critical.push(item);
    else if (since >= WARN_AFTER_MIN) warning.push(item);
  }

  let status = "ok";
  if (critical.length) status = "critical";
  else if (warning.length) status = "warning";

  return {
    ok: true,
    lottery: LOTTERY,
    date,
    todayBR,
    isoNow,
    dow,
    thresholds: { warnAfterMin: WARN_AFTER_MIN, critAfterMin: CRIT_AFTER_MIN },
    status,
    criticalCount: critical.length,
    warningCount: warning.length,
    softLateCount: softLate.length,
    critical,
    warning,
    softLate,
  };
}

/* =========================
   ALERTAS (HARD) anti-spam
========================= */
function emitHardAlertsIfNeeded({ date, nowMin, state, statusMap }) {
  let touched = false;

  for (const sched of SCHEDULE) {
    let slot = state?.[sched.hour];

    if (!slot) {
      slot = { hour: sched.hour, done: false, na: false, tries: 0 };
      state[sched.hour] = slot;
    }

    if (slot.done || slot.na) continue;

    const st = statusMap.get(sched.hour) || "OFF";
    if (st !== "HARD") continue;

    const w = slotWindow(sched);
    if (nowMin < w.release) continue;

    const since = nowMin - w.release;

    if (nowMin > w.end && !slot.alertMissedWindow) {
      slot.alertMissedWindow = true;
      touched = true;
      logLine(
        `[ALERT] HARD slot perdeu janela: date=${date} slot=${sched.hour} releaseAt=${w.releaseLabel} windowEnd=${w.endLabel} tries=${slot.tries || 0}`,
        "ERROR"
      );
    }

    if (since >= CRIT_AFTER_MIN && !slot.alertCritical) {
      slot.alertCritical = true;
      touched = true;
      logLine(
        `[ALERT] HARD slot CRITICAL: date=${date} slot=${sched.hour} since=${since}min (>=${CRIT_AFTER_MIN}) tries=${slot.tries || 0}`,
        "ERROR"
      );
    }
  }

  return touched;
}

/* =========================
   Main
========================= */
async function main() {
  const envDate = String(process.env.DATE || "").trim();
  const date = envDate && isISODate(envDate) ? envDate : todayYMDInSaoPaulo();

  if (isFutureISODate(date)) {
    const todayBR = todayYMDInSaoPaulo();
    logLine(`[GUARD] FUTURE_DATE_BLOCKED date=${date} todayBR=${todayBR} (não vamos importar)`, "ERROR");
    process.exit(2);
    return;
  }

  const now = nowHMInSaoPaulo();
  const nowMin = toMin(now.h, now.m);

  if (String(process.env.NOW_HM || "").trim()) {
    logLine(`[TIME] NOW_HM override ativo => ${pad2(now.h)}:${pad2(now.m)} (America/Sao_Paulo)`, "INFO");
  }

  const dow = dowFromYMD(date);
  const catchupTried = new Set();

  const lock = acquireLock();
  if (!lock.ok) {
    logLine(`[AUTO] abortado: ${lock.reason}`, "INFO");
    return;
  }

  try {
    const state = loadState(date);
    const isoNow = new Date().toISOString();

    // ✅ Buscar DS cedo (cache)
    const ds = await fetchDayStatusCached({ date, lottery: LOTTERY });

    let statusMap = null;
    if (LOTTERY === "PT_RIO") {
      statusMap = buildTodaySlotStatusMapPT_RIO(date, dow);
    } else if (LOTTERY === "FEDERAL") {
      statusMap = buildTodaySlotStatusMapFEDERAL({ dateYMD: date, dow, ds });
    } else {
      statusMap = new Map();
      for (const sched of SCHEDULE) statusMap.set(sched.hour, "HARD");
    }

    // ✅ Se o dia já está completo, gera audit e encerra
    if (isAllDoneHardOnly(state, statusMap)) {
      try {
        const report = buildAuditReport({ date, nowMin, isoNow: new Date().toISOString(), dow, statusMap, state });
        if (isNowHmOverrideActive()) {
          report.status = "ok";
          report.note = "NOW_HM override ativo: audit retroativo neutralizado (informativo).";
        }
        safeWriteJson(auditOutFile(date), report);
      } catch {}
      logLine(`[AUTO] DIA COMPLETO (${date}) — slots concluídos (skip import)`, "INFO");
      return;
    }

    // 1) Marca N/A slots OFF
    let stateTouched = false;
    for (const sched of SCHEDULE) {
      const slot = state[sched.hour];
      if (!slot) continue;

      const st = statusMap.get(sched.hour) || "OFF";
      const applies = st === "HARD" || st === "SOFT";

      if (!applies && !slot.done) {
        slot.done = true;
        slot.na = true;
        slot.naReason = LOTTERY === "FEDERAL" && dow === 0 ? "FEDERAL_DOMINGO_OFF" : "NAO_APLICA";
        slot.lastTryISO = isoNow;
        slot.lastResult = { ok: true, skipped: true, reason: slot.naReason };
        stateTouched = true;
        logLine(`[AUTO] N/A slot=${sched.hour} (${slot.naReason}) -> DONE`, "INFO");
      }
    }
    if (stateTouched) saveState(date, state);

    // 1.5) DayStatus guard: feriado sem sorteio
    if (ds && ds.blocked && String(ds.dayStatus || "") === "holiday_no_draw") {
      const touched = applyHolidayNoDrawToState({ state, statusMap, isoNow });
      if (touched > 0) saveState(date, state);

      try {
        const report = buildAuditReport({ date, nowMin, isoNow: new Date().toISOString(), dow, statusMap, state });
        safeWriteJson(auditOutFile(date), report);
      } catch {}

      logLine(
        `[DAY_STATUS] holiday_no_draw confirmado (blockedReason=${ds.blockedReason || "—"}). Slots aplicáveis -> N/A. Encerrando.`,
        "INFO"
      );
      return;
    }

    let didSomething = false;

    // 2) Processa slots aplicáveis (HARD/SOFT)
    for (const sched of SCHEDULE) {
      const slot = state[sched.hour];
      if (!slot) continue;
      if (slot.done) continue;

      const st = statusMap.get(sched.hour) || "OFF";
      const applies = st === "HARD" || st === "SOFT";
      if (!applies) continue;

      // ✅ anti-spam: PROBE/SOFT da FEDERAL para depois de N tentativas/dia
      if (LOTTERY === "FEDERAL" && st === "SOFT") {
        const tries = Number(slot.tries || 0);
        if (Number.isFinite(FEDERAL_SOFT_MAX_TRIES_PER_DAY) && FEDERAL_SOFT_MAX_TRIES_PER_DAY > 0) {
          if (tries >= FEDERAL_SOFT_MAX_TRIES_PER_DAY) {
            continue;
          }
        }
      }

      const w = slotWindow(sched);

      const inWindow = !(nowMin < w.start || nowMin > w.end);
      const afterRelease = nowMin >= w.start;

      if (!inWindow) {
        if (!afterRelease) continue;

        const extraCatchup = st === "SOFT" ? Math.max(CATCHUP_MAX_AFTER_END_MIN, 360) : CATCHUP_MAX_AFTER_END_MIN;
        const catchupLimit = w.end + extraCatchup;
        if (nowMin > catchupLimit) continue;

        const key = `${date}::${sched.hour}`;
        if (catchupTried.has(key)) continue;
        catchupTried.add(key);

        logLine(
          `[AUTO] CATCH-UP pós-release ${date} slot=${sched.hour} (${st}) releaseAt=${w.releaseLabel} window=${w.startLabel}~${w.endLabel} (fora da janela)`,
          "INFO"
        );
      }

      if (!afterRelease) continue;

      slot.tries = (slot.tries || 0) + 1;
      slot.lastTryISO = isoNow;

      const candidates = st === "SOFT" ? [sched.hour] : closeCandidates(sched.hour);
      slot.lastTriedCloses = candidates;
      saveState(date, state);

      logLine(
        `[AUTO] tentando ${date} slot=${sched.hour} (${st}) window=${w.startLabel}-${w.endLabel} closes=${candidates.join(",")}`,
        "INFO"
      );

      let lastErr = null;

      for (const closeHour of candidates) {
        let r = null;

        try {
          r = await runImport({ date, lotteryKey: LOTTERY, closeHour });
        } catch (e) {
          lastErr = e?.message || String(e);
          slot.lastResult = { ok: false, error: lastErr, closeHourTried: closeHour };
          saveState(date, state);
          logLine(`[AUTO] erro no import close=${closeHour}: ${lastErr}`, "ERROR");
          continue;
        }

        const blockedReason = String(r?.blockedReason || "").trim();

        if (
          r &&
          r.blocked === true &&
          (blockedReason === "no_draw_for_slot" || blockedReason === "no_draw_for_slot_calendar")
        ) {
          slot.lastResult = {
            ...(slot.lastResult || {}),
            ok: true,
            closeHourTried: closeHour,
            blocked: true,
            blockedReason,
            note: "no_draw_for_slot|no_draw_for_slot_calendar (will retry)",
          };
          saveState(date, state);

          logLine(`[AUTO] ${blockedReason} slot=${sched.hour} (${st}) -> mantendo PENDENTE p/ retry`, "INFO");
          didSomething = true;
          break;
        }

        if (r && r.blocked === true && blockedReason === "api_missing_slot") {
          slot.lastResult = {
            ...(slot.lastResult || {}),
            ok: true,
            closeHourTried: closeHour,
            blocked: true,
            blockedReason,
            note: "api_missing_slot (stop candidates; will retry later)",
          };
          saveState(date, state);

          logLine(
            `[AUTO] api_missing_slot slot=${sched.hour} (${st}) close=${closeHour} -> parando closes candidatos (vai retry depois)`,
            "INFO"
          );

          didSomething = true;
          break;
        }

        if (r && r.blocked === true && blockedReason === "future_date") {
          slot.lastResult = { ok: true, closeHourTried: closeHour, blocked: true, blockedReason };
          saveState(date, state);
          logLine(`[AUTO] future_date bloqueado pelo import (defensivo). date=${date} slot=${sched.hour}`, "ERROR");
          didSomething = true;
          break;
        }

        const savedCount = Number.isFinite(Number(r?.savedCount)) ? Number(r.savedCount) : 0;
        const writeCount = Number.isFinite(Number(r?.writeCount)) ? Number(r.writeCount) : 0;

        const alreadyCompleteAll = Boolean(r?.alreadyCompleteAll);
        const captured = Boolean(r?.captured);

        slot.lastResult = {
          ok: true,
          closeHourTried: closeHour,
          captured,
          alreadyCompleteAll,
          savedCount,
          writeCount,
          apiHasPrizes: r?.apiHasPrizes ?? null,
          targetDrawIds: r?.targetDrawIds ?? null,
          tookMs: r?.tookMs ?? null,
        };
        saveState(date, state);

        let doneByAlreadyComplete = alreadyCompleteAll === true;
        let doneByCaptureWrite = captured === true && (savedCount > 0 || writeCount > 0);

        // ✅ FEDERAL PROBE (SOFT): não marca DONE se o resultado não for do horário do slot
        if (LOTTERY === "FEDERAL" && st === "SOFT") {
          if (!resultMatchesSlotHour(r, sched.hour)) {
            doneByAlreadyComplete = false;
            doneByCaptureWrite = false;

            slot.lastResult = {
              ...(slot.lastResult || {}),
              note: "probe_result_mismatch_slot_hour (kept pending)",
            };
            saveState(date, state);

            logLine(
              `[AUTO] FEDERAL PROBE mismatch: slot=${sched.hour} close=${closeHour} targetDrawIds=${
                Array.isArray(r && r.targetDrawIds) ? r.targetDrawIds.join(",") : "—"
              } -> mantendo PENDENTE`,
              "INFO"
            );

            didSomething = true;
            break; // SOFT tem 1 candidate, encerra loop
          }
        }

        if (doneByAlreadyComplete || doneByCaptureWrite) {
          slot.done = true;
          saveState(date, state);

          if (doneByAlreadyComplete) {
            logLine(`[AUTO] FS já tem slot=${sched.hour} COMPLETO (close=${closeHour}) -> DONE`, "INFO");
            await guardPersistedOrCritical({
              date,
              slotHHMM: sched.hour,
              calendar: st,
              closeHourTried: closeHour,
              meta: { mode: "ALREADY_COMPLETE", alreadyCompleteAll: true },
            });
          } else {
            logLine(`[AUTO] CAPTURADO slot=${sched.hour} (close=${closeHour}) saved=${savedCount} writes=${writeCount} -> DONE`, "INFO");
            await guardPersistedOrCritical({
              date,
              slotHHMM: sched.hour,
              calendar: st,
              closeHourTried: closeHour,
              meta: { mode: "CAPTURE_WRITE", savedCount, writeCount, captured: true },
            });
          }

          didSomething = true;
          break;
        }
      }

      if (!slot.done) {
        if (lastErr) {
          logLine(`[AUTO] falhou slot=${sched.hour} (erros em closes candidatos)`, "ERROR");
          didSomething = true;
        } else {
          logLine(`[AUTO] ainda indisponível slot=${sched.hour} (nenhum close candidato capturou)`, "INFO");
        }
      }
    }

    // 2.5) ALERTAS HARD (anti-spam)
    try {
      const isTestNowHm = isNowHmOverrideActive();
      if (!isTestNowHm) {
        const touchedAlerts = emitHardAlertsIfNeeded({ date, nowMin, state, statusMap });
        if (touchedAlerts) saveState(date, state);
      } else {
        logLine(`[ALERT] NOW_HM ativo => suprimindo alertas HARD retroativos (modo teste)`, "INFO");
      }
    } catch {}

    // 3) Auditoria pós-execução
    try {
      const report = buildAuditReport({ date, nowMin, isoNow: new Date().toISOString(), dow, statusMap, state });

      if (isNowHmOverrideActive()) {
        report.status = "ok";
        report.note = "NOW_HM override ativo: audit retroativo neutralizado (informativo).";
      }
      safeWriteJson(auditOutFile(date), report);

      if (report.status === "critical") {
        logLine(
          `[AUDIT] CRITICAL missing=${report.criticalCount} warning=${report.warningCount} softLate=${report.softLateCount} (relatório salvo em ${path.basename(
            auditOutFile(date)
          )})`,
          "ERROR"
        );
        if (FAIL_ON_CRITICAL) {
          logLine(`[AUDIT] FAIL_ON_CRITICAL=1 => exit(2)`, "ERROR");
          process.exitCode = 2;
        }
      } else if (report.status === "warning") {
        logLine(
          `[AUDIT] WARNING missing=${report.warningCount} softLate=${report.softLateCount} (relatório salvo em ${path.basename(
            auditOutFile(date)
          )})`,
          "INFO"
        );
      } else {
        logLine(`[AUDIT] OK (sem furos HARD acima de ${WARN_AFTER_MIN} min) softLate=${report.softLateCount}`, "INFO");
      }
    } catch (e) {
      logLine(`[AUDIT] erro ao gerar relatório: ${e?.message || e}`, "ERROR");
    }

    if (isAllDoneHardOnly(state, statusMap)) logLine(`[AUTO] DIA COMPLETO (${date}) — slots concluídos`, "INFO");
    else if (!didSomething) logLine(`[AUTO] nada para fazer agora (${date})`, "INFO");
  } finally {
    releaseLock();
  }
}

main().catch((e) => {
  logLine(`ERRO: ${e?.message || e}`, "ERROR");
  releaseLock();
  process.exit(1);
});