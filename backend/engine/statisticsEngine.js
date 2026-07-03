const admin = require("firebase-admin");

function getAdminDb() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  return admin.firestore();
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeUfKey(uf) {
  return String(uf || "PT_RIO").trim().toUpperCase() || "PT_RIO";
}

function snapshotRef(db, uf, scope = "dashboard_full") {
  return db
    .collection("statistics")
    .doc(normalizeUfKey(uf))
    .collection("snapshots")
    .doc(scope);
}

async function readStatisticsSnapshot({ uf = "PT_RIO", scope = "dashboard_full" } = {}) {
  const db = getAdminDb();
  const snap = await snapshotRef(db, uf, scope).get();

  if (!snap.exists) {
    return { exists: false, data: null };
  }

  return { exists: true, data: snap.data() };
}

async function writeStatisticsSnapshot({
  uf = "PT_RIO",
  scope = "dashboard_full",
  data,
} = {}) {
  const db = getAdminDb();

  const payload = {
    ...data,
    uf: normalizeUfKey(uf),
    scope,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await snapshotRef(db, uf, scope).set(payload, { merge: true });

  return payload;
}

module.exports = {
  getAdminDb,
  safeArray,
  normalizeUfKey,
  readStatisticsSnapshot,
  writeStatisticsSnapshot,
};
