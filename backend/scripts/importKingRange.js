// backend/scripts/importKingRange.js
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * =========================
 * ENV helpers (load .env.local)
 * =========================
 */
(function loadEnvLocal() {
  try {
    const envPath = path.join(__dirname, "..", ".env.local");
    if (!fs.existsSync(envPath)) return;

    let raw = fs.readFileSync(envPath, "utf8");
    raw = raw.replace(/^\uFEFF/, ""); // remove BOM

    raw.split(/\r?\n/).forEach((line) => {
      let s = String(line || "").trim();
      if (!s || s.startsWith("#")) return;
      if (/^export\s+/i.test(s)) s = s.replace(/^export\s+/i, "").trim();

      const i = s.indexOf("=");
      if (i <= 0) return;

      const k = s.slice(0, i).trim();
      let v = s.slice(i + 1).trim();

      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }

      if (k && v && !process.env[k]) process.env[k] = v;
    });
  } catch {
    // silencioso por design
  }
})();

/**
 * =========================
 * Configuração de range
 * =========================
 */
const GLOBAL_MIN_DATE = "2022-06-07";

const ENV_GLOBAL_MAX_DATE = String(process.env.GLOBAL_MAX_DATE || "").trim();
const MAX_FUTURE_DAYS = Number.isFinite(Number(process.env.MAX_FUTURE_DAYS))
  ? Number(process.env.MAX_FUTURE_DAYS)
  : 7;

const MAX_RANGE_DAYS = Number.isFinite(Number(process.env.MAX_RANGE_DAYS))
  ? Number(process.env.MAX_RANGE_DAYS)
  : 400;

/**
 * =========================
 * Exec controls (robustez)
 * =========================
 */
const IMPORT_TIMEOUT_MS = Number.isFinite(Number(process.env.IMPORT_TIMEOUT_MS))
  ? Number(process.env.IMPORT_TIMEOUT_MS)
  : 120_000; // 2 min

const IMPORT_RETRIES = Number.isFinite(Number(process.env.IMPORT_RETRIES))
  ? Number(process.env.IMPORT_RETRIES)
  : 2; // total tentativas = 1 + retries

const IMPORT_RETRY_DELAY_MS = Number.isFinite(
  Number(process.env.IMPORT_RETRY_DELAY_MS)
)
  ? Number(process.env.IMPORT_RETRY_DELAY_MS)
  : 1500;

function sleepMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return;
  const end = Date.now() + n;
  while (Date.now() < end) {
    // busy sleep (script CLI). Evita async aqui.
  }
}

/**
 * =========================
 * Date helpers
 * =========================
 */
function parseDate(s) {
  const str = String(s || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;

  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));

  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

function parseYear(s) {
  const str = String(s || "").trim();
  if (!/^\d{4}$/.test(str)) return null;

  const y = Number(str);
  if (!Number.isFinite(y) || y < 2000 || y > 2100) return null;
  return y;
}

