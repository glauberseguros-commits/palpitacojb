"use strict";

const {
  getDb,
} = require("../service/firebaseAdmin");

const {
  readMetadata,
  writeMetadata,
  upsertHistoryMonth,
  listHistoryMonths,
  deduplicateDraws,
} = require("./top3HistoryRepository");

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function normalizeLotteryKey(value) {
  return String(value || "PT_RIO")
    .trim()
    .toUpperCase() || "PT_RIO";
}

function validYmd(value) {
  const ymd = String(value || "").trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(ymd)
    ? ymd
    : null;
}

function resolveDb(dependencies = {}) {
  return dependencies.db || getDb();
}

async function readDrawWithPrizes(
  database,
  drawDoc
) {
  if (!drawDoc || !drawDoc.exists) {
    return null;
  }

  const data = drawDoc.data() || {};

  const prizesSnap = await drawDoc.ref
    .collection("prizes")
    .get();

  const prizes = prizesSnap.docs.map(
    (doc) => ({
      id: doc.id,
      ...(doc.data() || {}),
    })
  );

  return {
    id: drawDoc.id,
    drawId: drawDoc.id,
    ...data,
    prizes,
  };
}

async function loadImportedDraws(
  importResult = {},
  dependencies = {}
) {
  const database = resolveDb(dependencies);

  const lotteryKey = normalizeLotteryKey(
    importResult.lotteryKey
  );

  const date = validYmd(
    importResult.date
  );

  const targetDrawIds = safeArray(
    importResult.targetDrawIds
  )
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const docs = [];

  if (targetDrawIds.length) {
    for (const drawId of targetDrawIds) {
      const snap = await database
        .collection("draws")
        .doc(drawId)
        .get();

      if (snap.exists) {
        docs.push(snap);
      }
    }
  } else if (date) {
    const snap = await database
      .collection("draws")
      .where("lottery_key", "==", lotteryKey)
      .where("ymd", "==", date)
      .get();

    docs.push(...snap.docs);
  }

  const draws = [];

  for (const doc of docs) {
    const draw = await readDrawWithPrizes(
      database,
      doc
    );

    if (!draw) {
      continue;
    }

    const drawLotteryKey = normalizeLotteryKey(
      draw.lottery_key ||
      draw.lotteryKey
    );

    if (drawLotteryKey !== lotteryKey) {
      continue;
    }

    if (
      date &&
      String(draw.ymd || draw.date || "") !== date
    ) {
      continue;
    }

    draws.push(draw);
  }

  return deduplicateDraws(draws);
}

function summarizeMonths(months = []) {
  const ordered = [...safeArray(months)]
    .sort((a, b) =>
      String(a.yearMonth || a.id)
        .localeCompare(
          String(b.yearMonth || b.id)
        )
    );

  const allDraws = deduplicateDraws(
    ordered.flatMap(
      (month) =>
        safeArray(month.draws)
    )
  );

  const first = allDraws[0] || null;
  const last =
    allDraws[allDraws.length - 1] || null;

  return {
    totalDraws: allDraws.length,
    monthCount: ordered.length,
    months: ordered.map(
      (month) =>
        month.yearMonth || month.id
    ),
    firstYmd: first?.ymd || null,
    lastYmd: last?.ymd || null,
    firstDrawId:
      first?.drawId || null,
    lastDrawId:
      last?.drawId || null,
  };
}

async function markHistoryStale(
  lotteryKey,
  error,
  dependencies = {}
) {
  const saveMetadata =
    dependencies.writeMetadata ||
    writeMetadata;

  try {
    await saveMetadata(
      lotteryKey,
      {
        bootstrapStatus: "stale",
        staleReason:
          String(
            error?.message ||
            error ||
            "incremental_sync_failed"
          ),
        staleAt:
          new Date().toISOString(),
      },
      dependencies.repositoryDependencies || {}
    );

    return true;
  } catch (metadataError) {
    console.error(
      "[TOP3-HISTORY] Falha também ao marcar snapshot como stale:",
      metadataError?.message ||
      metadataError
    );

    return false;
  }
}

