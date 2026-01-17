"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * RANGE GLOBAL CONHECIDO DA BASE (draws)
 * - MIN: pode ficar fixo (primeiro dia real do seu dataset)
 * - MAX: NÃO deve ficar fixo para sempre, senão o import "para no tempo".
 *
 * ✅ Novo comportamento:
 * - GLOBAL_MIN_DATE permanece fixo
 * - GLOBAL_MAX_DATE:
 *    - se houver env GLOBAL_MAX_DATE=YYYY-MM-DD => usa (modo "travado")
 *    - senão => usa HOJE (UTC)
 *
 * Extras:
 * - MAX_FUTURE_DAYS (env) limita quantos dias no futuro pode importar (padrão: 7)
 * - MAX_RANGE_DAYS (env) limite do range por execução (padrão: 400)
 */
const GLOBAL_MIN_DATE = "2022-06-07";

const ENV_GLOBAL_MAX_DATE = String(process.env.GLOBAL_MAX_DATE || "").trim(); // opcional
const MAX_FUTURE_DAYS = Number.isFinite(Number(process.env.MAX_FUTURE_DAYS))
  ? Number(process.env.MAX_FUTURE_DAYS)
  : 7;

const MAX_RANGE_DAYS = Number.isFinite(Number(process.env.MAX_RANGE_DAYS))
  ? Number(process.env.MAX_RANGE_DAYS)
  : 400;

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

function todayUTCDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Resolve o max global:
 * - se env GLOBAL_MAX_DATE válida => usa ela
 * - senão => hoje (UTC)
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
  return todayUTCDate();
}

function normLotteryKey(v) {
  return String(v || "PT_RIO").trim().toUpperCase() || "PT_RIO";
}

/**
 * Uso:
 *  node archive_backend/backend/scripts/importKingRange.js 2025-12-01 2025-12-29 PT_RIO
 *  node archive_backend/backend/scripts/importKingRange.js 2025 PT_RIO
 */
async function main() {
  const a1 = process.argv[2];
  const a2 = process.argv[3];
  const a3 = process.argv[4];

  let start = null;
  let end = null;
  let lotteryKey = "PT_RIO";

  // ====== MODO ANO ======
  const year = parseYear(a1);
  if (year) {
    start = `${year}-01-01`;
    end = `${year}-12-31`;
    lotteryKey = normLotteryKey(a2);
  } else {
    // ====== MODO DATAS ======
    start = String(a1 || "").trim();
    end = String(a2 || "").trim();
    lotteryKey = normLotteryKey(a3);
  }

  let d1 = parseDate(start);
  let d2 = parseDate(end);

  if (!d1 || !d2) {
    console.error(
      "Uso:\n" +
        "  node archive_backend/backend/scripts/importKingRange.js YYYY-MM-DD YYYY-MM-DD [PT_RIO]\n" +
        "ou:\n" +
        "  node archive_backend/backend/scripts/importKingRange.js YYYY [PT_RIO]"
    );
    process.exit(1);
  }

  if (d1.getTime() > d2.getTime()) {
    console.error("ERRO: data inicial maior que data final.");
    process.exit(1);
  }

  // ====== RECORTE PELO RANGE GLOBAL ======
  const gMin = parseDate(GLOBAL_MIN_DATE);
  if (!gMin) {
    console.error(
      `ERRO: GLOBAL_MIN_DATE inválida: "${GLOBAL_MIN_DATE}". Use YYYY-MM-DD.`
    );
    process.exit(1);
  }

  const gMax = resolveGlobalMaxDate();

  // segurança contra futuro absurdo (ex.: usuário passou 2030 sem querer)
  const today = todayUTCDate();
  const futureDays = daysBetweenUTC(today, d2);
  if (futureDays > MAX_FUTURE_DAYS) {
    console.error(
      `ERRO: data final muito no futuro (${fmt(d2)}). ` +
        `Máximo permitido: hoje(UTC=${fmt(today)}) + ${MAX_FUTURE_DAYS} dias. ` +
        `Ajuste MAX_FUTURE_DAYS ou use um intervalo real.`
    );
    process.exit(1);
  }

  // Se o intervalo estiver totalmente antes do mínimo (não deveria) ou totalmente após o máximo
  if (d2 < gMin || d1 > gMax) {
    console.error(
      `[ABORTADO] Intervalo fora do range global (${GLOBAL_MIN_DATE} → ${fmt(gMax)}).`
    );
    process.exit(0);
  }

  // recorta dentro do global
  if (d1 < gMin) d1 = gMin;
  if (d2 > gMax) d2 = gMax;

  const totalDays = daysBetweenUTC(d1, d2) + 1;

  if (totalDays > MAX_RANGE_DAYS) {
    console.error(
      `ERRO: range muito grande (${totalDays} dias). ` +
        `Limite atual: ${MAX_RANGE_DAYS}. ` +
        `Ajuste MAX_RANGE_DAYS no env se quiser.`
    );
    process.exit(1);
  }

  console.log(
    `[RANGE] ${lotteryKey} de ${fmt(d1)} até ${fmt(d2)} (${totalDays} dias)` +
      ` | globalMin=${GLOBAL_MIN_DATE}` +
      ` | globalMax=${fmt(gMax)}${ENV_GLOBAL_MAX_DATE ? " (fixado por ENV)" : " (dinâmico/hoje UTC)"}`
  );

  let days = 0;
  let ok = 0;
  let fail = 0;

  const importApostasPath = path.join(__dirname, "importKingApostas.js");
  if (!fs.existsSync(importApostasPath)) {
    console.error(`ERRO: script não encontrado: ${importApostasPath}`);
    process.exit(1);
  }

  // Loop inclusivo
  for (let dt = d1; dt.getTime() <= d2.getTime(); dt = addDays(dt, 1)) {
    const date = fmt(dt);
    days++;

    console.log(`\n[DAY ${days}/${totalDays}] ${date} (${lotteryKey})`);

    const r = spawnSync(process.execPath, [importApostasPath, date, lotteryKey], {
      stdio: "inherit",
    });

    const isOk = r && r.status === 0;

    if (isOk) {
      ok++;
    } else {
      fail++;

      const statusStr =
        r && typeof r.status === "number" ? `status=${r.status}` : "status=null";
      const signalStr = r && r.signal ? ` signal=${r.signal}` : "";

      console.error(`[FALHA] ${date} (${lotteryKey}) - ${statusStr}${signalStr}`);

      if (r?.error) {
        console.error(
          `[FALHA] ${date} (${lotteryKey}) - spawn error: ${r.error.message || r.error}`
        );
      }
    }
  }

  console.log("\n==================================");
  console.log(`[RESUMO] dias=${days} ok=${ok} falhas=${fail}`);
  console.log("==================================");

  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO:", e?.message || e);
  process.exit(1);
});
