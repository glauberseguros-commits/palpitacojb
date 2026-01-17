// backend/scripts/autoImportToday.js
"use strict";

const fs = require("fs");
const path = require("path");
const { runImport } = require("./importKingApostas");

/**
 * AUTO IMPORT — PT_RIO (RJ)
 *
 * Estratégia (custo baixo / sem martelar):
 * - Script é chamado pelo Agendador a cada 1 minuto (ex.: 09:05–21:45).
 * - Ele só chama API/Firestore se:
 *   - estiver dentro da janela do slot (ex.: 09:05–09:31 ou 21:05–21:45),
 *   - e já passou do releaseMinute (ex.: >= 09:29; no 21h, >= 21:05),
 *   - e o slot ainda não estiver done.
 * - Assim que capturar (ou já estiver completo), marca done e para de tentar.
 *
 * Regras especiais:
 * - Domingo: só 09/11/14/16. Slots 18/21 ficam N/A no state do dia.
 * - Quarta e sábado: slot 18h faz UMA tentativa única às 18:35 (se capturar, ótimo;
 *   se não capturar, marca como checado e segue o fluxo).
 */

// Horários oficiais (closeHour base; pode variar +/- 2 min na API)
//
// ✅ Janelas:
// - Regra padrão: start HH:05; end = (releaseMinute + 2)
// - Exceção 21h: end fixo HH:45
const SCHEDULE = [
  { hour: "09:09", releaseMinute: 29 }, // janela 09:05–09:31; tenta 09:29–09:31
  { hour: "11:09", releaseMinute: 29 }, // janela 11:05–11:31; tenta 11:29–11:31
  { hour: "14:09", releaseMinute: 29 }, // janela 14:05–14:31; tenta 14:29–14:31
  { hour: "16:09", releaseMinute: 29 }, // janela 16:05–16:31; tenta 16:29–16:31
  { hour: "18:09", releaseMinute: 29 }, // janela 18:05–18:31; (exc QUA/SAB one-shot 18:35)
  { hour: "21:09", releaseMinute: 5, windowEndMinute: 45 }, // ✅ 21:05–21:45 (minuto a minuto até capturar)
];

const LOTTERY = "PT_RIO";
const LOG_DIR = path.join(__dirname, "..", "logs");

// Lock para evitar concorrência
const LOCK_FILE = path.join(LOG_DIR, "autoImport.lock");
const LOCK_TTL_MS = 2 * 60 * 1000 + 20 * 1000; // 2m20s

// Janela por slot (minutos)
const WINDOW_START_MINUTE = 5; // ex.: HH:05
const WINDOW_END_OFFSET_MINUTES = 2; // padrão: release + 2 (ex.: 29 -> 31)

// Regra especial (quarta e sábado): 18h só uma tentativa às 18:35
const WED_SAT_18H_ONE_SHOT_MINUTE = 35;
// Opcional: tolerância de janela para esse one-shot (se o agendador disparar 18:36 etc.)
const WED_SAT_18H_ONE_SHOT_TOLERANCE = 10; // minutos após 18:35

/* =========================
   Utils
========================= */

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
  // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  return new Date().getDay();
}

function toMin(h, m) {
  return Number(h) * 60 + Number(m);
}

function parseHH(hhmm) {
  const h = Number(String(hhmm).slice(0, 2));
  const m = Number(String(hhmm).slice(3, 5));
  return { h, m };
}

function clampMinute(mm) {
  const n = Number(mm);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(59, n));
}

function stateFile(date) {
  return path.join(LOG_DIR, `autoImportState-${date}.json`);
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

      // extra: motivo de skip/na
      na: false,
      naReason: null,
    };
  }
  return init;
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

/**
 * Escrita atômica do JSON:
 * - escreve em .tmp
 * - renomeia por cima
 */
function safeWriteJson(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, filePath);
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

/**
 * Regras do calendário
 */
function slotAppliesToday(slotHour, dow) {
  // Domingo: só 09/11/14/16
  if (dow === 0) {
    return (
      slotHour === "09:09" ||
      slotHour === "11:09" ||
      slotHour === "14:09" ||
      slotHour === "16:09"
    );
  }

  // demais dias: todos se aplicam (inclui 18/21)
  return true;
}

function isWedOrSat(dow) {
  return dow === 3 || dow === 6;
}

/**
 * Janela do slot:
 * - start = HH:05
 * - release = HH:releaseMinute
 * - end:
 *   - se schedule.windowEndMinute existir: HH:windowEndMinute
 *   - senão: HH:(releaseMinute + WINDOW_END_OFFSET_MINUTES)
 */
