"use strict";

const { getAdminDb } = require("./statisticsEngine");

function normalizeLottery(lottery) {
  return String(lottery || "PT_RIO").trim().toUpperCase();
}

function normalizeGrupo(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 25 ? n : null;
}

function normalizePosition(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
}

async function fetchPrizesForDrawRef(drawRef) {
  const snap = await drawRef.collection("prizes").get();

  return snap.docs
    .map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        ...data,
        grupo: normalizeGrupo(data.grupo),
        position: normalizePosition(data.position),
      };
    })
    .filter((p) => p.grupo && p.position);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const arr = Array.isArray(items) ? items : [];
  const out = new Array(arr.length);
  let index = 0;

  async function worker() {
    while (index < arr.length) {
      const i = index++;
      out[i] = await mapper(arr[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, arr.length) }, worker)
  );

  return out;
}

async function fetchAllDrawsWithPrizes({
  lottery = "PT_RIO",
  pageSize = 250,
  prizeConcurrency = 12,
} = {}) {
  const db = getAdminDb();
  const lk = normalizeLottery(lottery);

  const admin = require("firebase-admin");
  const DOC_ID = admin.firestore.FieldPath.documentId();

  const draws = [];
  let lastDoc = null;
  let page = 0;

  while (true) {
    page++;

    let q = db
      .collection("draws")
      .where("lottery_key", "==", lk)
      .orderBy("ymd", "asc")
      .orderBy(DOC_ID, "asc")
      .limit(pageSize);

    if (lastDoc) q = q.startAfter(lastDoc);

    console.log(`[BOOTSTRAP] Buscando página ${page}...`);

    const snap = await q.get();

    if (snap.empty) break;

    const pageDraws = await mapWithConcurrency(
      snap.docs,
      prizeConcurrency,
      async (doc) => {
        const data = doc.data() || {};
        const prizes = await fetchPrizesForDrawRef(doc.ref);

        return {
          id: doc.id,
          drawId: doc.id,
          ...data,
          prizes,
        };
      }
    );

    draws.push(...pageDraws);

    console.log(
      `[BOOTSTRAP] Página ${page}: ${snap.docs.length} draws | total=${draws.length}`
    );

    lastDoc = snap.docs[snap.docs.length - 1];

    if (snap.docs.length < pageSize) break;
  }

  return draws;
}

module.exports = {
  fetchAllDrawsWithPrizes,
};
