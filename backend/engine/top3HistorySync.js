"use strict";

const {
  getDb,
} = require("../service/firebaseAdmin");

const {
  readMetadata,
  writeMetadata,
  upsertHistoryMonth,
  deduplicateDraws,
  readCompactManifest,
  writeCompactManifest,
  upsertCompactHistoryYear,
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
    const snapshots = await Promise.all(
      targetDrawIds.map(
        (drawId) =>
          database
            .collection("draws")
            .doc(drawId)
            .get()
      )
    );

    docs.push(
      ...snapshots.filter(
        (snap) => snap.exists
      )
    );
  } else if (date) {
    const snap = await database
      .collection("draws")
      .where("lottery_key", "==", lotteryKey)
      .where("ymd", "==", date)
      .get();

    docs.push(...snap.docs);
  }

  const loadedDraws = await Promise.all(
    docs.map(
      (doc) =>
        readDrawWithPrizes(
          database,
          doc
        )
    )
  );

  const draws = loadedDraws.filter((draw) => {
    if (!draw) {
      return false;
    }

    const drawLotteryKey = normalizeLotteryKey(
      draw.lottery_key ||
      draw.lotteryKey
    );

    if (drawLotteryKey !== lotteryKey) {
      return false;
    }

    if (
      date &&
      String(draw.ymd || draw.date || "") !== date
    ) {
      return false;
    }

    return true;
  });

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

  const saveMetadata =
    dependencies.writeMetadata ||
    writeMetadata;

  const loadCompactManifest =
    dependencies.readCompactManifest ||
    readCompactManifest;

  const saveCompactManifest =
    dependencies.writeCompactManifest ||
    writeCompactManifest;

  const saveCompactYear =
    dependencies.upsertCompactHistoryYear ||
    upsertCompactHistoryYear;

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

    const compactManifestResult =
      await loadCompactManifest(
        lotteryKey,
        dependencies.repositoryDependencies || {}
      );

    const compactManifest =
      compactManifestResult?.data || null;

    const compactReady =
      compactManifestResult?.exists === true &&
      compactManifest?.status === "complete";

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
        previousDrawCount:
          Number(
            payload?.previousDrawCount || 0
          ),
        firstYmd:
          payload?.firstYmd || null,
        lastYmd:
          payload?.lastYmd || null,
        firstDrawId:
          payload?.firstDrawId || null,
        lastDrawId:
          payload?.lastDrawId || null,
      });
    }

    const metadataMonths = safeArray(
      metadata?.months
    )
      .map((value) =>
        String(value || "").trim()
      )
      .filter(Boolean);

    const monthSet = new Set(
      metadataMonths
    );

    for (const item of updatedMonths) {
      monthSet.add(item.yearMonth);
    }

    const orderedMonths =
      Array.from(monthSet).sort();

    const totalDelta =
      updatedMonths.reduce(
        (total, item) =>
          total +
          Number(item.drawCount || 0) -
          Number(
            item.previousDrawCount || 0
          ),
        0
      );

    const totalDraws = Math.max(
      0,
      Number(metadata?.totalDraws || 0) +
      totalDelta
    );

    const firstCandidates = [
      metadata?.firstYmd
        ? {
            ymd: metadata.firstYmd,
            drawId:
              metadata.firstDrawId || null,
          }
        : null,
      ...updatedMonths.map((item) =>
        item.firstYmd
          ? {
              ymd: item.firstYmd,
              drawId:
                item.firstDrawId || null,
            }
          : null
      ),
    ]
      .filter(Boolean)
      .sort((a, b) =>
        String(a.ymd)
          .localeCompare(String(b.ymd))
      );

    const lastCandidates = [
      metadata?.lastYmd
        ? {
            ymd: metadata.lastYmd,
            drawId:
              metadata.lastDrawId || null,
          }
        : null,
      ...updatedMonths.map((item) =>
        item.lastYmd
          ? {
              ymd: item.lastYmd,
              drawId:
                item.lastDrawId || null,
            }
          : null
      ),
    ]
      .filter(Boolean)
      .sort((a, b) =>
        String(a.ymd)
          .localeCompare(String(b.ymd))
      );

    const first =
      firstCandidates[0] || null;

    const last =
      lastCandidates[
        lastCandidates.length - 1
      ] || null;

    const summary = {
      totalDraws,
      monthCount:
        orderedMonths.length,
      months:
        orderedMonths,
      firstYmd:
        first?.ymd || null,
      lastYmd:
        last?.ymd || null,
      firstDrawId:
        first?.drawId || null,
      lastDrawId:
        last?.drawId || null,
    };

    let compactUpdated = false;
    let compactError = null;
    const updatedCompactYears = [];

    if (compactReady) {
      try {
        const byYear = new Map();

        for (const draw of draws) {
          const year = draw.ymd.slice(0, 4);

          if (!byYear.has(year)) {
            byYear.set(year, []);
          }

          byYear.get(year).push(draw);
        }

        for (
          const [year, yearDraws]
          of byYear.entries()
        ) {
          const payload =
            await saveCompactYear(
              lotteryKey,
              year,
              yearDraws,
              dependencies.repositoryDependencies || {}
            );

          updatedCompactYears.push({
            year,
            drawCount:
              Number(payload?.drawCount || 0),
            previousDrawCount:
              Number(
                payload?.previousDrawCount || 0
              ),
          });
        }

        const compactYears = Array.from(
          new Set(
            orderedMonths.map(
              (month) =>
                String(month).slice(0, 4)
            )
          )
        ).sort();

        await saveCompactManifest(
          lotteryKey,
          {
            status: "complete",
            totalDraws:
              summary.totalDraws,
            yearCount:
              compactYears.length,
            years:
              compactYears,
            firstYmd:
              summary.firstYmd,
            lastYmd:
              summary.lastYmd,
            firstDrawId:
              summary.firstDrawId,
            lastDrawId:
              summary.lastDrawId,
            source:
              "bootstrap_plus_incremental",
            incrementalUpdatedAt:
              new Date().toISOString(),
            staleReason: null,
            staleAt: null,
          },
          dependencies.repositoryDependencies || {}
        );

        compactUpdated = true;
      } catch (error) {
        compactError = String(
          error?.message ||
          error ||
          "compact_incremental_failed"
        );

        console.warn(
          "[TOP3-HISTORY] Compacto incremental falhou; " +
          "a leitura mensal continuará disponível:",
          compactError
        );

        try {
          await saveCompactManifest(
            lotteryKey,
            {
              status: "stale",
              staleReason:
                compactError,
              staleAt:
                new Date().toISOString(),
            },
            dependencies.repositoryDependencies || {}
          );
        } catch (manifestError) {
          console.warn(
            "[TOP3-HISTORY] Falha ao marcar compacto como stale:",
            manifestError?.message ||
            manifestError
          );
        }
      }
    }

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
      compactReady,
      compactUpdated,
      compactError,
      updatedCompactYears,
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
