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
  const batch = db().batch();

  const parent = db()
    .collection(RUNS)
    .doc(runId)
    .collection(SUB);

  for (const prediction of predictions) {
    const ref = parent.doc();

    batch.set(ref, {
      ...prediction,
      id: ref.id,
      updatedAt: new Date(),
      createdAt: prediction.createdAt || new Date(),
    });
  }

  await batch.commit();

  return predictions.length;
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
