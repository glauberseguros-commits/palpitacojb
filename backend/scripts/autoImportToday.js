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

/* =========================
   Schedules (por loteria)
========================= */

/**
 * Cada slot tem:
 * - hour: closeHour base (para closeCandidates)
 * - windowStart: início janela HH:MM
 * - releaseAt: só tenta a partir daqui HH:MM
 * - windowEnd: fim janela HH:MM
 *
 * Observação:
 * - Em PT_RIO você estava usando hour "09:09" etc. Mantive.
 * - Em FEDERAL, como o closeHour real pode variar na API,
 *   escolhi hour base "20:00" (e o closeCandidates tenta +/-2 min).
 */
const SCHEDULES = {
  PT_RIO: [
    { hour: "09:09", windowStart: "09:05", releaseAt: "09:29", windowEnd: "09:31" },
    { hour: "11:09", windowStart: "11:05", releaseAt: "11:29", windowEnd: "11:31" },
    { hour: "14:09", windowStart: "14:05", releaseAt: "14:29", windowEnd: "14:31" },
    { hour: "16:09", windowStart: "16:05", releaseAt: "16:29", windowEnd: "16:31" },
    // 18h (normal seg/ter/qui/sex; qua/sáb pode ser one-shot; domingo costuma ser RARA)
    { hour: "18:09", windowStart: "18:05", releaseAt: "18:29", windowEnd: "18:31" },
    // 21h: janela longa minuto a minuto (mas pode ser RARA em alguns dias)
    { hour: "21:09", windowStart: "21:05", releaseAt: "21:05", windowEnd: "21:45" },
  ],

  // FEDERAL — quarta e sábado
  // Janela real do teu workflow: 19:49–20:10
  // releaseAt recomendado 20:00 pra reduzir tentativas cedo.
  FEDERAL: [
    { hour: "20:00", windowStart: "19:49", releaseAt: "20:00", windowEnd: "20:10" },
  ],
};

// Seleciona schedule conforme LOTTERY
const SCHEDULE = Array.isArray(SCHEDULES[LOTTERY])
  ? SCHEDULES[LOTTERY]
  : SCHEDULES.PT_RIO;

/* =========================
   Utils
========================= */

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function tsLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
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

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nowHM() {
  const d = new Date();
  return { h: d.getHours(), m: d.getMinutes() };
}

function dowLocal() {
  return new Date().getDay(); // 0=Dom..6=Sáb
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
  // aceita "09:09" etc
  const h = Number(String(hhmm).slice(0, 2));
  const m = Number(String(hhmm).slice(3, 5));
  return { h, m };
}

