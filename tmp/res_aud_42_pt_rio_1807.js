"use strict";

const fs = require("fs");
const path = require("path");
const { getDb } = require("../backend/service/firebaseAdmin");

const TARGET_DATE = "2026-07-18";
const OUT = path.resolve(
  __dirname,
  "res_aud_42_pt_rio_1807.txt"
);

function text(value) {
  return String(value ?? "").trim();
}

function pickHour(data) {
  return text(
    data?.close_hour ??
    data?.closeHour ??
    data?.close ??
    data?.hour ??
    data?.hora ??
    data?.horario ??
    ""
  );
}

function pickLotteryKey(data) {
  return text(
    data?.lottery_key ??
    data?.lotteryKey ??
    data?.lottery ??
    ""
  ).toUpperCase();
}

function isPtRio(data) {
  const key = pickLotteryKey(data);
  const uf = text(data?.uf).toUpperCase();

  return (
    key === "PT_RIO" ||
    key === "RJ" ||
    uf === "RJ"
  );
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function queryByField(db, field, value) {
  try {
    const snap = await db
      .collection("draws")
      .where(field, "==", value)
      .get();

    return {
      ok: true,
      field,
      value,
      docs: snap.docs,
      count: snap.size,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      field,
      value,
      docs: [],
      count: 0,
      error: error?.message || String(error),
    };
  }
}

async function main() {
  const db = getDb();
  const lines = [];

  lines.push(
    "===================================================================================================="
  );
  lines.push(
    "RES-AUD-42 — FIRESTORE PT_RIO 18/07/2026"
  );
  lines.push(
    "===================================================================================================="
  );
  lines.push("");
  lines.push(`Executado em: ${new Date().toISOString()}`);
  lines.push("Nenhum arquivo de código ou dado foi alterado.");
  lines.push("");

  const queries = await Promise.all([
    queryByField(db, "ymd", TARGET_DATE),
    queryByField(db, "date", TARGET_DATE),
    queryByField(
      db,
      "date",
      TARGET_DATE.split("-").reverse().join("/")
    ),
  ]);

  for (const result of queries) {
    lines.push(
      `CONSULTA: ${result.field} == ${result.value} | encontrados=${result.count} | ok=${result.ok}`
    );

    if (result.error) {
      lines.push(`ERRO: ${result.error}`);
    }
  }

  const byId = new Map();

  for (const result of queries) {
    for (const doc of result.docs) {
      byId.set(doc.id, doc);
    }
  }

  const ptRioDocs = Array.from(byId.values())
    .filter((doc) => isPtRio(doc.data() || {}))
    .sort((a, b) => {
      const ah = pickHour(a.data() || {});
      const bh = pickHour(b.data() || {});
      return ah.localeCompare(bh);
    });

  lines.push("");
  lines.push(`DOCUMENTOS ÚNICOS PT_RIO: ${ptRioDocs.length}`);

  const summary = [];

  for (const doc of ptRioDocs) {
    const data = doc.data() || {};

    let prizes = [];
    let prizeError = null;

    try {
      const prizeSnap = await doc.ref
        .collection("prizes")
        .orderBy("position", "asc")
        .get();

      prizes = prizeSnap.docs.map((prizeDoc) => ({
        id: prizeDoc.id,
        ...prizeDoc.data(),
      }));
    } catch (error) {
      prizeError = error?.message || String(error);
    }

    const row = {
      id: doc.id,

      ymd: data.ymd ?? null,
      date: data.date ?? null,

      uf: data.uf ?? null,
      lottery_key:
        data.lottery_key ??
        data.lotteryKey ??
        null,

      lottery_name:
        data.lottery_name ??
        data.lotteryName ??
        null,

      close_hour:
        data.close_hour ??
        data.closeHour ??
        null,

      close_hour_raw:
        data.close_hour_raw ??
        data.closeHourRaw ??
        null,

      hourPicked: pickHour(data),

      prizesCountField:
        data.prizesCount ??
        null,

      prizesSubcollection:
        prizes.length,

      prizeError,

      firstPrize:
        prizes[0] ?? null,

      lastPrize:
        prizes.length
          ? prizes[prizes.length - 1]
          : null,
    };

    summary.push(row);

    lines.push("");
    lines.push(
      "----------------------------------------------------------------------------------------------------"
    );
    lines.push(`DOCUMENTO: ${doc.id}`);
    lines.push(
      "----------------------------------------------------------------------------------------------------"
    );
    lines.push(safeJson(row));
  }

  const byHour = {};

  for (const row of summary) {
    const hour = row.hourPicked || "SEM_HORARIO";

    if (!byHour[hour]) {
      byHour[hour] = {
        documents: 0,
        documentsWithPrizes: 0,
        totalPrizes: 0,
        ids: [],
        closeHourRawValues: [],
        lotteryNames: [],
      };
    }

    byHour[hour].documents += 1;
    byHour[hour].totalPrizes +=
      Number(row.prizesSubcollection || 0);

    if (Number(row.prizesSubcollection || 0) > 0) {
      byHour[hour].documentsWithPrizes += 1;
    }

    byHour[hour].ids.push(row.id);

    if (row.close_hour_raw) {
      byHour[hour].closeHourRawValues.push(
        row.close_hour_raw
      );
    }

    if (row.lottery_name) {
      byHour[hour].lotteryNames.push(
        row.lottery_name
      );
    }
  }

  lines.push("");
  lines.push(
    "===================================================================================================="
  );
  lines.push("RESUMO POR HORÁRIO");
  lines.push(
    "===================================================================================================="
  );
  lines.push(safeJson(byHour));

  lines.push("");
  lines.push(
    "===================================================================================================="
  );
  lines.push("MATRIZ DOS HORÁRIOS CRÍTICOS");
  lines.push(
    "===================================================================================================="
  );

  for (const expected of [
    "18:00",
    "19:00",
    "19:20",
    "21:00",
  ]) {
    const matches = Object.entries(byHour)
      .filter(([hour]) => hour === expected)
      .map(([hour, value]) => ({
        storedHour: hour,
        ...value,
      }));

    lines.push(
      `${expected} => ${
        matches.length
          ? safeJson(matches)
          : "NENHUM DOCUMENTO ENCONTRADO"
      }`
    );
  }

  fs.writeFileSync(
    OUT,
    lines.join("\n"),
    "utf8"
  );

  console.log("");
  console.log("Relatório criado:");
  console.log(OUT);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
