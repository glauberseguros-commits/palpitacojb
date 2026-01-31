// backend/scripts/autoImportToday.js
"use strict";

const fs = require("fs");
const path = require("path");

const { runImport } = require("./importKingApostas");
// ✅ PT_RIO calendário CORE/OPCIONAL/RARA (gerado do Firestore)
const { getPtRioSlotsByDate } = require("./ptRioCalendar");

/**
 * AUTO IMPORT — (parametrizável por LOTTERY)
 *
 * ✅ Estratégia (custo baixo / sem martelar):
 * - Script é chamado pelo Agendador a cada N minutos (workflow cron).
 * - Ele só chama API/Firestore se:
 *   - estiver dentro da janela do slot,
 *   - e já passou do releaseAt,
 *   - e o slot ainda não estiver done.
 * - Assim que capturar (ou detectar que já está completo no Firestore), marca done.
 *
 * ✅ Regras especiais (PT_RIO):
 * - Slots a tentar no dia = CORE + OPCIONAL (via ptRioCalendarRules).
 * - Slots RARA viram N/A automaticamente no state do dia (não tenta).
 * - Quarta e sábado: se 18:00 estiver habilitado (CORE/OPCIONAL), faz UMA tentativa única às 18:35 (+tolerance).
 *
 * ✅ FEDERAL:
 * - Somente quarta e sábado.
 * - Janela 19:49–20:10 (BRT), com release recomendado às 20:00 (pra evitar martelar cedo).
 *
 * ✅ Log claro em arquivo:
 * - backend/logs/autoImportToday-<LOTTERY>.log
 *
 * ✅ NOVO (2026-01):
 * - Hard-guard de data futura (America/Sao_Paulo) => NÃO importa / NÃO contamina.
 * - Auditoria de furo crítico (warning/critical) + relatório JSON em backend/logs/
 * - FAIL_ON_CRITICAL=1 => exit(2) quando houver CRÍTICO (bom pro CI ficar vermelho)
 *
 * ✅ FIX (2026-01-31):
 * - Se o backend indicar dayStatus=holiday_no_draw (blocked=true),
 *   fecha o dia marcando slots aplicáveis como N/A (HOLIDAY_NO_DRAW),
 *   evitando CRITICAL falso na auditoria.
 */

// ✅ LOTTERY parametrizável por env (default PT_RIO)
const LOTTERY =
  String(process.env.LOTTERY || "PT_RIO").trim().toUpperCase() || "PT_RIO";

const LOG_DIR = path.join(__dirname, "..", "logs");

// Logs (por loteria para não misturar)
const LOG_FILE = path.join(LOG_DIR, `autoImportToday-${LOTTERY}.log`);

// Lock para evitar concorrência (por loteria)
const LOCK_FILE = path.join(LOG_DIR, `autoImport-${LOTTERY}.lock`);

// TTL do lock (ambientes locais). Em GitHub Actions, o workspace é isolado por execução.
const LOCK_TTL_MS = 90 * 1000; // 1m30s

// Regra especial (quarta e sábado): 18h só uma tentativa às 18:35
const WED_SAT_18H_ONE_SHOT_MINUTE = 35;
// Tolerância (se o agendador disparar 18:36 etc.)
const WED_SAT_18H_ONE_SHOT_TOLERANCE = 10; // minutos após 18:35

// Auditoria: thresholds (minutos)
const WARN_AFTER_MIN = Number(process.env.AUDIT_WARN_MIN || 20);
const CRIT_AFTER_MIN = Number(process.env.AUDIT_CRIT_MIN || 60);
const FAIL_ON_CRITICAL =
  String(process.env.FAIL_ON_CRITICAL || "0").trim() === "1";

/**
 * ✅ Base URL do backend (pra ler dayStatus sem duplicar regra)
 * - Local default: http://127.0.0.1:3333
 * - Override: PITACO_API_BASE="https://seu-dominio"
 */
const PITACO_API_BASE = String(process.env.PITACO_API_BASE || "http://127.0.0.1:3333").trim();

