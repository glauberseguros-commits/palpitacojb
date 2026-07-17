"use strict";

const { getDb } = require("../service/firebaseAdmin");

const RUNS = "prediction_runs";
const SUB = "predictions";

function db() {
  return getDb();
}

async function savePredictionRun(run) {
  if (!run || !run.id) {
    throw new Error("predictionRun.id obrigatório");
  }

  const ref = db().collection(RUNS).doc(run.id);

  await ref.set(
    {
      ...run,
      updatedAt: new Date(),
      createdAt: run.createdAt || new Date(),
    },
    { merge: true }
  );

  return ref;
}

async function savePrediction(runId, prediction) {
  if (!runId) {
    throw new Error("runId obrigatório");
  }

  const ref = db()
    .collection(RUNS)
    .doc(runId)
    .collection(SUB)
    .doc();

  await ref.set({
    ...prediction,
    id: ref.id,
    updatedAt: new Date(),
    createdAt: prediction.createdAt || new Date(),
  });

  return ref;
}

async function savePredictions(runId, predictions = []) {
  if (!runId) {
    throw new Error("runId obrigatório");
  }

  const rows = Array.isArray(predictions)
    ? predictions.slice(0, 3)
    : [];

  const database = db();

  const parent = database
    .collection(RUNS)
    .doc(runId)
    .collection(SUB);

  const existing = await parent.get();
  const batch = database.batch();
  const expectedIds = new Set();

  rows.forEach((prediction, index) => {
    const rankFromSignals = Number(
      prediction?.signals?.rankPosition
    );

    const rank = Number.isFinite(rankFromSignals)
      ? Math.max(1, Math.min(3, Math.trunc(rankFromSignals)))
      : index + 1;

    const predictionId =
      `rank_${String(rank).padStart(2, "0")}`;

    expectedIds.add(predictionId);

    const ref = parent.doc(predictionId);

    batch.set(
      ref,
      {
        ...prediction,
        id: predictionId,
        updatedAt: new Date(),
        createdAt:
          prediction.createdAt || new Date(),
      },
      { merge: true }
    );
  });

  for (const doc of existing.docs) {
    if (!expectedIds.has(doc.id)) {
      batch.delete(doc.ref);
    }
  }

  await batch.commit();

  return rows.length;
}

async function loadPredictionRun(runId) {
  const snap = await db()
    .collection(RUNS)
    .doc(runId)
    .get();

  if (!snap.exists) {
    return null;
  }

  return snap.data();
}

module.exports = {
  savePredictionRun,
  savePrediction,
  savePredictions,
  loadPredictionRun,
};
