"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * RANGE GLOBAL CONHECIDO DA BASE (draws)
 * Ajuste aqui se um dia o range global mudar.
 */
const GLOBAL_MIN_DATE = "2022-06-07";
const GLOBAL_MAX_DATE = "2026-01-10";

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
    lotteryKey = String(a2 || "PT_RIO").trim() || "PT_RIO";
  } else {
    // ====== MODO DATAS ======
    start = String(a1 || "").trim();
    end = String(a2 || "").trim();
    lotteryKey = String(a3 || "PT_RIO").trim() || "PT_RIO";
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
  const gMax = parseDate(GLOBAL_MAX_DATE);

  if (d2 < gMin || d1 > gMax) {
    console.error(
      `[ABORTADO] Intervalo fora do range da base (${GLOBAL_MIN_DATE} → ${GLOBAL_MAX_DATE}).`
    );
    process.exit(0);
  }

  if (d1 < gMin) d1 = gMin;
  if (d2 > gMax) d2 = gMax;

  const totalDays = daysBetweenUTC(d1, d2) + 1;

  if (totalDays > 400) {
    console.error(
      `ERRO: range muito grande (${totalDays} dias). ` +
        `Verifique os parâmetros (ou ajuste o limite no script).`
    );
    process.exit(1);
  }

  console.log(
    `[RANGE] ${lotteryKey} de ${fmt(d1)} até ${fmt(d2)} (${totalDays} dias)`
  );

  let days = 0;
  let ok = 0;
  let fail = 0;

  const importApostasPath = path.join(__dirname, "importKingApostas.js");

  if (!fs.existsSync(importApostasPath)) {
    console.error(
      `ERRO: script não encontrado: ${importApostasPath}`
    );
    process.exit(1);
  }

  // Loop inclusivo
  for (let dt = d1; dt.getTime() <= d2.getTime(); dt = addDays(dt, 1)) {
    const date = fmt(dt);
    days++;

    const r = spawnSync(
      process.execPath,
      [importApostasPath, date, lotteryKey],
      { stdio: "inherit" }
    );

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
          `[FALHA] ${date} (${lotteryKey}) - spawn error: ${
            r.error.message || r.error
          }`
        );
      }
    }
  }

  console.log("==================================");
  console.log(`[RESUMO] dias=${days} ok=${ok} falhas=${fail}`);
  console.log("==================================");

  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO:", e?.message || e);
  process.exit(1);
});
