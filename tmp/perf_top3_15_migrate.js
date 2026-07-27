"use strict";

const {
  readLegacyFullHistory,
  writeCompactHistoryYear,
  writeCompactManifest,
  deduplicateDraws,
} = require("../backend/engine/top3HistoryRepository");

async function main() {
  const lotteryKey =
    String(process.argv[2] || "PT_RIO")
      .trim()
      .toUpperCase();

  console.log(
    `Migrando histórico compacto: ${lotteryKey}`
  );

  const legacy = await readLegacyFullHistory(
    lotteryKey
  );

  if (!legacy.length) {
    throw new Error(
      "Histórico mensal vazio."
    );
  }

  const byYear = new Map();

  for (const draw of legacy) {
    const year = String(draw.ymd).slice(0, 4);

    if (!byYear.has(year)) {
      byYear.set(year, []);
    }

    byYear.get(year).push(draw);
  }

  const years = [];

  for (
    const [year, draws]
    of [...byYear.entries()].sort(
      (a, b) =>
        a[0].localeCompare(b[0])
    )
  ) {
    const payload =
      await writeCompactHistoryYear(
        lotteryKey,
        year,
        draws
      );

    years.push({
      year,
      drawCount: payload.drawCount,
    });

    console.log(
      `[COMPACT] ${year}: ${payload.drawCount} draws`
    );
  }

  const normalized =
    deduplicateDraws(legacy);

  const first = normalized[0];
  const last =
    normalized[
      normalized.length - 1
    ];

  await writeCompactManifest(
    lotteryKey,
    {
      status: "complete",
      totalDraws:
        normalized.length,
      yearCount:
        years.length,
      years:
        years.map(
          (item) => item.year
        ),
      firstYmd:
        first?.ymd || null,
      lastYmd:
        last?.ymd || null,
      firstDrawId:
        first?.drawId || null,
      lastDrawId:
        last?.drawId || null,
      source:
        "perf_top3_15_migration",
      migratedAt:
        new Date().toISOString(),
    }
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        lotteryKey,
        totalDraws:
          normalized.length,
        years,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    error?.stack ||
    error?.message ||
    error
  );

  process.exit(1);
});
