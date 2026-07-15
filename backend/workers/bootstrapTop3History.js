"use strict";

const {
  fetchAllDrawsWithPrizes,
} = require("../engine/drawRepository");

const {
  normalizeLotteryKey,
  normalizeDraw,
  deduplicateDraws,
  writeHistoryMonth,
  writeMetadata,
  SCHEMA_VERSION,
} = require("../engine/top3HistoryRepository");

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_PRIZE_CONCURRENCY = 24;

/**
 * Margem abaixo do limite de 1 MiB do Firestore.
 * O bootstrap é interrompido antes de tentar gravar
 * um documento mensal excessivamente grande.
 */
const MAX_MONTH_DOCUMENT_BYTES = 850 * 1024;

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function estimateJsonBytes(value) {
  return Buffer.byteLength(
    JSON.stringify(value),
    "utf8"
  );
}

function groupDrawsByMonth(draws = []) {
  const grouped = new Map();

  for (const rawDraw of safeArray(draws)) {
    const draw = normalizeDraw(rawDraw);

    if (!draw) {
      continue;
    }

    const yearMonth = draw.ymd.slice(0, 7);

    if (!grouped.has(yearMonth)) {
      grouped.set(yearMonth, []);
    }

    grouped.get(yearMonth).push(draw);
  }

  const normalized = new Map();

  for (
    const [yearMonth, monthDraws]
    of grouped.entries()
  ) {
    normalized.set(
      yearMonth,
      deduplicateDraws(monthDraws)
    );
  }

  return normalized;
}

function buildBootstrapPlan({
  lotteryKey,
  draws,
} = {}) {
  const key = normalizeLotteryKey(
    lotteryKey
  );

  const normalizedDraws = deduplicateDraws(
    safeArray(draws)
  ).filter(
    (draw) =>
      draw.lotteryKey === key
  );

  const grouped = groupDrawsByMonth(
    normalizedDraws
  );

  const months = Array.from(
    grouped.keys()
  ).sort();

  const monthPlans = months.map(
    (yearMonth) => {
      const monthDraws =
        grouped.get(yearMonth) || [];

      const first =
        monthDraws[0] || null;

      const last =
        monthDraws[
          monthDraws.length - 1
        ] || null;

      const estimatedBytes =
        estimateJsonBytes({
          schemaVersion: SCHEMA_VERSION,
          lotteryKey: key,
          yearMonth,
          drawCount: monthDraws.length,
          firstYmd: first?.ymd || null,
          lastYmd: last?.ymd || null,
          firstDrawId:
            first?.drawId || null,
          lastDrawId:
            last?.drawId || null,
          draws: monthDraws,
        });

      return {
        yearMonth,
        draws: monthDraws,
        drawCount: monthDraws.length,
        firstYmd: first?.ymd || null,
        lastYmd: last?.ymd || null,
        firstDrawId:
          first?.drawId || null,
        lastDrawId:
          last?.drawId || null,
        estimatedBytes,
        withinSizeLimit:
          estimatedBytes <=
          MAX_MONTH_DOCUMENT_BYTES,
      };
    }
  );

  const oversizedMonths =
    monthPlans.filter(
      (month) =>
        !month.withinSizeLimit
    );

  const first =
    normalizedDraws[0] || null;

  const last =
    normalizedDraws[
      normalizedDraws.length - 1
    ] || null;

  return {
    lotteryKey: key,
    draws: normalizedDraws,
    totalDraws:
      normalizedDraws.length,
    months,
    monthPlans,
    oversizedMonths,
    firstYmd:
      first?.ymd || null,
    lastYmd:
      last?.ymd || null,
    firstDrawId:
      first?.drawId || null,
    lastDrawId:
      last?.drawId || null,
  };
}

