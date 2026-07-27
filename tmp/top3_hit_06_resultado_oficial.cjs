"use strict";

const path = require("path");

const ROOT = process.cwd();

const {
  getDb,
} = require(
  path.join(
    ROOT,
    "backend",
    "service",
    "firebaseAdmin"
  )
);

const db = getDb();

const TARGET_DATE = "2026-07-25";
const TARGET_LOTTERY = "PT_RIO";
const TARGET_HOUR = "09:00";

function normalizeHour(value) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) return "";

  const hh =
    digits.length <= 2
      ? String(Number(digits)).padStart(2, "0")
      : String(Number(digits.slice(0, 2))).padStart(2, "0");

  return `${hh}:00`;
}

function normalizeMilhar(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) return "";

  return digits.slice(-4).padStart(4, "0");
}

function grupoFromMilhar(value) {
  const milhar = normalizeMilhar(value);

  if (!milhar) return null;

  const dezena = Number(milhar.slice(-2));
  const normalizedDezena = dezena === 0 ? 100 : dezena;

  return Math.ceil(normalizedDezena / 4);
}

function lotteryKey(data) {
  return String(
    data?.lottery_key ??
    data?.lotteryKey ??
    data?.lottery ??
    data?.uf ??
    ""
  )
    .trim()
    .toUpperCase();
}

function drawDate(data) {
  return String(
    data?.date ??
    data?.ymd ??
    data?.draw_date ??
    data?.drawDate ??
    ""
  ).trim();
}

function drawHour(data) {
  return normalizeHour(
    data?.close_hour ??
    data?.closeHour ??
    data?.hour ??
    data?.hora ??
    data?.draw_hour ??
    data?.drawHour ??
    ""
  );
}

async function readPrizes(drawRef, drawData) {
  const inline = Array.isArray(drawData?.prizes)
    ? drawData.prizes
    : [];

  const prizeMap = new Map();

  for (let index = 0; index < inline.length; index += 1) {
    const item = inline[index] || {};

    const position = Number(
      item?.position ??
      item?.prize ??
      item?.rank ??
      index + 1
    );

    if (!Number.isFinite(position)) continue;

    prizeMap.set(position, {
      source: "draw.prizes",
      position,
      milhar: normalizeMilhar(
        item?.milhar ??
        item?.numero ??
        item?.number ??
        item?.valor
      ),
      grupo:
        Number(
          item?.grupo ??
          item?.group
        ) || null,
      raw: item,
    });
  }

  try {
    const snapshot = await drawRef
      .collection("prizes")
      .get();

    for (const doc of snapshot.docs) {
      const item = doc.data() || {};

      const position = Number(
        item?.position ??
        item?.prize ??
        item?.rank ??
        doc.id
      );

      if (!Number.isFinite(position)) continue;

      const milhar = normalizeMilhar(
        item?.milhar ??
        item?.numero ??
        item?.number ??
        item?.valor
      );

      prizeMap.set(position, {
        source: "subcollection prizes",
        id: doc.id,
        position,
        milhar,
        grupo:
          Number(
            item?.grupo ??
            item?.group
          ) ||
          grupoFromMilhar(milhar),
        raw: item,
      });
    }
  } catch (error) {
    console.log(
      `Aviso ao ler subcoleção prizes: ${error.message}`
    );
  }

  return Array.from(prizeMap.values())
    .sort((a, b) => a.position - b.position);
}

async function main() {
  console.log(
    "===================================================================================================="
  );
  console.log(
    "TOP3-HIT-06 — RESULTADO OFICIAL PT_RIO 25/07/2026 09H"
  );
  console.log(
    "===================================================================================================="
  );

  const snapshot = await db
    .collection("draws")
    .where("date", "==", TARGET_DATE)
    .get();

  const matches = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};

    if (lotteryKey(data) !== TARGET_LOTTERY) {
      continue;
    }

    if (drawHour(data) !== TARGET_HOUR) {
      continue;
    }

    const prizes = await readPrizes(
      doc.ref,
      data
    );

    matches.push({
      path: doc.ref.path,
      id: doc.id,
      date: drawDate(data),
      hour: drawHour(data),
      lotteryKey: lotteryKey(data),
      prizesCount:
        data?.prizesCount ??
        prizes.length,
      prizes,
      rawDraw: data,
    });
  }

  console.log("");
  console.log(
    `DOCUMENTOS LOCALIZADOS: ${matches.length}`
  );

  if (!matches.length) {
    console.log("");
    console.log(
      "STATUS: RESULTADO OFICIAL DAS 09H NÃO LOCALIZADO EM draws."
    );
    return;
  }

  for (const match of matches) {
    console.log("");
    console.log(
      "===================================================================================================="
    );
    console.log(`CAMINHO: ${match.path}`);
    console.log(
      "===================================================================================================="
    );

    console.log(
      JSON.stringify(match, null, 2)
    );

    console.log("");
    console.log("PÓDIO NORMALIZADO:");

    for (const prize of match.prizes.slice(0, 3)) {
      console.log(
        `${prize.position}º prêmio | milhar: ${prize.milhar || "VAZIA"} | grupo: ${prize.grupo ?? "VAZIO"}`
      );
    }
  }

  console.log("");
  console.log(
    "===================================================================================================="
  );
  console.log("CONCLUSÃO");
  console.log(
    "===================================================================================================="
  );

  const firstComplete = matches.find(
    (item) =>
      item.prizes.filter(
        (prize) =>
          prize.position >= 1 &&
          prize.position <= 3 &&
          prize.milhar
      ).length >= 3
  );

  if (firstComplete) {
    console.log(
      "STATUS: RESULTADO OFICIAL COMPLETO LOCALIZADO."
    );
    console.log(
      "PRÓXIMO PASSO: reconciliar top3_predictions/PT_RIO__2026-07-25__09."
    );
  } else {
    console.log(
      "STATUS: DRAW LOCALIZADO, MAS O PÓDIO NÃO POSSUI AS TRÊS MILHARES COMPLETAS."
    );
  }
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error("");
    console.error("ERRO NA AUDITORIA:");
    console.error(
      error?.stack ||
      error?.message ||
      error
    );
    process.exitCode = 1;
  });
