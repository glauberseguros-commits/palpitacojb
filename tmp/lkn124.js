const { getDb } = require("../backend/service/firebaseAdmin");

const db = getDb();

function timestampMillis(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampText(value) {
  if (!value) return null;

  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  return String(value);
}

async function dump(key) {
  console.log("");
  console.log("======================================================");
  console.log("LOTTERY:", key);
  console.log("======================================================");

  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", key)
    .limit(500)
    .get();

  const rows = snap.docs
    .map((doc) => {
      const d = doc.data() || {};

      return {
        sortImportedAt: timestampMillis(d.importedAt),

        data: {
          id: doc.id,
          source: d.source ?? null,
          lottery_key: d.lottery_key ?? null,
          lottery_name: d.lottery_name ?? null,
          lottery_id: d.lottery_id ?? null,
          date: d.date ?? null,
          ymd: d.ymd ?? null,
          close_hour: d.close_hour ?? null,
          close_hour_raw: d.close_hour_raw ?? null,
          hour: d.hour ?? null,
          close: d.close ?? null,
          importedAt: timestampText(d.importedAt),
        },
      };
    })
    .sort((a, b) => b.sortImportedAt - a.sortImportedAt)
    .slice(0, 15);

  console.log("documentos encontrados:", snap.size);
  console.log("documentos exibidos:", rows.length);

  rows.forEach((row) => {
    console.log(JSON.stringify(row.data, null, 2));
  });
}

(async () => {
  await dump("LOOK");
  await dump("NACIONAL");

  console.log("");
  console.log("===== CONSULTA CONCLUÍDA =====");
  process.exit(0);
})().catch((error) => {
  console.error("");
  console.error("===== ERRO NA CONSULTA =====");
  console.error(error);
  process.exit(1);
});
