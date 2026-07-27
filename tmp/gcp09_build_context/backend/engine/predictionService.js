"use strict";

const {
  buildPredictionRun,
  buildPrediction,
} = require("./predictionModel");

const {
  savePredictionRun,
  savePredictions,
} = require("./predictionRepository");

/**
 * Cria uma execução completa de previsão.
 *
 * Entrada:
 * {
 *   lotteryKey,
 *   date,
 *   closeHour,
 *   source,
 *   algorithm,
 *   metadata,
 *   predictions:[]
 * }
 */
async function createPredictionRun(input = {}) {

  const run = buildPredictionRun({
    lotteryKey: input.lotteryKey,
    date: input.date,
    closeHour: input.closeHour,
    source: input.source,
    algorithm: input.algorithm,
    metadata: input.metadata,
  });

  await savePredictionRun(run);

  const rows = (input.predictions || []).map((p) =>
    buildPrediction({
      runId: run.id,
      ...p,
    })
  );

  if (rows.length) {
    await savePredictions(run.id, rows);
  }

  return {
    run,
    predictions: rows,
  };
}

module.exports = {
  createPredictionRun,
};