async function syncImportedResultToTop3History(
  importResult = {},
  dependencies = {}
) {
  const lotteryKey = normalizeLotteryKey(
    importResult.lotteryKey
  );

  const loadMetadata =
    dependencies.readMetadata ||
    readMetadata;

  const saveMonth =
    dependencies.upsertHistoryMonth ||
    upsertHistoryMonth;

  const loadMonths =
    dependencies.listHistoryMonths ||
    listHistoryMonths;

  const saveMetadata =
    dependencies.writeMetadata ||
    writeMetadata;

  try {
    if (
      importResult.blocked === true ||
      !validYmd(importResult.date)
    ) {
      return {
        ok: true,
        skipped: true,
        reason:
          importResult.blocked === true
            ? "import_blocked"
            : "invalid_date",
      };
    }

    const metadataResult = await loadMetadata(
      lotteryKey,
      dependencies.repositoryDependencies || {}
    );

    const metadata =
      metadataResult?.data || null;

    if (
      metadataResult?.exists !== true ||
      metadata?.bootstrapStatus !== "complete"
    ) {
      return {
        ok: true,
        skipped: true,
        reason: "bootstrap_not_complete",
      };
    }

    const draws = await (
      dependencies.loadImportedDraws ||
      loadImportedDraws
    )(
      importResult,
      dependencies
    );

    if (!draws.length) {
      return {
        ok: true,
        skipped: true,
        reason: "no_draws_found",
      };
    }

    const byMonth = new Map();

    for (const draw of draws) {
      const yearMonth = draw.ymd.slice(0, 7);

      if (!byMonth.has(yearMonth)) {
        byMonth.set(yearMonth, []);
      }

      byMonth.get(yearMonth).push(draw);
    }

    const updatedMonths = [];

    for (
      const [yearMonth, monthDraws]
      of byMonth.entries()
    ) {
      const payload = await saveMonth(
        lotteryKey,
        yearMonth,
        monthDraws,
        dependencies.repositoryDependencies || {}
      );

      updatedMonths.push({
        yearMonth,
        drawCount:
          Number(payload?.drawCount || 0),
      });
    }

    const months = await loadMonths(
      lotteryKey,
      dependencies.repositoryDependencies || {}
    );

    const summary = summarizeMonths(months);

    await saveMetadata(
      lotteryKey,
      {
        bootstrapStatus: "complete",
        incrementalUpdatedAt:
          new Date().toISOString(),
        totalDraws:
          summary.totalDraws,
        monthCount:
          summary.monthCount,
        months:
          summary.months,
        firstYmd:
          summary.firstYmd,
        lastYmd:
          summary.lastYmd,
        firstDrawId:
          summary.firstDrawId,
        lastDrawId:
          summary.lastDrawId,
        lastProcessedDrawId:
          summary.lastDrawId,
        staleReason: null,
        staleAt: null,
        source:
          "bootstrap_plus_incremental",
      },
      dependencies.repositoryDependencies || {}
    );

    console.log(
      `[TOP3-HISTORY] Incremental OK | ${lotteryKey} | ` +
      `draws=${draws.length} | meses=${updatedMonths
        .map((item) => item.yearMonth)
        .join(",")}`
    );

    return {
      ok: true,
      skipped: false,
      lotteryKey,
      importedDraws: draws.length,
      updatedMonths,
      ...summary,
    };
  } catch (error) {
    console.error(
      "[TOP3-HISTORY] Incremental falhou:",
      error?.stack ||
      error?.message ||
      error
    );

    const markedStale = await markHistoryStale(
      lotteryKey,
      error,
      dependencies
    );

    return {
      ok: false,
      skipped: false,
      lotteryKey,
      markedStale,
      error:
        String(
          error?.message ||
          error ||
          "incremental_sync_failed"
        ),
    };
  }
}

module.exports = {
  readDrawWithPrizes,
  loadImportedDraws,
  summarizeMonths,
  markHistoryStale,
  syncImportedResultToTop3History,
};
