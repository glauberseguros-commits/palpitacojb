"use strict";

const { getDb } = require("../backend/service/firebaseAdmin");

const LOTTERIES = [
  "PT_RIO",
  "LOOK",
  "FEDERAL",
  "NACIONAL",
];

function safe(value) {
  if (value === undefined) return "<undefined>";
  if (value === null) return "<null>";
  return String(value);
}

function dateValue(data) {
  const candidates = [
    data.ymd,
    data.date,
    data.draw_date,
    data.result_date,
    data.createdAt,
    data.importedAt,
  ];

  for (const value of candidates) {
    if (!value) continue;

    if (typeof value === "string") {
      return value;
    }

    if (typeof value.toDate === "function") {
      try {
        return value.toDate().toISOString();
      } catch {}
    }
  }

  return "";
}

function hourSignature(data) {
  return [
    `close_hour=${safe(data.close_hour)}`,
    `closeHour=${safe(data.closeHour)}`,
    `hour=${safe(data.hour)}`,
    `hora=${safe(data.hora)}`,
    `close_hour_raw=${safe(data.close_hour_raw)}`,
  ].join(" | ");
}

async function loadLotteryDocs(db, lotteryKey) {
  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", lotteryKey)
    .limit(500)
    .get();

  return snap.docs
    .map((doc) => ({
      id: doc.id,
      data: doc.data() || {},
    }))
    .sort((a, b) => {
      return dateValue(b.data).localeCompare(dateValue(a.data));
    });
}

async function main() {
  const db = getDb();

  console.log("Projeto Firebase:", process.env.GOOGLE_CLOUD_PROJECT || "<não informado>");
  console.log("Credencial carregada:", Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS));

  for (const lotteryKey of LOTTERIES) {
    console.log("");
    console.log("============================================================");
    console.log(`LOTERIA: ${lotteryKey}`);
    console.log("============================================================");

    const docs = await loadLotteryDocs(db, lotteryKey);

    console.log(`Documentos consultados: ${docs.length}`);

    if (!docs.length) {
      console.log("SEM DOCUMENTOS PARA lottery_key =", lotteryKey);
      continue;
    }

    const signatures = new Map();

    for (const item of docs) {
      const signature = hourSignature(item.data);
      signatures.set(signature, (signatures.get(signature) || 0) + 1);
    }

    console.log("");
    console.log("DISTRIBUIÇÃO DOS CAMPOS DE HORÁRIO:");

    [...signatures.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .forEach(([signature, count]) => {
        console.log(`${String(count).padStart(4, " ")}x | ${signature}`);
      });

    console.log("");
    console.log("10 DOCUMENTOS MAIS RECENTES DA AMOSTRA:");

    docs.slice(0, 10).forEach(({ id, data }, index) => {
      console.log("");
      console.log(`#${index + 1}`);
      console.log({
        id,
        ymd: safe(data.ymd),
        date: safe(data.date),
        lottery_key: safe(data.lottery_key),
        lottery_code: safe(data.lottery_code),
        uf: safe(data.uf),
        close_hour: safe(data.close_hour),
        closeHour: safe(data.closeHour),
        hour: safe(data.hour),
        hora: safe(data.hora),
        close_hour_raw: safe(data.close_hour_raw),
        drawId: safe(data.drawId),
      });
    });
  }
}

main()
  .then(() => {
    console.log("");
    console.log("===== NAC-26 CONCLUÍDO =====");
    process.exit(0);
  })
  .catch((error) => {
    console.error("");
    console.error("===== NAC-26 FALHOU =====");
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
