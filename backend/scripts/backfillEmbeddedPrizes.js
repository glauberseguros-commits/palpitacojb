"use strict";

/**
 * Preenche o campo prizes no documento principal de cada sorteio,
 * copiando os dados já existentes em draws/{drawId}/prizes.
 *
 * Segurança:
 * - dry-run por padrão;
 * - não altera documentos que já possuem prizes;
 * - pagina por documentId;
 * - grava em lotes controlados;
 * - preserva integralmente a subcoleção prizes.
 */

const { admin, db } = require("../service/firebaseAdmin");

function parsePositiveInt(value, fallback) {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }

  return Math.trunc(n);
}

function normalizePrizeDocument(doc) {
  const data = doc.data() || {};

  return {
    prizeId: doc.id,
    position: Number(data.position),
    raw: data.raw ?? null,
    milhar: data.milhar ?? null,
    centena: data.centena ?? null,
    dezena: data.dezena ?? null,
    grupo:
      data.grupo === null ||
      data.grupo === undefined
        ? null
        : Number(data.grupo),
    animal: data.animal ?? null,
  };
}

function isValidPrize(prize) {
  return (
    prize &&
    Number.isFinite(Number(prize.position)) &&
    Number(prize.position) >= 1 &&
    Number(prize.position) <= 15
  );
}

async function run({
  apply = false,
  limit = 100,
  pageSize = 100,
} = {}) {
  const startedAt = Date.now();

  const stats = {
    mode: apply ? "APPLY" : "DRY_RUN",
    limit,
    pageSize,
    scanned: 0,
    alreadyEmbedded: 0,
    missingEmbedded: 0,
    subcollectionsRead: 0,
    withoutSubcollectionPrizes: 0,
    invalidPrizesRemoved: 0,
    eligibleForUpdate: 0,
    updated: 0,
    errors: 0,
    firstDocumentId: null,
    lastDocumentId: null,
    tookMs: 0,
  };

  let lastDoc = null;
  let writeBatch = db.batch();
  let pendingWrites = 0;

  while (stats.scanned < limit) {
    const remaining = limit - stats.scanned;
    const currentPageSize = Math.min(pageSize, remaining);

    let query = db
      .collection("draws")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(currentPageSize);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      break;
    }

    for (const drawDoc of snapshot.docs) {
      const drawData = drawDoc.data() || {};

      stats.scanned += 1;
      stats.firstDocumentId =
        stats.firstDocumentId || drawDoc.id;
      stats.lastDocumentId = drawDoc.id;

      if (
        Array.isArray(drawData.prizes) &&
        drawData.prizes.length > 0
      ) {
        stats.alreadyEmbedded += 1;
        continue;
      }

      stats.missingEmbedded += 1;

      try {
        const prizesSnapshot = await drawDoc.ref
          .collection("prizes")
          .orderBy("position", "asc")
          .get();

        stats.subcollectionsRead += 1;

        if (prizesSnapshot.empty) {
          stats.withoutSubcollectionPrizes += 1;
          continue;
        }

        const rawPrizes =
          prizesSnapshot.docs.map(normalizePrizeDocument);

        const prizes =
          rawPrizes.filter(isValidPrize);

        stats.invalidPrizesRemoved +=
          rawPrizes.length - prizes.length;

        prizes.sort(
          (a, b) =>
            Number(a.position) -
            Number(b.position)
        );

        if (!prizes.length) {
          stats.withoutSubcollectionPrizes += 1;
          continue;
        }

        stats.eligibleForUpdate += 1;

        if (apply) {
          writeBatch.set(
            drawDoc.ref,
            {
              prizes,
              prizesCount: prizes.length,
              prizesEmbeddedAt:
                admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          pendingWrites += 1;

          if (pendingWrites >= 400) {
            await writeBatch.commit();
            stats.updated += pendingWrites;

            writeBatch = db.batch();
            pendingWrites = 0;
          }
        }
      } catch (error) {
        stats.errors += 1;

        console.error(
          `[BACKFILL] ERRO draw=${drawDoc.id}:`,
          error?.message || error
        );
      }
    }

    lastDoc =
      snapshot.docs[snapshot.docs.length - 1];

    if (snapshot.size < currentPageSize) {
      break;
    }
  }

  if (apply && pendingWrites > 0) {
    await writeBatch.commit();
    stats.updated += pendingWrites;
  }

  stats.tookMs = Date.now() - startedAt;

  console.log("");
  console.log(
    "===== EMBEDDED PRIZES BACKFILL ====="
  );
  console.log(JSON.stringify(stats, null, 2));

  return stats;
}

async function main() {
  const args = process.argv.slice(2);

  const apply = args.includes("--apply");

  const limitArg =
    args.find((arg) =>
      arg.startsWith("--limit=")
    );

  const pageSizeArg =
    args.find((arg) =>
      arg.startsWith("--page-size=")
    );

  const limit = parsePositiveInt(
    limitArg?.split("=")[1],
    100
  );

  const pageSize = parsePositiveInt(
    pageSizeArg?.split("=")[1],
    100
  );

  await run({
    apply,
    limit,
    pageSize,
  });
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(
        "ERRO:",
        error?.stack ||
          error?.message ||
          error
      );

      process.exit(1);
    });
}

module.exports = {
  run,
};
