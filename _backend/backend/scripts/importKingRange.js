"use strict";

const { spawnSync } = require("child_process");

function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // validação simples
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== (m - 1) || dt.getUTCDate() !== d) return null;
  return dt;
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

/**
 * Uso:
 *  node backend/scripts/importKingRange.js 2025-12-01 2025-12-29 PT_RIO
 */
async function main() {
  const start = process.argv[2];
  const end = process.argv[3];
  const lotteryKey = process.argv[4] || "PT_RIO";

  const d1 = parseDate(start);
  const d2 = parseDate(end);

  if (!d1 || !d2) {
    console.error("Uso: node backend/scripts/importKingRange.js YYYY-MM-DD YYYY-MM-DD [PT_RIO]");
    process.exit(1);
  }
  if (d1.getTime() > d2.getTime()) {
    console.error("ERRO: data inicial maior que data final.");
    process.exit(1);
  }

  console.log(`[RANGE] ${lotteryKey} de ${start} até ${end}`);

  let days = 0;
  let ok = 0;
  let fail = 0;

  for (let dt = d1; dt.getTime() <= d2.getTime(); dt = addDays(dt, 1)) {
    const date = fmt(dt);
    days++;

    const r = spawnSync(
      process.execPath,
      ["backend/scripts/importKingApostas.js", date, lotteryKey],
      { stdio: "inherit" }
    );

    if (r.status === 0) ok++;
    else fail++;
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
