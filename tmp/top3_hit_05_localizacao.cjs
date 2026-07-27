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

const TARGET_YMD = "2026-07-25";
const TARGET_HOURS = new Set([
  "09",
  "09h",
  "09:00",
  "0900",
]);

function text(value) {
  return String(value ?? "").trim();
}

function normalizeYmd(value) {
  const raw = text(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const br = raw.match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/
  );

  return br
    ? `${br[3]}-${br[2]}-${br[1]}`
    : "";
}

function normalizeHour(value) {
  const digits = text(value).replace(/\D/g, "");

  if (!digits) return "";

  if (digits.length <= 2) {
    return String(Number(digits)).padStart(2, "0");
  }

  return String(Number(digits.slice(0, 2))).padStart(
    2,
    "0"
  );
}

function matchesTarget(data, id = "") {
  const ymdValues = [
    data?.targetYmd,
    data?.ymd,
    data?.date,
    data?.data,
    data?.drawDate,
    data?.draw_date,
  ]
    .map(normalizeYmd)
    .filter(Boolean);

  const hourValues = [
    data?.targetHour,
    data?.hour,
    data?.hora,
    data?.drawHour,
    data?.draw_hour,
    data?.slot,
    data?.baseHour,
  ]
    .map(normalizeHour)
    .filter(Boolean);

  const idText = text(id);

  const dateMatch =
    ymdValues.includes(TARGET_YMD) ||
    idText.includes(TARGET_YMD);

  const hourMatch =
    hourValues.includes("09") ||
    /(?:^|[_-])0900(?:$|[_-])/.test(idText) ||
    /(?:^|[_-])09h?(?:$|[_-])/.test(idText);

  return dateMatch && hourMatch;
}

function safeValue(value) {
  if (
    value &&
    typeof value.toDate === "function"
  ) {
    try {
      return value.toDate().toISOString();
    } catch {
      return "[Timestamp]";
    }
  }

  return value;
}

function cleanObject(value, depth = 0) {
  if (depth > 5) {
    return "[PROFUNDIDADE LIMITADA]";
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      cleanObject(item, depth + 1)
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    if (typeof value.toDate === "function") {
      return safeValue(value);
    }

    const result = {};

    for (const [key, item] of Object.entries(value)) {
      result[key] = cleanObject(
        item,
        depth + 1
      );
    }

    return result;
  }

  return value;
}

function summarize(pathName, id, data) {
  return {
    path: pathName,
    id,
    lotteryKey:
      data?.lotteryKey ??
      data?.lottery_key ??
      data?.lottery ??
      "",
    targetYmd:
      data?.targetYmd ??
      data?.ymd ??
      data?.date ??
      data?.data ??
      "",
    targetHour:
      data?.targetHour ??
      data?.hour ??
      data?.hora ??
      data?.baseHour ??
      "",
    status: data?.status ?? "",
    resultGrupo:
      data?.resultGrupo ?? null,
    resultMilhar:
      data?.resultMilhar ?? "",
    resultTop3Groups:
      data?.resultTop3Groups ?? [],
    resultTop3Milhares:
      data?.resultTop3Milhares ?? [],
    matchedGrupo:
      data?.matchedGrupo ?? null,
    matchedMilhar:
      data?.matchedMilhar ?? "",
    hitType:
      data?.hitType ?? "",
    hitScore:
      data?.hitScore ?? 0,
    hitPosition:
      data?.hitPosition ?? -1,
    resultPosition:
      data?.resultPosition ?? -1,
    predictionPosition:
      data?.predictionPosition ?? -1,
    snapshot:
      data?.snapshot ?? [],
    top3:
      data?.top3 ?? [],
    prizes:
      data?.prizes ?? [],
    raw: cleanObject(data),
  };
}

async function scanCollection(
  collectionRef,
  collectionPath,
  limit = 500
) {
  const found = [];

  const snapshot = await collectionRef
    .limit(limit)
    .get();

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};

    if (matchesTarget(data, doc.id)) {
      found.push(
        summarize(
          `${collectionPath}/${doc.id}`,
          doc.id,
          data
        )
      );
    }
  }

  return found;
}

