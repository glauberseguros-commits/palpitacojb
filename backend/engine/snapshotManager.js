const { computeBounds } = require("../routes/bounds");
const {
  readStatisticsSnapshot,
  writeStatisticsSnapshot,
  getAdminDb,
} = require("./statisticsEngine");

const {
  readSnapshotMetadata,
  writeSnapshotMetadata,
} = require("./snapshotMetadata");

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

  // Metadata de controle incremental
  const metadata = await readSnapshotMetadata(lottery);

  const lastProcessedDrawId = metadata?.lastProcessedDrawId || null;
  const latestDrawId = bounds?.maxDocId || null;

  const upToDate =
    !force &&
    lastProcessedDrawId &&
    latestDrawId &&
    String(lastProcessedDrawId) === String(latestDrawId);

  if (upToDate) {
    return {
      ok: true,
      lottery,
      mode: "noop",
      reason: "snapshot_already_up_to_date",
      bounds,
      metadata,
      processed: 0,
    };
  }

  await writeSnapshotMetadata(lottery, {
    lastKnownMinYmd: bounds?.minYmd || null,
    lastKnownMaxYmd: bounds?.maxYmd || null,
    latestDrawId,
    lastCheckAt: new Date().toISOString(),
    pendingIncrementalEngine: true,
  });

  return {
    ok: true,
    lottery,
    mode: force ? "force_pending" : "incremental_pending",
    bounds,
    snapshot: current.data || null,
    metadata,
    processed: 0,
    nextStep: "IMPLEMENT_FETCH_NEW_DRAWS",
  };
}

module.exports = {
  updateSnapshot,
};
