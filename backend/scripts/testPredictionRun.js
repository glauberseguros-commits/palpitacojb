"use strict";

// TODO:
// Migrar este script para utilizar o Score Engine unificado.
// O ScoreEngineV1 será descontinuado após a integração completa.
// TODO:
// Migrar este script para utilizar o Score Engine unificado.
// O ScoreEngineV1 será descontinuado após a integração completa.
const { rankingToPredictions } = require("../engine/scoreEngineV1");
const { createPredictionRun } = require("../engine/predictionService");

async function main() {

  const ranking = [
    { grupo: "16", animal: "Leão", total: 42 },
    { grupo: "19", animal: "Pavão", total: 31 },
    { grupo: "07", animal: "Carneiro", total: 18 },
    { grupo: "03", animal: "Burro", total: 15 },
    { grupo: "09", animal: "Cobra", total: 12 }
  ];

  const predictions = rankingToPredictions(ranking, {
    limit: 5,
  });

  const result = await createPredictionRun({
    lotteryKey: "PT_RIO",
    date: "2026-07-04",
    closeHour: "14:00",
    source: "integration-test",
    algorithm: "score_engine_unified_preview",
    metadata: {
      version: 2,
      createdBy: "integration-test"
    },
    predictions,
  });

  console.log("==================================");
  console.log("Prediction Run gravado com sucesso");
  console.log("==================================");
  console.log(result.run.id);
  console.log("Predictions:", result.predictions.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