function slotWindow(schedule) {
  const { h } = parseHH(schedule.hour);

  const start = toMin(h, WINDOW_START_MINUTE);

  const rel = clampMinute(schedule.releaseMinute);
  const release = toMin(h, rel);

  let endMin;
  if (schedule.windowEndMinute != null) {
    endMin = clampMinute(schedule.windowEndMinute);
  } else {
    endMin = clampMinute(rel + WINDOW_END_OFFSET_MINUTES);
  }

  const end = toMin(h, endMin);

  return { start, release, end };
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

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function acquireLock() {
  ensureLogDir();

  if (fs.existsSync(LOCK_FILE)) {
    try {
      const st = fs.statSync(LOCK_FILE);
      const age = Date.now() - st.mtimeMs;
      if (age < LOCK_TTL_MS) {
        return { ok: false, reason: "LOCK_ATIVO" };
      }
      fs.unlinkSync(LOCK_FILE);
    } catch {
      return { ok: false, reason: "LOCK_INACESSIVEL" };
    }
  }

  try {
    fs.writeFileSync(
      LOCK_FILE,
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() }, null, 2)
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
    // silencioso
  }
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
    console.log(`[AUTO] abortado: ${lock.reason}`);
    return;
  }

  try {
    const state = loadState(date);
    const isoNow = new Date().toISOString();

    // 1) Marca como N/A slots que não se aplicam hoje (apenas uma vez)
    let stateTouched = false;

    for (const sched of SCHEDULE) {
      const slot = state[sched.hour];
      if (!slot) continue;

      const applies = slotAppliesToday(sched.hour, dow);

      if (!applies && !slot.done) {
        slot.done = true;
        slot.na = true;
        slot.naReason = dow === 0 ? "DOMINGO_NAO_TEM_ESSE_SORTEIO" : "NAO_APLICA";
        slot.lastTryISO = isoNow;
        slot.lastResult = {
          ok: true,
          skipped: true,
          reason: slot.naReason,
        };
        stateTouched = true;
      }
    }

    if (stateTouched) saveState(date, state);

    let didSomething = false;

    // 2) Processa slots
    for (const sched of SCHEDULE) {
      const slot = state[sched.hour];
      if (!slot) continue;

      if (slot.done) continue;

      // se não aplica, já teria sido marcado acima
      if (!slotAppliesToday(sched.hour, dow)) continue;

      // Regra especial: quarta/sábado 18h one-shot 18:35
      if (sched.hour === "18:09" && isWedOrSat(dow)) {
        if (!isInWedSat18OneShotWindow(nowMin)) {
          // fora do momento do one-shot => não faz nada
          continue;
        }

        // tenta 1 vez e depois marca done (capturou ou não)
        slot.tries = (slot.tries || 0) + 1;
        slot.lastTryISO = isoNow;

        const candidates = closeCandidates(sched.hour);
        slot.lastTriedCloses = candidates;
        saveState(date, state);

        console.log(
          `[AUTO] (ONE-SHOT QUA/SAB) tentando ${date} slot=18:09 @18:${pad2(
            now.m
          )} closes=${candidates.join(",")}`
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
            console.log(`[AUTO] erro no import close=${closeHour}: ${lastErr}`);
            continue;
          }

          const savedCount = Number.isFinite(Number(r?.savedCount)) ? Number(r.savedCount) : 0;
          const writeCount = Number.isFinite(Number(r?.writeCount)) ? Number(r.writeCount) : 0;

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
            doneReason = alreadyCompleteAny ? "ALREADY_COMPLETE" : "CAPTURED";
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

        console.log(
          `[AUTO] (ONE-SHOT QUA/SAB) DONE slot=18:09 (${slot.lastResult.oneShotFinalReason})`
        );

        didSomething = true;
        continue;
      }

      // Regra normal: janela HH:05 -> HH:(release+2) (ou HH:45 no 21h)
      const w = slotWindow(sched);

      // fora da janela => não faz nada
      if (nowMin < w.start || nowMin > w.end) continue;

      // dentro da janela, mas antes do release => ainda não tenta importar
      if (nowMin < w.release) {
        continue; // não chama API
      }

      // a partir daqui: vai tentar capturar (com tolerância +/-2 min no close)
      slot.tries = (slot.tries || 0) + 1;
      slot.lastTryISO = isoNow;

      const candidates = closeCandidates(sched.hour);
      slot.lastTriedCloses = candidates;
      saveState(date, state);

      console.log(
        `[AUTO] tentando ${date} slot=${sched.hour} window=${pad2(
          Math.floor(w.start / 60)
        )}:${pad2(w.start % 60)}-${pad2(Math.floor(w.end / 60))}:${pad2(
          w.end % 60
        )} closes=${candidates.join(",")}`
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
          console.log(`[AUTO] erro no import close=${closeHour}: ${lastErr}`);
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

        // DONE se capturou e (gravou algo ou já estava completo)
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

          if (alreadyCompleteAny) {
            console.log(
              `[AUTO] DONE slot=${sched.hour} via close=${closeHour} (já completo no banco)`
            );
          } else {
            console.log(
              `[AUTO] CAPTURADO slot=${sched.hour} via close=${closeHour} (saved=${savedCount})`
            );
          }

          didSomething = true;
          break;
        }
      }

      // se tentou e não capturou em nenhum close candidato
      if (!slot.done) {
        if (lastErr) {
          console.log(`[AUTO] falhou slot=${sched.hour} (erros em closes candidatos)`);
          didSomething = true;
        } else {
          console.log(
            `[AUTO] ainda indisponível slot=${sched.hour} (nenhum close candidato capturou)`
          );
        }
      }
    }

    if (isAllDone(state)) {
      console.log(`[AUTO] DIA COMPLETO (${date}) — slots concluídos`);
    } else if (!didSomething) {
      console.log(`[AUTO] nada para fazer agora (${date})`);
    }
  } finally {
    releaseLock();
  }
}

main().catch((e) => {
  console.error("ERRO:", e?.message || e);
  releaseLock();
  process.exit(1);
});
