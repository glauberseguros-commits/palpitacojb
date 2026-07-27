"use strict";

const fs = require("fs");
const path = require("path");
const { getDb } = require("../backend/service/firebaseAdmin");

const DATES = [
  "2026-07-19",
  "2026-07-22",
];

const OUT = path.resolve(
  __dirname,
  "res_aud_38_firestore_cards.txt"
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
      count: snap.size,
      docs: snap.docs,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      field,
      count: 0,
      docs: [],
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
    "RES-AUD-38 — PROVA REAL DOS HORÁRIOS NO FIRESTORE"
  );
  lines.push(
    "===================================================================================================="
  );
  lines.push("");
  lines.push(`Executado em: ${new Date().toISOString()}`);
  lines.push("Nenhum arquivo do projeto foi alterado.");
  lines.push("");

  for (const date of DATES) {
    lines.push("");
    lines.push(
      "===================================================================================================="
    );
    lines.push(`DATA: ${date}`);
    lines.push(
      "===================================================================================================="
    );

    const queries = await Promise.all([
      queryByField(db, "ymd", date),
      queryByField(db, "date", date),
      queryByField(db, "date", date.split("-").reverse().join("/")),
    ]);

    for (const result of queries) {
      lines.push("");
      lines.push(
        `CONSULTA: ${result.field} | encontrados=${result.count} | ok=${result.ok}`
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
        lottery_code:
          data.lottery_code ??
          data.lotteryCode ??
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
        };
      }

      byHour[hour].documents += 1;
      byHour[hour].totalPrizes +=
        Number(row.prizesSubcollection || 0);

      if (Number(row.prizesSubcollection || 0) > 0) {
        byHour[hour].documentsWithPrizes += 1;
      }

      byHour[hour].ids.push(row.id);
    }

    lines.push("");
    lines.push(
      "----------------------------------------------------------------------------------------------------"
    );
    lines.push("RESUMO POR HORÁRIO");
    lines.push(
      "----------------------------------------------------------------------------------------------------"
    );
    lines.push(safeJson(byHour));

    const expected =
      date === "2026-07-19"
        ? ["09", "11", "14", "16"]
        : ["09", "11", "14", "16", "18", "21"];

    lines.push("");
    lines.push("MATRIZ DOS HORÁRIOS INVESTIGADOS:");

    for (const expectedHour of expected) {
      const matches = Object.entries(byHour)
        .filter(([hour]) =>
          String(hour).startsWith(expectedHour)
        )
        .map(([hour, value]) => ({
          storedHour: hour,
          ...value,
        }));

      lines.push(
        `${expectedHour}h => ${
          matches.length
            ? safeJson(matches)
            : "NENHUM DOCUMENTO ENCONTRADO"
        }`
      );
    }
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
