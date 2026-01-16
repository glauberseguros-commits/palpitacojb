"use strict";

const fs = require("fs");
const path = require("path");
const { runImport } = require("./importKingApostas");

/**
 * CONFIGURAÇÃO OFICIAL DOS SORTEIOS (PT_RIO)
 */
const SCHEDULE = [
  { hour: "09:09", releaseMinute: 29 },
  { hour: "11:09", releaseMinute: 29 },
  { hour: "14:09", releaseMinute: 29 },
  { hour: "16:09", releaseMinute: 29 },
  { hour: "18:09", releaseMinute: 29 },
  { hour: "21:09", releaseMinute: 39 }, // exceção
];

const LOTTERY = "PT_RIO";
const LOG_DIR = path.join(__dirname, "..", "logs");

// Lock para evitar concorrência (ex.: agendador rodando a cada 2 min e ainda não terminou)
const LOCK_FILE = path.join(LOG_DIR, "autoImport.lock");
const LOCK_TTL_MS = 2 * 60 * 1000 + 20 * 1000; // 2m20s

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
    };
  }
  return init;
}

function loadState(date) {
  const f = stateFile(date);

  if (!fs.existsSync(f)) {
    const init = defaultState();
    fs.writeFileSync(f, JSON.stringify(init, null, 2));
    return init;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    const init = defaultState();
    fs.writeFileSync(f, JSON.stringify(init, null, 2));
    return init;
  }

  // Migração do formato antigo (boolean) -> objeto
  const migrated = defaultState();
  for (const s of SCHEDULE) {
    const v = parsed?.[s.hour];
    if (typeof v === "boolean") {
      migrated[s.hour].done = v;
    } else if (v && typeof v === "object") {
      migrated[s.hour] = {
        done: Boolean(v.done),
        tries: Number.isFinite(Number(v.tries)) ? Number(v.tries) : 0,
        lastTryISO: typeof v.lastTryISO === "string" ? v.lastTryISO : null,
        lastResult: v.lastResult ?? null,
      };
    }
  }

  return migrated;
}

function saveState(date, state) {
  fs.writeFileSync(stateFile(date), JSON.stringify(state, null, 2));
}

function canTry(schedule, now) {
  const hh = Number(schedule.hour.slice(0, 2));
  return now.h > hh || (now.h === hh && now.m >= schedule.releaseMinute);
}

function isAllDone(state) {
  return Object.values(state).every((x) => x && x.done === true);
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

  const lock = acquireLock();
  if (!lock.ok) {
    console.log(`[AUTO] abortado: ${lock.reason}`);
    return;
  }

  try {
    const state = loadState(date);

    let didSomething = false;
    const isoNow = new Date().toISOString();

    for (const sched of SCHEDULE) {
      const slot = state[sched.hour];

      if (slot?.done) continue;
      if (!canTry(sched, now)) continue;

      console.log(`[AUTO] tentando ${date} ${sched.hour}`);

      slot.tries = (slot.tries || 0) + 1;
      slot.lastTryISO = isoNow;
      saveState(date, state);

      let r = null;
      try {
        r = await runImport({
          date,
          lotteryKey: LOTTERY,
          closeHour: sched.hour,
        });
      } catch (e) {
        slot.lastResult = {
          ok: false,
          error: e?.message || String(e),
        };
        saveState(date, state);
        console.log(`[AUTO] erro no import ${sched.hour}: ${slot.lastResult.error}`);
        didSomething = true;
        continue;
      }

      // savedCount/writeCount (quando existirem) são métricas de prova.
      const savedCount =
        Number.isFinite(Number(r?.savedCount)) ? Number(r.savedCount)
        : Number.isFinite(Number(r?.writeCount)) ? Number(r.writeCount)
        : null;

      const alreadyComplete = Boolean(r?.alreadyComplete);

      // ✅ REGRA FINAL (Opção B correta):
      // - Se captured=true e (gravei algo) => done
      // - Se captured=true e alreadyComplete=true => done
      // - Caso contrário => ainda indisponível
      const captured = Boolean(r?.captured);
      const didSave = savedCount !== null ? savedCount > 0 : false;

      const doneNow = captured && (didSave || alreadyComplete);

      slot.lastResult = {
        ok: true,
        captured,
        alreadyComplete,
        savedCount,
        writeCount: Number.isFinite(Number(r?.writeCount)) ? Number(r.writeCount) : null,
        apiHasPrizes: r?.apiHasPrizes ?? null,
        targetDrawId: r?.targetDrawId ?? null,
        tookMs: r?.tookMs ?? null,
      };
      saveState(date, state);

      if (doneNow) {
        slot.done = true;
        saveState(date, state);

        if (alreadyComplete) {
          console.log(`[AUTO] CAPTURADO ${sched.hour} (já completo no banco)`);
        } else {
          console.log(
            `[AUTO] CAPTURADO ${sched.hour}${savedCount !== null ? ` (saved=${savedCount})` : ""}`
          );
        }

        didSomething = true;
      } else {
        console.log(`[AUTO] ainda indisponível ${sched.hour}`);
      }
    }

    if (isAllDone(state)) {
      console.log(`[AUTO] DIA COMPLETO (${date}) — todos os 6 sorteios capturados`);
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