async function bootstrapTop3History(
  options = {},
  dependencies = {}
) {
  const lotteryKey =
    normalizeLotteryKey(
      options.lotteryKey ||
      "PT_RIO"
    );

  const dryRun =
    options.dryRun !== false;

  const fetchDraws =
    dependencies.fetchDraws ||
    fetchAllDrawsWithPrizes;

  const persistMonth =
    dependencies.writeHistoryMonth ||
    writeHistoryMonth;

  const persistMetadata =
    dependencies.writeMetadata ||
    writeMetadata;

  const startedAt = Date.now();

  console.log(
    `[TOP3-HISTORY] Iniciando bootstrap ${lotteryKey} | dryRun=${dryRun}`
  );

  const rawDraws = await fetchDraws({
    lottery: lotteryKey,
    pageSize: Number(
      options.pageSize ||
      DEFAULT_PAGE_SIZE
    ),
    prizeConcurrency: Number(
      options.prizeConcurrency ||
      DEFAULT_PRIZE_CONCURRENCY
    ),
  });

  const plan = buildBootstrapPlan({
    lotteryKey,
    draws: rawDraws,
  });

  if (!plan.totalDraws) {
    throw new Error(
      `Nenhum draw válido encontrado para ${lotteryKey}.`
    );
  }

  if (plan.oversizedMonths.length) {
    const details =
      plan.oversizedMonths
        .map(
          (month) =>
            `${month.yearMonth}=${month.estimatedBytes} bytes`
        )
        .join(", ");

    throw new Error(
      "Bootstrap bloqueado: documento mensal acima do limite seguro. " +
      details
    );
  }

  console.log(
    `[TOP3-HISTORY] Draws=${plan.totalDraws} | meses=${plan.months.length}`
  );

  for (const month of plan.monthPlans) {
    console.log(
      `[TOP3-HISTORY] ${month.yearMonth} | draws=${month.drawCount} | bytes≈${month.estimatedBytes}`
    );
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      lotteryKey,
      totalDraws:
        plan.totalDraws,
      months:
        plan.months,
      monthCount:
        plan.months.length,
      firstYmd:
        plan.firstYmd,
      lastYmd:
        plan.lastYmd,
      firstDrawId:
        plan.firstDrawId,
      lastDrawId:
        plan.lastDrawId,
      oversizedMonths: [],
      tookMs:
        Date.now() - startedAt,
    };
  }

  for (const month of plan.monthPlans) {
    await persistMonth(
      lotteryKey,
      month.yearMonth,
      month.draws,
      dependencies
    );

    console.log(
      `[TOP3-HISTORY] Gravado ${month.yearMonth}: ${month.drawCount} draws`
    );
  }

  const completedAt =
    new Date().toISOString();

  const metadata =
    await persistMetadata(
      lotteryKey,
      {
        bootstrapStatus:
          "complete",
        bootstrapCompletedAt:
          completedAt,
        totalDraws:
          plan.totalDraws,
        monthCount:
          plan.months.length,
        months:
          plan.months,
        firstYmd:
          plan.firstYmd,
        lastYmd:
          plan.lastYmd,
        firstDrawId:
          plan.firstDrawId,
        lastDrawId:
          plan.lastDrawId,
        lastProcessedDrawId:
          plan.lastDrawId,
        source:
          "fetchAllDrawsWithPrizes",
      },
      dependencies
    );

  return {
    ok: true,
    dryRun: false,
    lotteryKey,
    totalDraws:
      plan.totalDraws,
    months:
      plan.months,
    monthCount:
      plan.months.length,
    firstYmd:
      plan.firstYmd,
    lastYmd:
      plan.lastYmd,
    firstDrawId:
      plan.firstDrawId,
    lastDrawId:
      plan.lastDrawId,
    metadata,
    tookMs:
      Date.now() - startedAt,
  };
}

function parseCliArgs(argv = []) {
  const lotteryKey =
    String(argv[0] || "PT_RIO")
      .trim()
      .toUpperCase();

  const flags = new Set(
    argv.slice(1).map(
      (value) =>
        String(value)
          .trim()
          .toLowerCase()
    )
  );

  const commit =
    flags.has("--commit");

  return {
    lotteryKey,
    dryRun: !commit,
  };
}

async function main() {
  const options = parseCliArgs(
    process.argv.slice(2)
  );

  console.log("");
  console.log(
    "===== TOP3 HISTORY BOOTSTRAP ====="
  );
  console.log(
    "Loteria:",
    options.lotteryKey
  );
  console.log(
    "Modo....:",
    options.dryRun
      ? "DRY-RUN"
      : "COMMIT"
  );
  console.log("");

  const result =
    await bootstrapTop3History(
      options
    );

  console.log("");
  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      "ERRO:",
      error?.stack ||
      error?.message ||
      error
    );

    process.exit(1);
  });
}

module.exports = {
  MAX_MONTH_DOCUMENT_BYTES,
  estimateJsonBytes,
  groupDrawsByMonth,
  buildBootstrapPlan,
  bootstrapTop3History,
  parseCliArgs,
};