/* =========================
   Schedules (por loteria)
========================= */
const SCHEDULES = {
  PT_RIO: [
    { hour: "09:00", windowStart: "09:05", releaseAt: "09:29", windowEnd: "09:31" },
    { hour: "11:00", windowStart: "11:05", releaseAt: "11:29", windowEnd: "11:31" },
    { hour: "14:00", windowStart: "14:05", releaseAt: "14:29", windowEnd: "14:31" },
    { hour: "16:00", windowStart: "16:05", releaseAt: "16:29", windowEnd: "16:31" },

    // 18h (normal seg/ter/qui/sex; qua/sáb pode ser one-shot; domingo costuma ser RARA)
    { hour: "18:00", windowStart: "18:05", releaseAt: "18:29", windowEnd: "18:31" },

    // 21h: janela longa minuto a minuto (mas pode ser RARA em alguns dias)
    { hour: "21:00", windowStart: "21:05", releaseAt: "21:05", windowEnd: "21:45" },
  ],

  // FEDERAL — quarta e sábado
  FEDERAL: [{ hour: "20:00", windowStart: "19:49", releaseAt: "20:00", windowEnd: "20:10" }],
};

const SCHEDULE = Array.isArray(SCHEDULES[LOTTERY]) ? SCHEDULES[LOTTERY] : SCHEDULES.PT_RIO;

/* =========================
   Utils
========================= */
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function tsLocal() {
  // log no fuso do Brasil (pra bater com tua operação)
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
    // pt-BR vem como "dd/mm/aaaa hh:mm:ss"
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
  } catch {
    // ignora falha em log
  }
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
    // en-CA => YYYY-MM-DD
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

function dowInSaoPaulo() {
  // 0=Dom..6=Sáb
  try {
    // trick: pega weekday em en-US e mapeia
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
    }).format(new Date());
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return typeof map[wd] === "number" ? map[wd] : new Date().getDay();
  } catch {
    return new Date().getDay();
  }
}

function isFutureISODate(ymd) {
  if (!isISODate(ymd)) return false;
  const todayBR = todayYMDInSaoPaulo();
  // ISO lexicográfico funciona
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

// Converte schedule.hour "09:09" -> slot "09:00"
function scheduleHourToSlot(hourHHMM) {
  const parsed = parseHH(hourHHMM);
  if (!parsed) return String(hourHHMM || "").trim();
  const { h } = parsed;
  return `${pad2(h)}:00`;
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

  // Migração / merge defensivo
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
      };
    }
  }

  return migrated;
}

function saveState(date, state) {
  safeWriteJson(stateFile(date), state);
}

function isAllDone(state) {
  return Object.values(state).every((x) => x && x.done === true);
}

/**
 * Gera closes candidatos (tolerância de minutos)
 * Ex.: "11:00" => ["11:00","11:01","10:59","11:02","10:58","11:09",...]
 */
function closeCandidates(hhmm) {
  const parsed = parseHH(hhmm);
  if (!parsed) return [];
  const { h, m } = parsed;

  const bases = [m];
  if (m === 0) bases.push(9);

  const deltas = [0, +1, -1, +2, -2];

  const out = [];
  for (const baseM of bases) {
    for (const d of deltas) {
      const mm = baseM + d;
      if (mm < 0 || mm > 59) continue;
      out.push(`${pad2(h)}:${pad2(mm)}`);
    }
  }
  return Array.from(new Set(out));
}

/* =========================
   Regras do calendário
========================= */
function isWedOrSat(dow) {
  return dow === 3 || dow === 6;
}

