const { computeBounds } = require("../routes/bounds");
const {
  readStatisticsSnapshot,
  writeStatisticsSnapshot,
  getAdminDb,
} = require("./statisticsEngine");

async function updateSnapshot({
  lottery = "PT_RIO",
  force = false,
} = {}) {

  const db = getAdminDb();

  // Bounds atuais do Firestore
  const { result: bounds } = await computeBounds(db, lottery);

  // Snapshot existente
  const current = await readStatisticsSnapshot({
    uf: lottery,
    scope: "dashboard_full",
  });

  return {
    ok: true,
    lottery,
    bounds,
    snapshot: current.data || null,
    force,
    nextStep: "IMPLEMENT_INCREMENTAL_ENGINE",
  };
}

module.exports = {
  updateSnapshot,
};