async function main() {
  console.log(
    "===================================================================================================="
  );
  console.log(
    "TOP3-HIT-05 — LOCALIZAÇÃO REAL DO HISTÓRICO 25/07/2026 09H"
  );
  console.log(
    "===================================================================================================="
  );
  console.log(`Data alvo: ${TARGET_YMD}`);
  console.log("Horário alvo: 09h");
  console.log("");

  const results = [];

  console.log(
    "===================================================================================================="
  );
  console.log(
    "1. TODOS OS DOCUMENTOS DE top3_predictions DA DATA"
  );
  console.log(
    "===================================================================================================="
  );

  const predictionQueries = [
    ["targetYmd", TARGET_YMD],
    ["ymd", TARGET_YMD],
    ["date", TARGET_YMD],
  ];

  const predictionMap = new Map();

  for (const [field, value] of predictionQueries) {
    try {
      const snap = await db
        .collection("top3_predictions")
        .where(field, "==", value)
        .limit(100)
        .get();

      for (const doc of snap.docs) {
        predictionMap.set(doc.id, doc);
      }
    } catch (error) {
      console.log(
        `Consulta ignorada: ${field} | ${error.message}`
      );
    }
  }

  if (!predictionMap.size) {
    console.log(
      "Nenhum documento encontrado em top3_predictions para a data."
    );
  } else {
    for (const doc of predictionMap.values()) {
      const data = doc.data() || {};

      const item = summarize(
        doc.ref.path,
        doc.id,
        data
      );

      console.log(
        JSON.stringify(item, null, 2)
      );

      if (matchesTarget(data, doc.id)) {
        results.push(item);
      }
    }
  }

  console.log("");
  console.log(
    "===================================================================================================="
  );
  console.log(
    "2. COLEÇÕES RAIZ E SUBCOLEÇÕES RELACIONADAS A TOP3/HISTORY"
  );
  console.log(
    "===================================================================================================="
  );

  const rootCollections = await db.listCollections();

  for (const collection of rootCollections) {
    const name = collection.id.toLowerCase();

    if (
      !name.includes("top3") &&
      !name.includes("history") &&
      !name.includes("histor")
    ) {
      continue;
    }

    console.log(
      `\nCOLEÇÃO RAIZ: ${collection.id}`
    );

    try {
      const rootFound = await scanCollection(
        collection,
        collection.id,
        500
      );

      results.push(...rootFound);

      for (const item of rootFound) {
        console.log(
          JSON.stringify(item, null, 2)
        );
      }

      const rootDocs = await collection
        .limit(100)
        .get();

      for (const rootDoc of rootDocs.docs) {
        const subcollections =
          await rootDoc.ref.listCollections();

        for (const subcollection of subcollections) {
          console.log(
            `SUBCOLEÇÃO: ${rootDoc.ref.path}/${subcollection.id}`
          );

          const subFound =
            await scanCollection(
              subcollection,
              `${rootDoc.ref.path}/${subcollection.id}`,
              500
            );

          results.push(...subFound);

          for (const item of subFound) {
            console.log(
              JSON.stringify(item, null, 2)
            );
          }

          const subDocs = await subcollection
            .limit(100)
            .get();

          for (const subDoc of subDocs.docs) {
            const nestedCollections =
              await subDoc.ref.listCollections();

            for (
              const nestedCollection
              of nestedCollections
            ) {
              console.log(
                `SUBCOLEÇÃO NÍVEL 2: ${subDoc.ref.path}/${nestedCollection.id}`
              );

              const nestedFound =
                await scanCollection(
                  nestedCollection,
                  `${subDoc.ref.path}/${nestedCollection.id}`,
                  500
                );

              results.push(...nestedFound);

              for (const item of nestedFound) {
                console.log(
                  JSON.stringify(
                    item,
                    null,
                    2
                  )
                );
              }
            }
          }
        }
      }
    } catch (error) {
      console.log(
        `ERRO AO LER ${collection.id}: ${error.message}`
      );
    }
  }

  console.log("");
  console.log(
    "===================================================================================================="
  );
  console.log("3. RESUMO DOS REGISTROS ALVO");
  console.log(
    "===================================================================================================="
  );

  const unique = new Map();

  for (const item of results) {
    unique.set(item.path, item);
  }

  if (!unique.size) {
    console.log(
      "STATUS: NENHUM REGISTRO DE 25/07/2026 09H LOCALIZADO NAS ESTRUTURAS TOP3/HISTORY."
    );
  } else {
    console.log(
      `Quantidade localizada: ${unique.size}`
    );

    for (const item of unique.values()) {
      console.log("");
      console.log(`CAMINHO: ${item.path}`);
      console.log(
        `resultGrupo: ${JSON.stringify(
          item.resultGrupo
        )}`
      );
      console.log(
        `resultMilhar: ${JSON.stringify(
          item.resultMilhar
        )}`
      );
      console.log(
        `resultTop3Groups: ${JSON.stringify(
          item.resultTop3Groups
        )}`
      );
      console.log(
        `resultTop3Milhares: ${JSON.stringify(
          item.resultTop3Milhares
        )}`
      );
      console.log(
        `matchedGrupo: ${JSON.stringify(
          item.matchedGrupo
        )}`
      );
      console.log(
        `matchedMilhar: ${JSON.stringify(
          item.matchedMilhar
        )}`
      );
      console.log(
        `hitType: ${JSON.stringify(
          item.hitType
        )}`
      );
    }
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
