"use strict";

const {
  createTop3PredictionRun,
} = require("../backend/engine/top3PredictionService");

const {
  computeStatisticalTop3V3,
  loadTop3PublicApi,
} = require("../backend/engine/scoreEngineUnified");

const {
  readMetadata,
  readFullHistory,
} = require("../backend/engine/top3HistoryRepository");

function ms(startedAt) {
  return Date.now() - startedAt;
}

async function main() {
  const totals = {
    metadataMs: 0,
    fullHistoryMs: 0,
    computeTop3Ms: 0,
    milharesCalls: [],
  };

  const publicApiOriginal = loadTop3PublicApi();

  const publicApiProfiled = {
    ...publicApiOriginal,

    build20MilharesForGrupo(args) {
      const startedAt = Date.now();

      const result =
        publicApiOriginal.build20MilharesForGrupo(args);

      const tookMs = ms(startedAt);

      totals.milharesCalls.push({
        grupo: Number(args?.grupo2 || 0),
        historyDraws: Array.isArray(args?.rangeDraws)
          ? args.rangeDraws.length
          : 0,
        tookMs,
      });

      console.log(
        `[PROFILE:MILHARES] grupo=${args?.grupo2}` +
        ` | draws=${Array.isArray(args?.rangeDraws) ? args.rangeDraws.length : 0}` +
        ` | took=${tookMs}ms`
      );

      return result;
    },
  };

  const startedTotal = Date.now();

  const result = await createTop3PredictionRun(
    {
      lotteryKey: "PT_RIO",
      date: "2026-07-24",
      closeHour: "09:00",
      historySource: "snapshot",
      dryRun: true,
      source: "perf-top3-08",
    },
    {
      publicApi: publicApiProfiled,

      async readHistoryMetadata(...args) {
        const startedAt = Date.now();
        const value = await readMetadata(...args);
        totals.metadataMs += ms(startedAt);

        console.log(
          `[PROFILE:METADATA] took=${totals.metadataMs}ms`
        );

        return value;
      },

      async readFullHistory(...args) {
        const startedAt = Date.now();
        const value = await readFullHistory(...args);
        totals.fullHistoryMs += ms(startedAt);

        console.log(
          `[PROFILE:HISTORY-LOAD] draws=${Array.isArray(value) ? value.length : 0}` +
          ` | took=${totals.fullHistoryMs}ms`
        );

        return value;
      },

      computeTop3(args) {
        const startedAt = Date.now();
        const value = computeStatisticalTop3V3(args);
        totals.computeTop3Ms += ms(startedAt);

        console.log(
          `[PROFILE:COMPUTE] draws=${Array.isArray(args?.drawsRange) ? args.drawsRange.length : 0}` +
          ` | took=${totals.computeTop3Ms}ms`
        );

        return value;
      },
    }
  );

  const milharesTotalMs =
    totals.milharesCalls.reduce(
      (sum, item) => sum + Number(item.tookMs || 0),
      0
    );

  const totalMs = ms(startedTotal);

  console.log("");
  console.log("===== PERF-TOP3-08 — RESUMO =====");
  console.log(JSON.stringify({
    ok: true,
    metadataMs: totals.metadataMs,
    fullHistoryMs: totals.fullHistoryMs,
    computeTop3Ms: totals.computeTop3Ms,
    milharesTotalMs,
    milharesCalls: totals.milharesCalls,
    totalMs,
    predictions: Array.isArray(result?.predictions)
      ? result.predictions.length
      : 0,
    publicSnapshot: Array.isArray(result?.publicSnapshot)
      ? result.publicSnapshot.length
      : 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(
    "ERRO PERF-TOP3-08:",
    error?.stack || error?.message || error
  );
  process.exit(1);
});