function buildTodaySlotStatusMap(dateYMD, dow) {
  const map = new Map();

  // schedule.hour -> status
  if (LOTTERY === "PT_RIO") {
    const cal = getPtRioSlotsByDate(dateYMD);
    const core = new Set(cal.core || []);
    const opt = new Set(cal.opcional || []);
    const rare = new Set(cal.rara || []);

    for (const sched of SCHEDULE) {
      const slot = scheduleHourToSlot(sched.hour);
      let status = "OFF";
      if (core.has(slot)) status = "CORE";
      else if (opt.has(slot)) status = "OPCIONAL";
      else if (rare.has(slot)) status = "RARA";
      map.set(sched.hour, status);
    }

    logLine(
      `[CAL] date=${dateYMD} dow=${dow} source=${cal.source} CORE=${(cal.core || []).join(",") || "—"} OPC=${(cal.opcional || []).join(",") || "—"} RARA=${(cal.rara || []).join(",") || "—"}`,
      "INFO"
    );
    return map;
  }

  if (LOTTERY === "FEDERAL") {
    const ok = isWedOrSat(dow);
    for (const sched of SCHEDULE) {
      map.set(sched.hour, ok ? "CORE" : "OFF");
    }
    return map;
  }

  for (const sched of SCHEDULE) map.set(sched.hour, "CORE");
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

function isInWedSat18OneShotWindow(nowMin) {
  const start = toMin(18, WED_SAT_18H_ONE_SHOT_MINUTE);
  const end =
    start + Math.max(0, Number(WED_SAT_18H_ONE_SHOT_TOLERANCE || 0));
  return nowMin >= start && nowMin <= end;
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
      JSON.stringify(
        { pid: process.pid, at: new Date().toISOString(), lottery: LOTTERY },
        null,
        2
      )
    );
    return { ok: true };
  } catch {
    return { ok: false, reason: "NAO_FOI_POSSIVEL_CRIAR_LOCK" };
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch {
    // ignore
  }
}

/* =========================
   DayStatus guard (holiday_no_draw)
========================= */
async function fetchDayStatusFromBackend({ date, lottery }) {
  try {
    const u = `${PITACO_API_BASE.replace(/\/+$/, "")}/api/pitaco/results?date=${encodeURIComponent(
      String(date || "").trim()
    )}&lottery=${encodeURIComponent(String(lottery || "").trim())}`;

    // Node 18+ tem fetch global; se não tiver, simplesmente falha no catch
    const res = await fetch(u, { method: "GET" });
    if (!res.ok) return null;

    const j = await res.json().catch(() => null);
    if (!j || typeof j !== "object") return null;

    return {
      ok: Boolean(j.ok),
      dayStatus: String(j.dayStatus || "").trim(),
      blocked: Boolean(j.blocked),
      blockedReason: String(j.blockedReason || "").trim(),
      count: Number.isFinite(Number(j.count)) ? Number(j.count) : null,
    };
  } catch {
    return null;
  }
}

