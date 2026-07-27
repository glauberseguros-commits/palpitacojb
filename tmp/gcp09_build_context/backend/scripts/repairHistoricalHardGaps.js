"use strict";

const { runImport } = require("./importKingApostas");

const HARD_GAPS = [
  { date: "2024-02-25", hours: ["09:00"] },
  { date: "2024-03-03", hours: ["09:00"] },
  { date: "2024-03-10", hours: ["09:00"] },
  { date: "2024-03-17", hours: ["09:00"] },
  { date: "2024-03-24", hours: ["09:00"] },
  { date: "2024-03-31", hours: ["09:00"] },
  { date: "2024-04-07", hours: ["09:00"] },
  { date: "2026-03-18", hours: ["21:00"] },
  { date: "2026-03-24", hours: ["14:00", "16:00", "18:00", "21:00"] },
];

async function main() {
  const onlyDate = String(process.argv[2] || "").trim();

  const targets = onlyDate
    ? HARD_GAPS.filter((x) => x.date === onlyDate)
    : HARD_GAPS;

  if (!targets.length) {
    console.log("Nenhum gap HARD encontrado para o filtro informado.");
    process.exit(0);
  }

  const summary = [];

  for (const item of targets) {
    for (const hour of item.hours) {
      console.log(`\n[REPAIR] PT_RIO ${item.date} ${hour}`);

      try {
        const r = await runImport({
          date: item.date,
          lotteryKey: "PT_RIO",
          closeHour: hour,
        });

        summary.push({
          date: item.date,
          hour,
          ok: true,
          blocked: !!r?.blocked,
          blockedReason: r?.blockedReason || null,
          captured: !!r?.captured,
          apiHasPrizes: r?.apiHasPrizes ?? null,
          alreadyCompleteAny: r?.alreadyCompleteAny ?? null,
          alreadyCompleteAll: r?.alreadyCompleteAll ?? null,
          writeCount: r?.writeCount ?? null,
          savedCount: r?.savedCount ?? null,
        });

        console.log(
          `[OK] blocked=${!!r?.blocked} reason=${r?.blockedReason || "-"} captured=${!!r?.captured} writeCount=${r?.writeCount ?? "-"} savedCount=${r?.savedCount ?? "-"}`
        );
      } catch (e) {
        summary.push({
          date: item.date,
          hour,
          ok: false,
          error: String(e?.message || e || "unknown"),
        });

        console.error(`[ERR] ${item.date} ${hour} -> ${String(e?.message || e || "unknown")}`);
      }
    }
  }

  console.log("\n===== SUMMARY =====");
  console.table(summary);
}

main().catch((e) => {
  console.error("ERRO FATAL:", e?.message || e);
  process.exit(1);
});
