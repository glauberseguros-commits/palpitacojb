const path = require("path");

const firebaseModule = require(
  path.join(process.cwd(), "backend", "firebaseAdmin")
);

const admin = firebaseModule.admin || firebaseModule;
const db =
  firebaseModule.db ||
  (typeof admin.firestore === "function" ? admin.firestore() : null);

if (!db) {
  throw new Error(
    "Não foi possível obter a instância do Firestore de backend/firebaseAdmin."
  );
}

function timestampToText(value) {
  if (!value) return null;

  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  return String(value);
}

async function dumpLottery(key) {
  console.log("\n======================================================");
  console.log("LOTTERY:", key);
  console.log("======================================================");

  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", key)
    .orderBy("importedAt", "desc")
    .limit(15)
    .get();

  console.log("docs:", snap.size);

  snap.forEach((doc) => {
    const d = doc.data() || {};

    console.log(
      JSON.stringify(
        {
          id: doc.id,
          source: d.source ?? null,
          lottery_key: d.lottery_key ?? null,
          lotteryKey: d.lotteryKey ?? null,
          lottery_name: d.lottery_name ?? null,
          lottery_id: d.lottery_id ?? null,
          date: d.date ?? null,
          ymd: d.ymd ?? null,
          close_hour: d.close_hour ?? null,
          close_hour_raw: d.close_hour_raw ?? null,
          hour: d.hour ?? null,
          close: d.close ?? null,
          prizesCount: d.prizesCount ?? null,
          importedAt: timestampToText(d.importedAt),
        },
        null,
        2
      )
    );
  });
}

(async () => {
  await dumpLottery("LOOK");
  await dumpLottery("NACIONAL");

  console.log("\n===== CONSULTA CONCLUÍDA =====");
  process.exit(0);
})().catch((err) => {
  console.error("\n===== ERRO =====");
  console.error(err);
  process.exit(1);
});
