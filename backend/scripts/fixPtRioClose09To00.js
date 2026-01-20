// backend/scripts/fixPtRioClose09To00.js
"use strict";

const { admin, db } = require("../service/firebaseAdmin");
const { FieldValue } = admin.firestore;

const DRY_RUN = String(process.env.DRY_RUN || "1").trim() !== "0"; // default ON
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 300);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null; // limita docs processados (útil p/ teste)
const START_AFTER_ID = String(process.env.START_AFTER_ID || "").trim() || null;

function isDocIdSafe(id) {
  return typeof id === "string" && id.length > 5 && !id.includes("/");
}

function parseDrawId(id) {
  // Esperado: PT_RIO__YYYY-MM-DD__HH-MM__LOTTERY_PART
  const parts = String(id || "").split("__");
  if (parts.length < 4) return null;
  const lotteryKey = parts[0];
  const date = parts[1];
  const closePart = parts[2]; // ex: "09-09"
  const lotteryPart = parts.slice(3).join("__"); // pode conter "__"
  return { lotteryKey, date, closePart, lotteryPart, parts };
}

function closePartToSlot(closePart) {
  // "09-09" -> "09-00"
  const m = String(closePart || "").match(/^(\d{2})-(\d{2})$/);
  if (!m) return null;
  const hh = m[1];
  const mm = m[2];
  return { hh, mm, slotPart: `${hh}-00`, rawHHMM: `${hh}:${mm}`, slotHHMM: `${hh}:00` };
}

async function copyPrizes(oldRef, newRef) {
  const snap = await oldRef.collection("prizes").get();
  const docs = [];
  snap.forEach((d) => docs.push(d));
  // retorna pares (prizeId, data)
  return docs.map((d) => ({ id: d.id, data: d.data() || {} }));
}

async function main() {
  console.log("======================================");
  console.log("[FIX] PT_RIO close_hour :09 -> :00");
  console.log("dry:", DRY_RUN);
  console.log("pageSize:", PAGE_SIZE);
  console.log("limit:", LIMIT || "none");
  console.log("startAfterId:", START_AFTER_ID || "none");
  console.log("======================================");

  let processed = 0;
  let candidates = 0;
  let moved = 0;
  let skippedNoParse = 0;
  let skippedNoSlot = 0;
  let skippedNot09 = 0;
  let mergedOnly = 0;

  let lastDoc = null;

  // paginação por documentId, com filtro por lottery_key
  while (true) {
    let q = db
      .collection("draws")
      .where("lottery_key", "==", "PT_RIO")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE_SIZE);

    if (START_AFTER_ID && !lastDoc) {
      // startAfter por id: precisamos de um doc snapshot; vamos buscá-lo uma vez
      const startSnap = await db.collection("draws").doc(START_AFTER_ID).get();
      if (startSnap.exists) q = q.startAfter(startSnap);
      else console.warn("[WARN] START_AFTER_ID não existe. Ignorando startAfter.");
    } else if (lastDoc) {
      q = q.startAfter(lastDoc);
    }

    const snap = await q.get();
    if (snap.empty) break;

    const docs = snap.docs;
    lastDoc = docs[docs.length - 1];

    for (const d of docs) {
      if (LIMIT && processed >= LIMIT) break;

      processed++;

      const id = d.id;
      const data = d.data() || {};

      const parsed = parseDrawId(id);
      if (!parsed) {
        skippedNoParse++;
        continue;
      }

      const slot = closePartToSlot(parsed.closePart);
      if (!slot) {
        skippedNoSlot++;
        continue;
      }

      // só trata os "HH-09"
      if (slot.mm !== "09") {
        // também elimina casos que não são :09 no ID
        skippedNot09++;
        continue;
      }

      // defesa extra (por campo close_hour)
      const ch = String(data.close_hour || "");
      if (!ch.endsWith(":09") && !parsed.closePart.endsWith("-09")) {
        skippedNot09++;
        continue;
      }

      candidates++;

      const newId = `${parsed.lotteryKey}__${parsed.date}__${slot.slotPart}__${parsed.lotteryPart}`;
      if (!isDocIdSafe(newId)) {
        console.warn("[SKIP] newId inválido:", newId);
        continue;
      }

      const oldRef = d.ref;
      const newRef = db.collection("draws").doc(newId);

      const newSnap = await newRef.get();
      const newExists = newSnap.exists;
      const newData = newExists ? (newSnap.data() || {}) : null;

      const oldCloseRaw = data.close_hour_raw || data.close_hour || slot.rawHHMM;

      // payload do doc novo (merge)
      const drawPayload = {
        ...data,
        close_hour: slot.slotHHMM, // ✅ slot oficial
        close_hour_raw: String(oldCloseRaw || slot.rawHHMM), // ✅ preserva o raw
        migratedFrom: id,
        migratedAt: FieldValue.serverTimestamp(),
      };

      // copy prizes
      const prizes = await copyPrizes(oldRef, newRef);

      // Escreve em batch
      let batch = db.batch();
      let ops = 0;

      if (!DRY_RUN) {
        batch.set(newRef, drawPayload, { merge: true });
        ops++;

        for (const p of prizes) {
          const pref = newRef.collection("prizes").doc(p.id);
          batch.set(pref, p.data, { merge: true });
          ops++;
          if (ops >= 400) {
            await batch.commit();
            batch = db.batch();
            ops = 0;
          }
        }

        // apaga o antigo só depois de copiar tudo
        batch.delete(oldRef);
        ops++;

        if (ops > 0) await batch.commit();
      }

      if (newExists) mergedOnly++;
      moved++;

      if (moved % 50 === 0) {
        console.log(
          `[PROGRESS] moved=${moved} candidates=${candidates} processed=${processed} lastId=${id}`
        );
      }
    }

    if (LIMIT && processed >= LIMIT) break;
  }

  console.log("\n======================================");
  console.log("[DONE]");
  console.log({
    dryRun: DRY_RUN,
    processed,
    candidates_endsWith09: candidates,
    moved,
    mergedOnly,
    skippedNoParse,
    skippedNoSlot,
    skippedNot09,
  });
  console.log("======================================");
}

main().catch((e) => {
  console.error("ERRO:", e?.message || e);
  process.exit(1);
});