function applyHolidayNoDrawToState({ state, statusMap, isoNow }) {
  // marca apenas slots aplicáveis (CORE/OPCIONAL) como N/A + DONE
  let touched = 0;

  for (const sched of SCHEDULE) {
    const slot = state?.[sched.hour];
    if (!slot) continue;

    const st = statusMap.get(sched.hour) || "OFF";
    const applies = st === "CORE" || st === "OPCIONAL";
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
   Auditoria de Furos (warning/critical)
========================= */
function auditOutFile(dateYMD) {
  return path.join(LOG_DIR, `auditCritical-${LOTTERY}-${dateYMD}.json`);
}

function buildAuditReport({ date, nowMin, isoNow, dow, statusMap, state }) {
  const todayBR = todayYMDInSaoPaulo();
  const missing = [];
  const warnings = [];

  for (const sched of SCHEDULE) {
    const slotState = state?.[sched.hour];
    if (!slotState) continue;

    const st = statusMap.get(sched.hour) || "OFF";
    const applies = st === "CORE" || st === "OPCIONAL";
    if (!applies) continue;

    if (slotState.na) continue;
    if (slotState.done) continue;

    // calcula referência de "release" por regra
    let releaseMin = null;
    let releaseLabel = null;
    let windowEndLabel = null;
    let rule = "window";

    if (LOTTERY === "PT_RIO" && sched.hour === "18:00" && isWedOrSat(dow)) {
      // one-shot: referência é 18:35 (quando tentamos)
      releaseMin = toMin(18, WED_SAT_18H_ONE_SHOT_MINUTE);
      releaseLabel = `18:${pad2(WED_SAT_18H_ONE_SHOT_MINUTE)}`;
      windowEndLabel = `18:${pad2(
        WED_SAT_18H_ONE_SHOT_MINUTE + WED_SAT_18H_ONE_SHOT_TOLERANCE
      )}`;
      rule = "wed_sat_one_shot";
    } else {
      const w = slotWindow(sched);
      releaseMin = w.release;
      releaseLabel = w.releaseLabel;
      windowEndLabel = w.endLabel;
      rule = "window";
    }

    // se ainda não passou do release, não é furo (ainda)
    if (nowMin < releaseMin) continue;

    const since = nowMin - releaseMin;

    const item = {
      slot: sched.hour,
      calendar: st,
      rule,
      releaseAt: releaseLabel,
      windowEnd: windowEndLabel,
      sinceMinutes: since,
      tries: Number(slotState.tries || 0),
      lastTryISO: slotState.lastTryISO || null,
      lastResult: slotState.lastResult || null,
    };

    if (since >= CRIT_AFTER_MIN) missing.push(item);
    else if (since >= WARN_AFTER_MIN) warnings.push(item);
  }

  let status = "ok";
  if (missing.length) status = "critical";
  else if (warnings.length) status = "warning";

  return {
    ok: true,
    lottery: LOTTERY,
    date,
    todayBR,
    isoNow,
    dow,
    thresholds: { warnAfterMin: WARN_AFTER_MIN, critAfterMin: CRIT_AFTER_MIN },
    status,
    criticalCount: missing.length,
    warningCount: warnings.length,
    critical: missing,
    warning: warnings,
  };
}

/* =========================
   Main
========================= */
async function main() {
  // ✅ data base: pode sobrescrever por env (útil em backfill manual/CI)
  const envDate = String(process.env.DATE || "").trim();
  const date = envDate && isISODate(envDate) ? envDate : todayYMDInSaoPaulo();

  // ✅ HARD GUARD: bloqueia data futura (Brasil)
  if (isFutureISODate(date)) {
    const todayBR = todayYMDInSaoPaulo();
    logLine(
      `[GUARD] FUTURE_DATE_BLOCKED date=${date} todayBR=${todayBR} (não vamos importar)`,
      "ERROR"
    );
    process.exit(2);
    return;
  }

  const now = nowHMInSaoPaulo();
  const nowMin = toMin(now.h, now.m);
  const dow = dowInSaoPaulo();

  // ✅ Flags por execução (NÃO persistir em JSON)
  const catchupTried = new Set(); // key = `${date}::${sched.hour}`

  const lock = acquireLock();
  if (!lock.ok) {
    logLine(`[AUTO] abortado: ${lock.reason}`, "INFO");
    return;
  }

  try {
    const state = loadState(date);
    const isoNow = new Date().toISOString();
    const statusMap = buildTodaySlotStatusMap(date, dow);

    // 1) Marca N/A slots que não se aplicam hoje (RARA/OFF)
    let stateTouched = false;
    for (const sched of SCHEDULE) {
      const slot = state[sched.hour];
      if (!slot) continue;

      const st = statusMap.get(sched.hour) || "OFF";
      const applies = st === "CORE" || st === "OPCIONAL";

      if (!applies && !slot.done) {
        slot.done = true;
        slot.na = true;

        if (LOTTERY === "PT_RIO") {
          slot.naReason = st === "RARA" ? "CALENDARIO_RARA" : "CALENDARIO_OFF";
        } else if (LOTTERY === "FEDERAL") {
          slot.naReason = "FEDERAL_SO_QUA_SAB";
        } else {
          slot.naReason = "NAO_APLICA";
        }

        slot.lastTryISO = isoNow;
        slot.lastResult = { ok: true, skipped: true, reason: slot.naReason };
        stateTouched = true;

        logLine(`[AUTO] N/A slot=${sched.hour} (${slot.naReason}) -> DONE`, "INFO");
      }
    }
    if (stateTouched) saveState(date, state);

    /**
     * ✅ 1.5) DayStatus guard: feriado sem sorteio
     * Só faz sentido se o backend estiver acessível (local/CI).
     * Se detectado holiday_no_draw + blocked, fecha o dia marcando slots aplicáveis como N/A.
     */
    const ds = await fetchDayStatusFromBackend({ date, lottery: LOTTERY });
    if (ds && ds.blocked && String(ds.dayStatus || "") === "holiday_no_draw") {
      const touched = applyHolidayNoDrawToState({ state, statusMap, isoNow });
      if (touched > 0) saveState(date, state);

      // gera audit OK (sem furos) porque tudo aplicável virou N/A
      try {
        const report = buildAuditReport({
          date,
          nowMin,
          isoNow: new Date().toISOString(),
          dow,
          statusMap,
          state,
        });
        safeWriteJson(auditOutFile(date), report);
      } catch {}

      logLine(
        `[DAY_STATUS] holiday_no_draw confirmado pelo backend (blockedReason=${ds.blockedReason || "—"}). ` +
          `Slots aplicáveis marcados como N/A (HOLIDAY_NO_DRAW). Encerrando.`,
        "INFO"
      );
      return;
    }

    let didSomething = false;

    // 2) Processa slots aplicáveis (CORE/OPCIONAL)
    for (const sched of SCHEDULE) {
      const slot = state[sched.hour];
      if (!slot) continue;
      if (slot.done) continue;

      const st = statusMap.get(sched.hour) || "OFF";
      const applies = st === "CORE" || st === "OPCIONAL";
      if (!applies) continue;

      // Regra especial PT_RIO: quarta/sábado 18h one-shot 18:35
      if (LOTTERY === "PT_RIO" && sched.hour === "18:00" && isWedOrSat(dow)) {
        if (!isInWedSat18OneShotWindow(nowMin)) continue;

        slot.tries = (slot.tries || 0) + 1;
        slot.lastTryISO = isoNow;

        const candidates = closeCandidates(sched.hour);
        slot.lastTriedCloses = candidates;
        saveState(date, state);

        logLine(
          `[AUTO] (ONE-SHOT QUA/SAB) tentando ${date} slot=18:00 agora=18:${pad2(
            now.m
          )} closes=${candidates.join(",")}`,
          "INFO"
        );

        let doneReason = "CHECKED_NO_DRAW";
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

          const savedCount = Number.isFinite(Number(r?.savedCount)) ? Number(r.savedCount) : 0;
          const writeCount = Number.isFinite(Number(r?.writeCount)) ? Number(r.writeCount) : 0;

          const alreadyCompleteAny = Boolean(r?.alreadyCompleteAny);
          const alreadyCompleteAll = Boolean(r?.alreadyCompleteAll);

          const captured = Boolean(r?.captured);
          const apiHasPrizes = r?.apiHasPrizes ?? null;

          const doneNow = captured && (savedCount > 0 || alreadyCompleteAll);

          slot.lastResult = {
            ok: true,
            mode: "WED_SAT_18H_ONE_SHOT",
            closeHourTried: closeHour,
            captured,
            alreadyCompleteAny,
            alreadyCompleteAll,
            savedCount,
            writeCount,
            apiHasPrizes,
            targetDrawIds: r?.targetDrawIds ?? null,
            tookMs: r?.tookMs ?? null,
          };
          saveState(date, state);

          if (doneNow) {
            doneReason = alreadyCompleteAll ? "FS_ALREADY_HAS_ALL" : "CAPTURED";
            logLine(
              alreadyCompleteAll
                ? `[AUTO] FS já tem slot=18:00 COMPLETO (close=${closeHour}) -> DONE`
                : `[AUTO] CAPTURADO slot=18:00 (close=${closeHour}) saved=${savedCount} writes=${writeCount} -> DONE`,
              "INFO"
            );
            break;
          }
        }

        // marca done SEMPRE (one-shot)
        slot.done = true;
        slot.lastResult = {
          ...(slot.lastResult || {}),
          oneShotFinal: true,
          oneShotFinalReason: lastErr ? `ERROR:${lastErr}` : doneReason,
        };
        saveState(date, state);

        logLine(
          `[AUTO] (ONE-SHOT QUA/SAB) DONE slot=18:00 (${slot.lastResult.oneShotFinalReason})`,
          lastErr ? "ERROR" : "INFO"
        );

        didSomething = true;
        continue;
      }

      // Regra normal: janela definida em schedule (HH:MM)
      const w = slotWindow(sched);

      // ✅ CATCH-UP: se passou do releaseAt e o slot ainda não foi capturado,
      // tenta UMA vez por execução mesmo fora da janela (evita furo por atraso do cron)
      const inWindow = !(nowMin < w.start || nowMin > w.end);
      const afterRelease = nowMin >= w.release;

      if (!inWindow) {
        if (!afterRelease) continue;
        const key = `${date}::${sched.hour}`;
        if (catchupTried.has(key)) continue;
        catchupTried.add(key);

        logLine(
          `[AUTO] CATCH-UP pós-release ${date} slot=${sched.hour} (${st}) releaseAt=${w.releaseLabel} window=${w.startLabel}~${w.endLabel} (fora da janela)`,
          "INFO"
        );
      }

      if (!afterRelease) continue;

      // tenta capturar
      slot.tries = (slot.tries || 0) + 1;
      slot.lastTryISO = isoNow;

      const candidates = closeCandidates(sched.hour);
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

        const savedCount = Number.isFinite(Number(r?.savedCount)) ? Number(r.savedCount) : 0;
        const writeCount = Number.isFinite(Number(r?.writeCount)) ? Number(r.writeCount) : 0;

        const alreadyCompleteAny = Boolean(r?.alreadyCompleteAny);
        const alreadyCompleteAll = Boolean(r?.alreadyCompleteAll);

        const skippedAlreadyComplete = Number.isFinite(Number(r?.skippedAlreadyComplete))
          ? Number(r.skippedAlreadyComplete)
          : null;

        const captured = Boolean(r?.captured);
        const apiHasPrizes = r?.apiHasPrizes ?? null;

        const doneNow = captured && (savedCount > 0 || alreadyCompleteAll);

        slot.lastResult = {
          ok: true,
          closeHourTried: closeHour,
          captured,
          alreadyCompleteAny,
          alreadyCompleteAll,
          skippedAlreadyComplete,
          savedCount,
          writeCount,
          apiHasPrizes,
          targetDrawIds: r?.targetDrawIds ?? null,
          tookMs: r?.tookMs ?? null,
        };
        saveState(date, state);

        if (doneNow) {
          slot.done = true;
          saveState(date, state);

          logLine(
            alreadyCompleteAll
              ? `[AUTO] FS já tem slot=${sched.hour} COMPLETO (close=${closeHour}) -> DONE`
              : `[AUTO] CAPTURADO slot=${sched.hour} (close=${closeHour}) saved=${savedCount} writes=${writeCount} -> DONE`,
            "INFO"
          );

          didSomething = true;
          break;
        }
      }

      if (!slot.done) {
        if (lastErr) {
          logLine(`[AUTO] falhou slot=${sched.hour} (erros em closes candidatos)`, "ERROR");
          didSomething = true;
        } else {
          logLine(
            `[AUTO] ainda indisponível slot=${sched.hour} (nenhum close candidato capturou)`,
            "INFO"
          );
        }
      }
    }

    // 3) Auditoria pós-execução: warning/critical (gera relatório)
    try {
      const report = buildAuditReport({
        date,
        nowMin,
        isoNow: new Date().toISOString(),
        dow,
        statusMap,
        state,
      });

      safeWriteJson(auditOutFile(date), report);

      if (report.status === "critical") {
        logLine(
          `[AUDIT] CRITICAL missing=${report.criticalCount} warning=${report.warningCount} (relatório salvo em ${path.basename(
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
          `[AUDIT] WARNING missing=${report.warningCount} (relatório salvo em ${path.basename(
            auditOutFile(date)
          )})`,
          "INFO"
        );
      } else {
        logLine(`[AUDIT] OK (sem furos acima de ${WARN_AFTER_MIN} min)`, "INFO");
      }
    } catch (e) {
      logLine(`[AUDIT] erro ao gerar relatório: ${e?.message || e}`, "ERROR");
    }

    if (isAllDone(state)) {
      logLine(`[AUTO] DIA COMPLETO (${date}) — slots concluídos`, "INFO");
    } else if (!didSomething) {
      logLine(`[AUTO] nada para fazer agora (${date})`, "INFO");
    }
  } finally {
    releaseLock();
  }
}

main().catch((e) => {
  logLine(`ERRO: ${e?.message || e}`, "ERROR");
  releaseLock();
  process.exit(1);
});
