"use strict";

const fs = require("fs");
const path = require("path");

const START = process.argv[2] || "2022-06-07";
const END = process.argv[3] || "2026-07-08";
const LOTTERY_KEY = String(process.argv[4] || "PT_RIO").toUpperCase();

const contentFile = path.join(
  __dirname,
  "..",
  "logs",
  `content-audit-${LOTTERY_KEY}-${START}_to_${END}.json`
);

if (!fs.existsSync(contentFile)) {
  console.error("Arquivo da auditoria de conteúdo não encontrado:");
  console.error(contentFile);
  process.exit(1);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function weekdayUTC(ymd) {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

function expectedPtRioSlots(ymd) {
  const wd = weekdayUTC(ymd);

  // 0 domingo
  if (wd === 0) return ["09:00", "11:00", "14:00", "16:00"];

  // 3 quarta e 6 sábado
  if (wd === 3 || wd === 6) {
    return ["09:00", "11:00", "14:00", "16:00", "21:00"];
  }

  // segunda, terça, quinta, sexta
  return ["09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];
}

function classifyProblem(problem) {
  const date = String(problem?.date || "");
  const slot = String(problem?.slot || "");
  const type = String(problem?.type || "");

  const expected = expectedPtRioSlots(date).includes(slot);

  if (type === "extra_firestore") {
    return expected ? "documento_extra_em_horario_previsto" : "nao_havia_sorteio_previsto";
  }

  if (type === "missing_firestore") {
    return expected ? "furo_real_firestore" : "king_tem_resultado_fora_da_grade";
  }

  if (type === "prize_mismatch") {
    return "conteudo_divergente";
  }

  if (type === "duplicate_firestore") {
    return "duplicidade_firestore";
  }

  if (type === "audit_error") {
    return "erro_auditoria";
  }

  return "outro";
}

const content = JSON.parse(fs.readFileSync(contentFile, "utf8"));

const grouped = {};
const byDateSlot = {};

for (const day of content.results || []) {
  for (const p of day.problems || []) {
    const cls = classifyProblem(p);

    grouped[cls] = (grouped[cls] || 0) + 1;

    const key = `${p.date}__${p.slot}`;
    if (!byDateSlot[key]) {
      byDateSlot[key] = {
        date: p.date,
        slot: p.slot,
        expectedSlots: expectedPtRioSlots(p.date),
        classifications: {},
        problems: [],
      };
    }

    byDateSlot[key].classifications[cls] =
      (byDateSlot[key].classifications[cls] || 0) + 1;

    byDateSlot[key].problems.push(p);
  }
}

const affectedSlots = Object.values(byDateSlot).sort((a, b) => {
  return `${a.date} ${a.slot}`.localeCompare(`${b.date} ${b.slot}`);
});

const report = {
  period: { start: START, end: END },
  lotteryKey: LOTTERY_KEY,
  sourceAuditFile: contentFile,
  totalDays: content.totalDays,
  totalSourceSlots: content.totalSourceSlots,
  totalRawProblems: content.totalProblems,
  grouped,
  affectedSlotsCount: affectedSlots.length,
  affectedSlots,
  generatedAt: new Date().toISOString(),
};

const outFile = path.join(
  __dirname,
  "..",
  "logs",
  `official-classification-${LOTTERY_KEY}-${START}_to_${END}.json`
);

fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");

console.log("");
console.log("========== CLASSIFICAÇÃO OFICIAL ==========");
console.log(`Período: ${START} até ${END}`);
console.log(`Loteria: ${LOTTERY_KEY}`);
console.log(`Dias auditados: ${content.totalDays}`);
console.log(`Sorteios fonte: ${content.totalSourceSlots}`);
console.log(`Problemas brutos: ${content.totalProblems}`);
console.log(`Horários afetados: ${affectedSlots.length}`);
console.log("");
console.log("Por categoria:");
for (const [k, v] of Object.entries(grouped).sort()) {
  console.log(`- ${k}: ${v}`);
}
console.log("");
console.log(`Arquivo: ${outFile}`);
