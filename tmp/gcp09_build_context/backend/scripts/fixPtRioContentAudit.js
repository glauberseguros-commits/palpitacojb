"use strict";

const fs = require("fs");
const path = require("path");
const { db } = require("../service/firebaseAdmin");
const { fetchKingResults, importFromPayload } = require("./importKingApostas");

const START = process.argv[2] || "2022-06-07";
const END = process.argv[3] || "2026-07-08";
const LOTTERY_KEY = String(process.argv[4] || "PT_RIO").toUpperCase();

const classificationFile = path.join(
  __dirname,
  "..",
  "logs",
  `official-classification-${LOTTERY_KEY}-${START}_to_${END}.json`
);

if (!fs.existsSync(classificationFile)) {
  console.error("Arquivo de classificação não encontrado:");
  console.error(classificationFile);
  process.exit(1);
}

async function deleteDrawWithPrizes(drawId) {
  const ref = db.collection("draws").doc(drawId);

  const pSnap = await ref.collection("prizes").get();
  let batch = db.batch();
  let ops = 0;

  pSnap.forEach((doc) => {
    batch.delete(doc.ref);
    ops++;
  });

  batch.delete(ref);
  ops++;

  if (ops > 0) await batch.commit();

  return { drawId, deletedPrizes: pSnap.size };
}

function collectDocIds(slot) {
  const ids = new Set();

  for (const p of slot.problems || []) {
    if (p.firestoreDoc) ids.add(String(p.firestoreDoc));
    if (Array.isArray(p.firestoreDocs)) {
      for (const id of p.firestoreDocs) ids.add(String(id));
    }
  }

  return Array.from(ids).filter(Boolean);
}

async function reimportSlot(date, slot) {
  const payload = await fetchKingResults({ date, lotteryKey: LOTTERY_KEY });

  return await importFromPayload({
    payload,
    lotteryKey: LOTTERY_KEY,
    closeHour: slot,
    skipIfAlreadyComplete: false,
  });
}

async function main() {
  const report = JSON.parse(fs.readFileSync(classificationFile, "utf8"));
  const affected = Array.isArray(report.affectedSlots) ? report.affectedSlots : [];

  let deletedDocs = 0;
  let reimportedSlots = 0;
  let skipped = 0;
  const actions = [];

  for (const slotInfo of affected) {
    const date = String(slotInfo.date || "");
    const slot = String(slotInfo.slot || "");
    const classes = Object.keys(slotInfo.classifications || {});

    console.log("");
    console.log(`[FIX-CONTENT] ${date} ${slot} classes=${classes.join(",")}`);

    const docIds = collectDocIds(slotInfo);

    // 1) Documento extra quando não havia sorteio previsto: apaga e NÃO reimporta
    if (classes.includes("nao_havia_sorteio_previsto")) {
      for (const id of docIds) {
        const r = await deleteDrawWithPrizes(id);
        deletedDocs++;
        console.log(`[DELETE EXTRA] ${id} prizes=${r.deletedPrizes}`);
      }

      actions.push({ date, slot, action: "delete_extra", docIds });
      continue;
    }

    // 2) Conteúdo divergente: apaga docs errados e reimporta o slot correto
    if (classes.includes("conteudo_divergente")) {
      for (const id of docIds) {
        const r = await deleteDrawWithPrizes(id);
        deletedDocs++;
        console.log(`[DELETE DIVERGENT] ${id} prizes=${r.deletedPrizes}`);
      }

      const r = await reimportSlot(date, slot);
      reimportedSlots++;
      console.log(`[REIMPORT] ${date} ${slot} validos=${r.totalDrawsValid} prizes=${r.totalPrizesUpserted}`);

      actions.push({ date, slot, action: "delete_and_reimport", docIds });
      continue;
    }

    // 3) Furo real: só reimporta
    if (classes.includes("furo_real_firestore")) {
      const r = await reimportSlot(date, slot);
      reimportedSlots++;
      console.log(`[REIMPORT MISSING] ${date} ${slot} validos=${r.totalDrawsValid} prizes=${r.totalPrizesUpserted}`);

      actions.push({ date, slot, action: "reimport_missing" });
      continue;
    }

    skipped++;
    console.log("[SKIP] classe não tratada automaticamente");
    actions.push({ date, slot, action: "skipped", classes });
  }

  const out = {
    period: { start: START, end: END },
    lotteryKey: LOTTERY_KEY,
    affectedSlots: affected.length,
    deletedDocs,
    reimportedSlots,
    skipped,
    actions,
    generatedAt: new Date().toISOString(),
  };

  const outFile = path.join(
    __dirname,
    "..",
    "logs",
    `content-fix-${LOTTERY_KEY}-${START}_to_${END}.json`
  );

  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf8");

  console.log("");
  console.log("========== CORREÇÃO DE CONTEÚDO ==========");
  console.log(`Horários afetados: ${affected.length}`);
  console.log(`Docs apagados: ${deletedDocs}`);
  console.log(`Slots reimportados: ${reimportedSlots}`);
  console.log(`Ignorados: ${skipped}`);
  console.log(`Arquivo: ${outFile}`);
}

main().catch((e) => {
  console.error("ERRO:", e?.message || e);
  process.exit(1);
});
