"use strict";

const path = require("path");

process.chdir(path.resolve(__dirname, ".."));

const {
  getDb,
} = require("../backend/service/firebaseAdmin");

function serialize(value) {
  if (
    value &&
    typeof value === "object" &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serialize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        serialize(item),
      ])
    );
  }

  return value;
}

(async () => {
  const db = getDb();

  const snapshot = await db
    .collection("top3_predictions")
    .get();

  const documents = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...serialize(doc.data() || {}),
    }))
    .filter((data) => {
      return (
        data.status === "validated" ||
        Boolean(data.hitType) ||
        Number.isFinite(Number(data.resultGrupo)) ||
        Boolean(data.resultMilhar) ||
        Array.isArray(data.resultTop3Groups) ||
        Array.isArray(data.resultTop3Milhares)
      );
    })
    .sort(
      (a, b) =>
        Number(b.updatedAt || b.validatedAt || 0) -
        Number(a.updatedAt || a.validatedAt || 0)
    );

  console.log("");
  console.log("============================================================");
  console.log("COLLECTION: top3_predictions");
  console.log("TOTAL DA COLEÇÃO:", snapshot.size);
  console.log("DOCUMENTOS VALIDADOS/COM RESULTADO:", documents.length);
  console.log("============================================================");

  for (const data of documents.slice(0, 50)) {
    console.log("");
    console.log("ID:", data.id);

    console.log(
      JSON.stringify(
        {
          lotteryKey: data.lotteryKey,
          targetYmd: data.targetYmd,
          targetHour: data.targetHour,
          status: data.status,

          picks: data.picks,

          resultGrupo: data.resultGrupo,
          resultMilhar: data.resultMilhar,
          resultAnimal: data.resultAnimal,

          resultTop3Groups: data.resultTop3Groups,
          resultTop3Milhares: data.resultTop3Milhares,

          hitType: data.hitType,
          hitScore: data.hitScore,
          hitPosition: data.hitPosition,
          predictionPosition: data.predictionPosition,
          resultPosition: data.resultPosition,
          podiumMedal: data.podiumMedal,

          matchedValue: data.matchedValue,
          matchedGrupo: data.matchedGrupo,
          matchedMilhar: data.matchedMilhar,
          matchedAnimal: data.matchedAnimal,

          validatedAt: data.validatedAt,
          updatedAt: data.updatedAt,
        },
        null,
        2
      )
    );
  }
})().catch((error) => {
  console.error("");
  console.error("ERRO FINAL:");
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
