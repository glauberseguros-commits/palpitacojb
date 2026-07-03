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

async function fetchAllDrawsWithPrizes({ lottery = "PT_RIO", limit = 10000 } = {}) {
  const db = getAdminDb();
  const lk = normalizeLottery(lottery);

  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", lk)
    .orderBy("ymd", "asc")
    .orderBy("__name__", "asc")
    .limit(limit)
    .get();

  const draws = [];

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const prizes = await fetchPrizesForDrawRef(doc.ref);

    draws.push({
      id: doc.id,
      drawId: doc.id,
      ...data,
      prizes,
    });
  }

  return draws;
}

module.exports = {
  fetchAllDrawsWithPrizes,
};
