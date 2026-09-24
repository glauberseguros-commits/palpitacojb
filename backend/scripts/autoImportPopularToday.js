"use strict";

/*
 * Importação diária da POPULAR. A fonte existente só confirma um sorteio
 * quando pelo menos duas das três fontes concordam nas cinco milhares.
 * Horários fora da grade operacional, inclusive 18:30, não são gravados.
 */

const { getDb } = require("../service/firebaseAdmin");
const { fetchExternalResults } = require("../services/externalResultsProviders");
const { buildPayloadFromDraw } = require("./importExternalResults");
const { importFromPayload } = require("./importKingApostas");

const OPERATIONAL_SLOTS = new Set([
  "09:30", "11:00", "12:40", "14:00", "15:40", "17:00",
]);

function saoPauloDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function targetDate() {
  const date = String(process.env.DATE || "").trim() || saoPauloDate();
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    date > saoPauloDate()
  ) {
    throw new Error(`POPULAR_DATE_INVALID=${date}`);
  }
  return date;
}

function lotteryKeyOf(data) {
  return String(data?.lottery_key ?? data?.lotteryKey ?? "")
    .trim().toUpperCase();
}

function slotOf(data) {
  return String(data?.close_hour ?? data?.closeHour ?? data?.close ?? "").trim();
}

function storedPrizes(data) {
  const byPosition = new Map();
  for (const prize of Array.isArray(data?.prizes) ? data.prizes : []) {
    const position = Number(prize?.position);
    if (Number.isInteger(position)) {
      byPosition.set(position, String(
        prize?.displayValue ?? prize?.raw ?? prize?.milhar ?? ""
      ).trim());
    }
  }
  return [1, 2, 3, 4, 5].map((position) => byPosition.get(position) || "");
}

function matchesDraw(data, row) {
  return Number(data?.prizesCount) >= 5 &&
    storedPrizes(data).every((value, index) => value === row.prizes[index]);
}

async function getPopularDocs(db, date) {
  const draws = db.collection("draws");
  const [snake, camel] = await Promise.all([
    draws.where("date", "==", date).where("lottery_key", "==", "POPULAR").get(),
    draws.where("date", "==", date).where("lotteryKey", "==", "POPULAR").get(),
  ]);
  const docs = new Map();
  for (const doc of [...snake.docs, ...camel.docs]) {
    docs.set(doc.id, doc);
  }
  return [...docs.values()].filter(
    (doc) => lotteryKeyOf(doc.data() || {}) === "POPULAR"
  );
}

function bySlot(docs) {
  const slots = new Map();
  for (const doc of docs) {
    const slot = slotOf(doc.data() || {});
    const group = slots.get(slot) || [];
    group.push(doc);
    slots.set(slot, group);
  }
  return slots;
}

async function main() {
  const date = targetDate();
  console.log(`[POPULAR_AUTO] DATE=${date}`);

  const fetched = await fetchExternalResults({ lotteryKey: "POPULAR", date });
  if (!Array.isArray(fetched?.draws)) {
    throw new Error("POPULAR_SOURCE_RESPONSE_INVALID");
  }

  const confirmed = [];
  const seen = new Set();
  let held = 0;
  let outsideGrade = 0;

  for (const draw of fetched.draws) {
    const slot = String(draw?.closeHour || "").trim();
    if (!OPERATIONAL_SLOTS.has(slot)) {
      outsideGrade++;
      continue;
    }
    if (draw.confirmed !== true) {
      held++;
      continue;
    }
    if (
      draw.date !== date ||
      Number(draw.consensusCount) < 2 ||
      !Array.isArray(draw.prizes) ||
      draw.prizes.length !== 5 ||
      !draw.prizes.every((value) => /^\d{4}$/.test(String(value)))
    ) {
      throw new Error(`POPULAR_SOURCE_CONTRACT_INVALID=${date} ${slot}`);
    }
    if (seen.has(slot)) {
      throw new Error(`POPULAR_SOURCE_DUPLICATE=${date} ${slot}`);
    }
    seen.add(slot);
    confirmed.push(draw);
  }

  console.log(`[POPULAR_AUTO] SOURCE_CONFIRMED=${confirmed.length}`);
  console.log(`[POPULAR_AUTO] SOURCE_HELD=${held}`);
  console.log(`[POPULAR_AUTO] OUTSIDE_GRADE=${outsideGrade}`);

  const db = getDb();
  const before = bySlot(await getPopularDocs(db, date));
  const payloadData = [];
  const writeTargets = [];
  let alreadyComplete = 0;

  for (const row of confirmed) {
    const docs = before.get(row.closeHour) || [];
    if (docs.length > 1) {
      throw new Error(`POPULAR_DB_DUPLICATE=${date} ${row.closeHour}`);
    }
    if (docs.length === 1) {
      if (matchesDraw(docs[0].data() || {}, row)) {
        alreadyComplete++;
        continue;
      }
      throw new Error(`POPULAR_DB_CONFLICT=${date} ${row.closeHour}`);
    }

    const payload = buildPayloadFromDraw(row);
    if (!Array.isArray(payload?.data) || payload.data.length !== 1) {
      throw new Error(`POPULAR_PAYLOAD_INVALID=${date} ${row.closeHour}`);
    }
    payloadData.push(payload.data[0]);
    writeTargets.push(row);
  }

  console.log(`[POPULAR_AUTO] ALREADY_COMPLETE=${alreadyComplete}`);
  console.log(`[POPULAR_AUTO] WRITE_DRAWS=${payloadData.length}`);

  if (payloadData.length) {
    const result = await importFromPayload({
      payload: { success: true, data: payloadData },
      lotteryKey: "POPULAR",
      closeHour: null,
      skipIfAlreadyComplete: false,
      source: "external_consensus",
      ufOverride: "PE",
    });
    console.log(`[POPULAR_AUTO] IMPORT_RESULT=${JSON.stringify(result)}`);
  }

  let postWritePass = 0;
  if (writeTargets.length) {
    const after = bySlot(await getPopularDocs(db, date));
    for (const row of writeTargets) {
      const docs = after.get(row.closeHour) || [];
      if (docs.length !== 1 || !matchesDraw(docs[0].data() || {}, row)) {
        throw new Error(`POPULAR_POSTWRITE_FAILED=${date} ${row.closeHour}`);
      }
      postWritePass++;
    }
  }

  console.log(`[POPULAR_AUTO] POSTWRITE_PASS=${postWritePass}`);
  console.log(`[POPULAR_AUTO] COMPLETE_SOURCE_NOW=${alreadyComplete + postWritePass}/${confirmed.length}`);
  console.log("[POPULAR_AUTO] RUNIMPORT_CALLED=0");
  console.log("[POPULAR_AUTO] TOP3_TRIGGER=0");
  console.log("[POPULAR_AUTO] DONE=YES");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[POPULAR_AUTO] ERROR=" + String(error?.stack || error));
    process.exitCode = 1;
  });
}

module.exports = { main };
