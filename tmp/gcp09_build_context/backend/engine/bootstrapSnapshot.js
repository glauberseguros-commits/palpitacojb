"use strict";

const { fetchAllDrawsWithPrizes } = require("./drawRepository");
const { writeStatisticsSnapshot } = require("./statisticsEngine");

// Ajuste estes requires caso os arquivos estejam em outro caminho
const { buildRanking } = require("../../src/utils/buildRanking");
const { applyScoreEngine } = require("../../src/utils/scoreEngine");

async function bootstrapSnapshot(lottery = "PT_RIO") {

  const draws = await fetchAllDrawsWithPrizes({
    lottery,
    pageSize: 500,
  });

  console.log("Draws carregados:", draws.length);

  const built = buildRanking(draws);

  const ranking = Array.isArray(built?.ranking)
    ? built.ranking
    : [];

  const rankingScored = applyScoreEngine(ranking);

  await writeStatisticsSnapshot({
    uf: lottery,
    scope: "dashboard_full",
    data: {
      version: 1,
      totalDraws: built.totalDraws,
      uniqueDays: built.uniqueDays,
      totalOcorrencias: built.totalOcorrencias,
      countMode: built.countMode,
      ranking,
      rankingScored,
      top3: rankingScored.slice(0,3),
      integrityIssues: built.integrityIssues || [],
      generatedAt: new Date().toISOString(),
    },
  });

  return {
    draws: draws.length,
    ranking: ranking.length,
    top3: rankingScored.slice(0,3),
  };
}

module.exports = {
  bootstrapSnapshot,
};
