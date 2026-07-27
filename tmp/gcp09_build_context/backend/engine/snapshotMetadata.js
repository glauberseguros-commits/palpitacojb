const {
  getAdminDb,
} = require("./statisticsEngine");

function metadataRef(db, lottery) {
  return db
    .collection("statistics")
    .doc(String(lottery).toUpperCase())
    .collection("snapshots")
    .doc("metadata");
}

async function readSnapshotMetadata(lottery = "PT_RIO") {
  const db = getAdminDb();

  const snap = await metadataRef(db, lottery).get();

  return snap.exists ? snap.data() : null;
}

async function writeSnapshotMetadata(
  lottery = "PT_RIO",
  data = {}
) {
  const db = getAdminDb();

  await metadataRef(db, lottery).set(
    {
      ...data,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

module.exports = {
  readSnapshotMetadata,
  writeSnapshotMetadata,
};
