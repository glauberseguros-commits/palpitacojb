"use strict";

const { db } = require("../service/firebaseAdmin");

function asYmd(v) {
  if (!v) return "";

  if (typeof v === "string") {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : v;
  }

  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    return d.toISOString().slice(0, 10);
  }

  return String(v || "");
}

function getLotteryKey(d) {
  return String(d.lottery_key || d.lotteryKey || d.lottery || d.uf || "").trim().toUpperCase();
}

function getContest(d) {
  return String(d.contest || d.concurso || d.drawNumber || d.draw_number || d.number || "").trim();
}

async function main() {
  const snap = await db.collection("draws").get();

  const federalDocs = [];

  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const lk = getLotteryKey(d);

    if (lk === "FEDERAL" || lk === "BR_FEDERAL") {
      federalDocs.push({
        id: doc.id,
        date: asYmd(d.date || d.drawDate || d.ymd),
        close_hour: String(d.close_hour || d.closeHour || d.hour || "").trim(),
        contest: getContest(d),
        rawLotteryKey: lk,
      });
    }
  }

  const byDate = new Map();
  const byContest = new Map();

  for (const row of federalDocs) {
    const dateKey = row.date || "(sem data)";
    const contestKey = row.contest || "(sem concurso)";

    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(row);

    if (!byContest.has(contestKey)) byContest.set(contestKey, []);
    byContest.get(contestKey).push(row);
  }

  console.log("");
  console.log("========== AUDITORIA FEDERAL ==========");
  console.log("Documentos FEDERAL em draws:", federalDocs.length);
  console.log("Datas únicas:", byDate.size);
  console.log("Concursos únicos:", byContest.size);

  console.log("");
  console.log("========== DATAS COM MAIS DE UM DOCUMENTO ==========");
  const duplicatedDates = Array.from(byDate.entries())
    .filter(([, rows]) => rows.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));

  if (!duplicatedDates.length) {
    console.log("Nenhuma.");
  } else {
    for (const [date, rows] of duplicatedDates) {
      console.log(`${date} -> ${rows.length}`);
      for (const r of rows) {
        console.log(`  ${r.id} | hora=${r.close_hour || "-"} | concurso=${r.contest || "-"}`);
      }
    }
  }

  console.log("");
  console.log("========== CONCURSOS DUPLICADOS ==========");
  const duplicatedContests = Array.from(byContest.entries())
    .filter(([contest, rows]) => contest !== "(sem concurso)" && rows.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));

  if (!duplicatedContests.length) {
    console.log("Nenhum.");
  } else {
    for (const [contest, rows] of duplicatedContests) {
      console.log(`${contest} -> ${rows.length}`);
      for (const r of rows) {
        console.log(`  ${r.date} | ${r.id} | hora=${r.close_hour || "-"}`);
      }
    }
  }

  console.log("");
  console.log("========== VERIFICAÇÃO 04/07/2026 ==========");
  const target = byDate.get("2026-07-04") || [];
  if (!target.length) {
    console.log("NÃO EXISTE documento Federal em 2026-07-04.");
  } else {
    console.log(`Existe: ${target.length} documento(s)`);
    for (const r of target) {
      console.log(`  ${r.id} | hora=${r.close_hour || "-"} | concurso=${r.contest || "-"}`);
    }
  }

  console.log("");
  console.log("========== PRIMEIRAS DATAS ==========");
  Array.from(byDate.keys()).sort().slice(0, 10).forEach((d) => console.log(d));

  console.log("");
  console.log("========== ÚLTIMAS DATAS ==========");
  Array.from(byDate.keys()).sort().slice(-10).forEach((d) => console.log(d));
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
