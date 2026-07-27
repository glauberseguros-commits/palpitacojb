"use strict";

const { db } = require("../backend/service/firebaseAdmin");

const TARGET_DATE = "2026-07-21";
const TARGET_HOUR = "16";

function str(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return str(value).toUpperCase();
}

function hourOf(value) {
  const match = str(value).match(/^(\d{1,2})/);
  return match
    ? String(Number(match[1])).padStart(2, "0")
    : "";
}

function isLook(data) {
  return [
    data.uf,
    data.lottery_key,
    data.lotteryKey,
    data.lottery,
    data.lottery_name,
    data.lotteryName,
  ]
    .map(upper)
    .some((value) => value.includes("LOOK"));
}

function drawHour(data) {
  for (const value of [
    data.close_hour,
    data.closeHour,
    data.close_hour_raw,
    data.closeHourRaw,
    data.hour,
    data.horario,
  ]) {
    const hour = hourOf(value);
    if (hour) return hour;
  }

  return "";
}

function position(prize) {
  return Number(
    prize?.position ??
    prize?.posicao ??
    prize?.prize_position ??
    prize?.prizePosition ??
    prize?.order ??
    999
  );
}

function summarizePrize(prize) {
  if (!prize) return null;

  return {
    position: position(prize),
    milhar:
      prize.milhar ??
      prize.number ??
      prize.numero ??
      prize.value ??
      null,
    grupo:
      prize.grupo ??
      prize.group ??
      prize.group_number ??
      prize.groupNumber ??
      null,
    animal:
      prize.animal ??
      prize.bicho ??
      prize.group_name ??
      prize.groupName ??
      null,
  };
}

function timestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value.toMillis === "function") {
    return new Date(value.toMillis()).toISOString();
  }
  return value;
}

async function main() {
  const snap = await db
    .collection("draws")
    .where("date", "==", TARGET_DATE)
    .get();

  const matches = [];

  for (const doc of snap.docs) {
    const data = doc.data() || {};

    if (!isLook(data)) continue;
    if (drawHour(data) !== TARGET_HOUR) continue;

    const prizeSnap = await doc.ref.collection("prizes").get();

    const subcollectionPrizes = prizeSnap.docs
      .map((prizeDoc) => ({
        id: prizeDoc.id,
        ...(prizeDoc.data() || {}),
      }))
      .sort((a, b) => position(a) - position(b));

    const embeddedPrizes = [
      data.prizes,
      data.premios,
      data.results,
    ].find(Array.isArray) || [];

    embeddedPrizes.sort((a, b) => position(a) - position(b));

    const prizes = subcollectionPrizes.length
      ? subcollectionPrizes
      : embeddedPrizes;

    matches.push({
      documentId: doc.id,
      date: data.date ?? null,
      lottery_key: data.lottery_key ?? null,
      lotteryKey: data.lotteryKey ?? null,
      lottery_name: data.lottery_name ?? null,
      close_hour: data.close_hour ?? null,
      close_hour_raw: data.close_hour_raw ?? null,
      createdAt: timestamp(data.createdAt),
      updatedAt: timestamp(data.updatedAt),
      importedAt: timestamp(data.importedAt),
      embeddedPrizeCount: embeddedPrizes.length,
      subcollectionPrizeCount: subcollectionPrizes.length,
      firstPrize: summarizePrize(prizes[0]),
    });
  }

  console.log("\n===== RESULTADO DA CONSULTA =====");
  console.log(`Documentos LOOK encontrados às 16h: ${matches.length}`);
  console.log(JSON.stringify(matches, null, 2));

  if (matches.length > 1) {
    console.log(
      "\nDIAGNÓSTICO: existem documentos concorrentes para o mesmo horário."
    );
  } else if (matches.length === 1) {
    console.log(
      "\nDIAGNÓSTICO: existe somente um documento para esse horário."
    );
  } else {
    console.log(
      "\nDIAGNÓSTICO: nenhum documento correspondente foi localizado."
    );
  }
}

main()
  .catch((error) => {
    console.error("\nERRO:", error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.terminate();
    } catch (_) {}
  });