// Converte schedule.hour "09:09" -> slot "09:00" (para comparar com CORE/OPCIONAL/RARA)
function scheduleHourToSlot(hourHHMM) {
  const { h } = parseHH(hourHHMM);
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

/**
 * Gera closes candidatos (tolerância de minutos):
 * Ex.: "11:09" => ["11:09","11:10","11:08","11:11","11:07"]
 */
function closeCandidates(hhmm) {
  const { h, m } = parseHH(hhmm);
  const deltas = [0, +1, -1, +2, -2];

  const out = [];
  for (const d of deltas) {
    const mm = m + d;
    if (mm < 0 || mm > 59) continue;
    out.push(`${pad2(h)}:${pad2(mm)}`);
  }
  return Array.from(new Set(out));
}

function isAllDone(state) {
  return Object.values(state).every((x) => x && x.done === true);
}

/* =========================
   Regras do calendário
========================= */

function isWedOrSat(dow) {
  return dow === 3 || dow === 6;
}

/**
 * Retorna status do slot para HOJE:
 * - CORE / OPCIONAL / RARA / OFF
 *
 * PT_RIO: baseado em ptRioCalendarRules (ano+dow).
 * FEDERAL: somente quarta/sábado (senão OFF).
 */
function buildTodaySlotStatusMap(dateYMD, dow) {
  const map = new Map(); // schedule.hour -> status

  if (LOTTERY === "PT_RIO") {
    const cal = getPtRioSlotsByDate(dateYMD);
    const core = new Set(cal.core || []);
    const opt = new Set(cal.opcional || []);
    const rare = new Set(cal.rara || []);

    for (const sched of SCHEDULE) {
      const slot = scheduleHourToSlot(sched.hour); // "09:00" etc
      let status = "OFF";
      if (core.has(slot)) status = "CORE";
      else if (opt.has(slot)) status = "OPCIONAL";
      else if (rare.has(slot)) status = "RARA";
      map.set(sched.hour, status);
    }

    // log diagnóstico (uma linha)
    logLine(
      `[CAL] date=${dateYMD} dow=${dow} source=${cal.source} CORE=${(cal.core||[]).join(",")||"—"} OPC=${(cal.opcional||[]).join(",")||"—"} RARA=${(cal.rara||[]).join(",")||"—"}`,
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

  // fallback: tudo CORE
  for (const sched of SCHEDULE) map.set(sched.hour, "CORE");
  return map;
}

/**
 * Janela do slot usando HH:MM reais (suporta FEDERAL 19:49–20:10)
 */
function slotWindow(schedule) {
  const ws = parseHHMM(schedule.windowStart);
  const ra = parseHHMM(schedule.releaseAt);
  const we = parseHHMM(schedule.windowEnd);

  if (!ws || !ra || !we) {
    // fallback muito defensivo (não quebra)
    const { h } = parseHH(schedule.hour);
    return {
      start: toMin(h, 5),
      release: toMin(h, 29),
      end: toMin(h, 31),
      startLabel: `${pad2(h)}:05`,
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
    endLabel: schedule.windowEnd,
  };
}

/**
 * Quarta/Sábado: 18h só tenta uma vez às 18:35 (ou até +tolerance)
 */
function isInWedSat18OneShotWindow(nowMin) {
  const start = toMin(18, WED_SAT_18H_ONE_SHOT_MINUTE);
  const end = start + Math.max(0, Number(WED_SAT_18H_ONE_SHOT_TOLERANCE || 0));
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
  } catch {}
}

/* =========================
   Main
========================= */

async function main() {
  const date = todayYMD();
  const now = nowHM();
  const nowMin = toMin(now.h, now.m);
  const dow = dowLocal();

  const lock = acquireLock();
  if (!lock.ok) {
    logLine(`[AUTO] abortado: ${lock.reason}`, "INFO");
    return;
  }

  try {
    const state = loadState(date);
    const isoNow = new Date().toISOString();

    // ✅ status do dia (CORE/OPCIONAL/RARA/OFF) por schedule.hour
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

        logLine(
          `[AUTO] N/A slot=${sched.hour} (${slot.naReason}) -> DONE`,
          "INFO"
        );
      }
    }

    if (stateTouched) saveState(date, state);

    let didSomething = false;

    // 2) Processa slots aplicáveis (CORE/OPCIONAL)
    for (const sched of SCHEDULE) {
      const slot = state[sched.hour];
      if (!slot) continue;
      if (slot.done) continue;

      const st = statusMap.get(sched.hour) || "OFF";
      const applies = st === "CORE" || st === "OPCIONAL";
      if (!applies) continue;

      // Regra especial PT_RIO: quarta/sábado 18h one-shot 18:35 (somente se 18:00 estiver habilitado hoje)
      if (LOTTERY === "PT_RIO" && sched.hour === "18:09" && isWedOrSat(dow)) {
        if (!isInWedSat18OneShotWindow(nowMin)) continue;

        slot.tries = (slot.tries || 0) + 1;
        slot.lastTryISO = isoNow;

        const candidates = closeCandidates(sched.hour);
        slot.lastTriedCloses = candidates;
        saveState(date, state);

        logLine(
          `[AUTO] (ONE-SHOT QUA/SAB) tentando ${date} slot=18:09 agora=18:${pad2(
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

          const savedCount = Number.isFinite(Number(r?.savedCount))
            ? Number(r.savedCount)
            : 0;
          const writeCount = Number.isFinite(Number(r?.writeCount))
            ? Number(r.writeCount)
            : 0;

          const alreadyCompleteAny = Boolean(r?.alreadyCompleteAny);
          const captured = Boolean(r?.captured);
          const apiHasPrizes = r?.apiHasPrizes ?? null;

          const doneNow = captured && (savedCount > 0 || alreadyCompleteAny);

          slot.lastResult = {
            ok: true,
            mode: "WED_SAT_18H_ONE_SHOT",
            closeHourTried: closeHour,
            captured,
            alreadyCompleteAny,
            savedCount,
            writeCount,
            apiHasPrizes,
            targetDrawIds: r?.targetDrawIds ?? null,
            tookMs: r?.tookMs ?? null,
          };
          saveState(date, state);

          if (doneNow) {
            doneReason = alreadyCompleteAny ? "FS_ALREADY_HAS" : "CAPTURED";
            logLine(
              alreadyCompleteAny
                ? `[AUTO] FS já tem slot=18:09 (close=${closeHour}) -> DONE`
                : `[AUTO] CAPTURADO slot=18:09 (close=${closeHour}) saved=${savedCount} writes=${writeCount} -> DONE`,
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
          `[AUTO] (ONE-SHOT QUA/SAB) DONE slot=18:09 (${slot.lastResult.oneShotFinalReason})`,
          lastErr ? "ERROR" : "INFO"
        );

        didSomething = true;
        continue;
      }

      // Regra normal: janela definida em schedule (HH:MM)
      const w = slotWindow(sched);

      // fora da janela
      if (nowMin < w.start || nowMin > w.end) continue;

      // dentro da janela, mas antes do releaseAt
      if (nowMin < w.release) continue;

      // a partir daqui: tenta capturar
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

        const savedCount = Number.isFinite(Number(r?.savedCount))
          ? Number(r.savedCount)
          : 0;
        const writeCount = Number.isFinite(Number(r?.writeCount))
          ? Number(r.writeCount)
          : 0;

        const alreadyCompleteAny = Boolean(r?.alreadyCompleteAny);
        const alreadyCompleteAll = Boolean(r?.alreadyCompleteAll);
        const skippedAlreadyComplete = Number.isFinite(Number(r?.skippedAlreadyComplete))
          ? Number(r.skippedAlreadyComplete)
          : null;

        const captured = Boolean(r?.captured);
        const apiHasPrizes = r?.apiHasPrizes ?? null;

        const doneNow = captured && (savedCount > 0 || alreadyCompleteAny);

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
            alreadyCompleteAny
              ? `[AUTO] FS já tem slot=${sched.hour} (close=${closeHour}) -> DONE`
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
          logLine(`[AUTO] ainda indisponível slot=${sched.hour} (nenhum close candidato capturou)`, "INFO");
        }
      }
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
