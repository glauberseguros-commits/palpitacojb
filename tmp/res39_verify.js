"use strict";

const fs = require("fs");
const path = require("path");
const { getDb } = require("../backend/service/firebaseAdmin");

const TARGETS = [
  ["2026-07-19", "09"],
  ["2026-07-19", "11"],
  ["2026-07-22", "18"],
  ["2026-07-22", "21"],
];

const OUT = path.resolve(
  __dirname,
  "res39_firestore_verification.txt"
);

function text(value) {
  return String(value ?? "").trim();
}

function normalizeHour(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})/);

  if (!match) return "";

  return String(Number(match[1])).padStart(2, "0");
}

function isPtRio(data) {
  const lotteryKey = text(
    data?.lottery_key ??
    data?.lotteryKey ??
    data?.lottery
  ).toUpperCase();

  const uf = text(data?.uf).toUpperCase();

  return lotteryKey === "PT_RIO" || lotteryKey === "RJ" || uf === "RJ";
}

async function main() {
  const db = getDb();
  const lines = [];

  lines.push("====================================================================================================");
  lines.push("RES-39 — VERIFICAÇÃO DOS HORÁRIOS NO FIRESTORE");
  lines.push("====================================================================================================");
  lines.push("");
  lines.push(`Executado em: ${new Date().toISOString()}`);

  for (const [date, wantedHour] of TARGETS) {
    const [snapYmd, snapDate] = await Promise.all([
      db.collection("draws").where("ymd", "==", date).get(),
      db.collection("draws").where("date", "==", date).get(),
    ]);

    const byId = new Map();

    for (const doc of snapYmd.docs) byId.set(doc.id, doc);
    for (const doc of snapDate.docs) byId.set(doc.id, doc);

    const matches = [];

    for (const doc of byId.values()) {
      const data = doc.data() || {};

      if (!isPtRio(data)) continue;

      const hour = normalizeHour(
        data.close_hour ??
        data.closeHour ??
        data.hour ??
        data.hora
      );

      if (hour !== wantedHour) continue;

      const prizesSnap = await doc.ref
        .collection("prizes")
        .get();

      matches.push({
        id: doc.id,
        close_hour:
          data.close_hour ??
          data.closeHour ??
          null,
        close_hour_raw:
          data.close_hour_raw ??
          data.closeHourRaw ??
          null,
        lottery_name:
          data.lottery_name ??
          data.lotteryName ??
          null,
        prizesCountField:
          data.prizesCount ??
          null,
        prizesSubcollection:
          prizesSnap.size,
      });
    }

    lines.push("");
    lines.push("----------------------------------------------------------------------------------------------------");
    lines.push(`${date} | ${wantedHour}h`);
    lines.push("----------------------------------------------------------------------------------------------------");

    if (!matches.length) {
      lines.push("NENHUM DOCUMENTO ENCONTRADO");
    } else {
      lines.push(JSON.stringify(matches, null, 2));
    }
  }

  fs.writeFileSync(OUT, lines.join("\n"), "utf8");

  console.log("");
  console.log("Verificação criada:");
  console.log(OUT);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