function fmt(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dt, n) {
  const x = new Date(dt.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function daysBetweenUTC(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Hoje local convertido para UTC (evita drift Brasil x UTC)
 */
function todayLocalDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * Resolve o max global:
 * - se env GLOBAL_MAX_DATE válida => usa ela
 * - senão => hoje (local)
 */
function resolveGlobalMaxDate() {
  if (ENV_GLOBAL_MAX_DATE) {
    const parsed = parseDate(ENV_GLOBAL_MAX_DATE);
    if (!parsed) {
      console.error(
        `ERRO: GLOBAL_MAX_DATE inválida: "${ENV_GLOBAL_MAX_DATE}". Use YYYY-MM-DD.`
      );
      process.exit(1);
    }
    return parsed;
  }
  return todayLocalDate();
}

function normLotteryKey(v) {
  return String(v || "PT_RIO").trim().toUpperCase() || "PT_RIO";
}

/**
 * =========================
 * Runner por dia (com retry/timeout)
 * =========================
 */
function runImportDay(importApostasPath, date, lotteryKey) {
  const maxAttempts = 1 + Math.max(0, IMPORT_RETRIES);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const head =
      attempt === 1
        ? `[RUN] ${date} (${lotteryKey})`
        : `[RETRY ${attempt}/${maxAttempts}] ${date} (${lotteryKey})`;

    console.log(head);

    const r = spawnSync(process.execPath, [importApostasPath, date, lotteryKey], {
      stdio: "inherit",
      timeout: IMPORT_TIMEOUT_MS,
      env: process.env,
    });

    // spawnSync: se timeout, r.error pode ser ETIMEDOUT e status null
    const ok = r && r.status === 0;
    if (ok) return { ok: true, attempt, status: r.status };

    const timedOut =
      (r && r.error && (r.error.code === "ETIMEDOUT" || r.error.code === "ETIMEDOUT")) ||
      (r && r.signal === "SIGTERM" && r.status === null);

    if (timedOut) {
      console.error(
        `[FALHA] timeout após ${IMPORT_TIMEOUT_MS}ms em ${date} (${lotteryKey}).`
      );
    } else {
      const code = r?.status;
      console.error(
        `[FALHA] status=${code} em ${date} (${lotteryKey}).`
      );
    }

    if (attempt < maxAttempts) {
      if (IMPORT_RETRY_DELAY_MS > 0) {
        console.log(
          `[AGUARDA] ${IMPORT_RETRY_DELAY_MS}ms antes de tentar novamente...`
        );
        sleepMs(IMPORT_RETRY_DELAY_MS);
      }
      continue;
    }

    return {
      ok: false,
      attempt,
      status: r?.status ?? null,
      signal: r?.signal ?? null,
      errorCode: r?.error?.code ?? null,
    };
  }

  return { ok: false, attempt: 0 };
}

/**
 * =========================
 * Main
 * =========================
 */
async function main() {
  const a1 = process.argv[2];
  const a2 = process.argv[3];
  const a3 = process.argv[4];

  let start = null;
  let end = null;
  let lotteryKey = "PT_RIO";

  const year = parseYear(a1);
  if (year) {
    start = `${year}-01-01`;
    end = `${year}-12-31`;
    lotteryKey = normLotteryKey(a2);
  } else {
    start = String(a1 || "").trim();
    end = String(a2 || "").trim();
    lotteryKey = normLotteryKey(a3);
  }

  let d1 = parseDate(start);
  let d2 = parseDate(end);

  if (!d1 || !d2) {
    console.error(
      "Uso:\n" +
        "  node backend/scripts/importKingRange.js YYYY-MM-DD YYYY-MM-DD [PT_RIO]\n" +
        "ou:\n" +
        "  node backend/scripts/importKingRange.js YYYY [PT_RIO]\n\n" +
        "ENV opcionais:\n" +
        "  GLOBAL_MAX_DATE=YYYY-MM-DD\n" +
        "  MAX_FUTURE_DAYS=7\n" +
        "  MAX_RANGE_DAYS=400\n" +
        "  IMPORT_TIMEOUT_MS=120000\n" +
        "  IMPORT_RETRIES=2\n" +
        "  IMPORT_RETRY_DELAY_MS=1500"
    );
    process.exit(1);
  }

  if (d1.getTime() > d2.getTime()) {
    console.error("ERRO: data inicial maior que data final.");
    process.exit(1);
  }

  const gMin = parseDate(GLOBAL_MIN_DATE);
  const gMax = resolveGlobalMaxDate();

  if (d2 < gMin || d1 > gMax) {
    console.error(
      `[ABORTADO] Intervalo fora do range global (${GLOBAL_MIN_DATE} → ${fmt(
        gMax
      )}).`
    );
    process.exit(0);
  }

  if (d1 < gMin) d1 = gMin;
  if (d2 > gMax) d2 = gMax;

  const today = todayLocalDate();
  const futureDays = daysBetweenUTC(today, d2);
  if (futureDays > MAX_FUTURE_DAYS) {
    console.error(
      `ERRO: data final muito no futuro (${fmt(d2)}). ` +
        `Máximo permitido: hoje=${fmt(today)} + ${MAX_FUTURE_DAYS} dias.`
    );
    process.exit(1);
  }

  const totalDays = daysBetweenUTC(d1, d2) + 1;
  if (totalDays > MAX_RANGE_DAYS) {
    console.error(
      `ERRO: range muito grande (${totalDays} dias). Limite: ${MAX_RANGE_DAYS}.`
    );
    process.exit(1);
  }

  console.log(
    `[RANGE] ${lotteryKey} de ${fmt(d1)} até ${fmt(d2)} (${totalDays} dias)` +
      ` | globalMin=${GLOBAL_MIN_DATE}` +
      ` | globalMax=${fmt(gMax)}${
        ENV_GLOBAL_MAX_DATE ? " (fixado por ENV)" : " (dinâmico)"
      }` +
      ` | timeout=${IMPORT_TIMEOUT_MS}ms retries=${IMPORT_RETRIES} delay=${IMPORT_RETRY_DELAY_MS}ms`
  );

  const importApostasPath = path.join(__dirname, "importKingApostas.js");
  if (!fs.existsSync(importApostasPath)) {
    console.error(`ERRO: script não encontrado: ${importApostasPath}`);
    process.exit(1);
  }

  let ok = 0;
  let fail = 0;
  let days = 0;
  const failedDates = [];

  for (let dt = d1; dt.getTime() <= d2.getTime(); dt = addDays(dt, 1)) {
    const date = fmt(dt);
    days++;

    console.log(`\n[DAY ${days}/${totalDays}] ${date} (${lotteryKey})`);

    const out = runImportDay(importApostasPath, date, lotteryKey);
    if (out.ok) {
      ok++;
    } else {
      fail++;
      failedDates.push(date);
      console.error(
        `[DIA FALHOU] ${date} (${lotteryKey}) | status=${out.status} signal=${out.signal} error=${out.errorCode}`
      );
    }
  }

  console.log("\n==================================");
  console.log(`[RESUMO] dias=${days} ok=${ok} falhas=${fail}`);
  if (failedDates.length) {
    console.log(`[FALHAS] ${failedDates.join(", ")}`);
    console.log(
      `Dica: rode um range menor só nessas datas (ou aumente IMPORT_TIMEOUT_MS / IMPORT_RETRIES).`
    );
  }
  console.log("==================================");

  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO:", e?.message || e);
  process.exit(1);
});
