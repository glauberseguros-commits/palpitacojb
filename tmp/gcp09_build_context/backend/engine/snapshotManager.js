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


async function fetchNewDrawsAfter(db, lottery, lastProcessedDrawId, limit = 25) {
  if (!lastProcessedDrawId) {
    return {
      requiresBootstrap: true,
      draws: [],
    };
  }

  const admin = require("firebase-admin");
  const DOC_ID = admin.firestore.FieldPath.documentId();

  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", String(lottery).toUpperCase())
    .orderBy(DOC_ID, "asc")
    .startAfter(String(lastProcessedDrawId))
    .limit(limit)
    .get();

  return {
    requiresBootstrap: false,
    draws: snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })),
  };
}

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

  const pending = await fetchNewDrawsAfter(
    db,
    lottery,
    lastProcessedDrawId,
    25
  );

  await writeSnapshotMetadata(lottery, {
    lastKnownMinYmd: bounds?.minYmd || null,
    lastKnownMaxYmd: bounds?.maxYmd || null,
    latestDrawId,
    lastCheckAt: new Date().toISOString(),
    pendingIncrementalEngine: true,
    pendingNewDrawsCount: pending.draws.length,
    requiresBootstrap: pending.requiresBootstrap,
  });

  return {
    ok: true,
    lottery,
    mode: pending.requiresBootstrap
      ? "bootstrap_required"
      : force
      ? "force_pending"
      : "incremental_pending",
    bounds,
    snapshot: current.data || null,
    metadata,
    pendingNewDraws: pending.draws,
    pendingNewDrawsCount: pending.draws.length,
    requiresBootstrap: pending.requiresBootstrap,
    processed: 0,
    nextStep: pending.requiresBootstrap
      ? "IMPLEMENT_BOOTSTRAP_SNAPSHOT"
      : "IMPLEMENT_APPLY_NEW_DRAWS",
  };
}

module.exports = {
  updateSnapshot,
};
