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

async function loadDocuments(db) {
  const collection = db.collection("top3_predictions");

  const attempts = [
    {
      label: "updatedAt desc",
      execute: () =>
        collection
          .orderBy("updatedAt", "desc")
          .limit(20)
          .get(),
    },
    {
      label: "createdAt desc",
      execute: () =>
        collection
          .orderBy("createdAt", "desc")
          .limit(20)
          .get(),
    },
    {
      label: "sem ordenação",
      execute: () =>
        collection
          .limit(20)
          .get(),
    },
  ];

  for (const attempt of attempts) {
    try {
      const snapshot = await attempt.execute();

      return {
        snapshot,
        strategy: attempt.label,
      };
    } catch (error) {
      console.log(
        `[TENTATIVA FALHOU] ${attempt.label}:`,
        error?.message || error
      );
    }
  }

  throw new Error(
    "Nenhuma estratégia conseguiu ler top3_predictions."
  );
}

(async () => {
  const db = getDb();

  const {
    snapshot,
    strategy,
  } = await loadDocuments(db);

  console.log("");
  console.log("============================================================");
  console.log("COLLECTION: top3_predictions");
  console.log("ESTRATÉGIA:", strategy);
  console.log("DOCUMENTOS:", snapshot.size);
  console.log("============================================================");

  snapshot.forEach((doc) => {
    const data = serialize(doc.data() || {});

    console.log("");
    console.log("ID:", doc.id);

    console.log(
      JSON.stringify(
        {
          lotteryKey: data.lotteryKey,
          targetYmd: data.targetYmd,
          targetHour: data.targetHour,
          status: data.status,

          picks: data.picks,
          snapshot: data.snapshot,

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

          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          validatedAt: data.validatedAt,
          source: data.source,
        },
        null,
        2
      )
    );
  });
})().catch((error) => {
  console.error("");
  console.error("ERRO FINAL:");
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
