"use strict";

const {
  getDb,
} = require("../backend/service/firebaseAdmin");

const {
  ROOT_COLLECTION,
  MONTHS_COLLECTION,
  normalizeLotteryKey,
  deduplicateDraws,
} = require("../backend/engine/top3HistoryRepository");

const LOTTERY_KEY = normalizeLotteryKey(
  process.argv[2] || "PT_RIO"
);

const RUNS = Math.max(
  1,
  Number(process.argv[3] || 3)
);

function nowNs() {
  return process.hrtime.bigint();
}

function elapsedMs(startNs) {
  return Number(
    process.hrtime.bigint() - startNs
  ) / 1_000_000;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce(
    (total, value) => total + value,
    0
  ) / values.length;
}

function median(values) {
  if (!values.length) {
    return 0;
  }

  const ordered = [...values].sort(
    (a, b) => a - b
  );

  const middle = Math.floor(
    ordered.length / 2
  );

  if (ordered.length % 2 === 1) {
    return ordered[middle];
  }

  return (
    ordered[middle - 1] +
    ordered[middle]
  ) / 2;
}

async function profileOnce(
  database,
  runNumber
) {
  const totalStart = nowNs();

  const queryStart = nowNs();

  const snapshot = await database
    .collection(ROOT_COLLECTION)
    .doc(LOTTERY_KEY)
    .collection(MONTHS_COLLECTION)
    .get();

  const firestoreGetMs =
    elapsedMs(queryStart);

  const documentDataStart = nowNs();

  const months = snapshot.docs.map(
    (doc) => ({
      id: doc.id,
      ...(doc.data() || {}),
    })
  );

  const documentDataMs =
    elapsedMs(documentDataStart);

  const sortMonthsStart = nowNs();

  months.sort(
    (a, b) =>
      String(a.yearMonth || a.id)
        .localeCompare(
          String(b.yearMonth || b.id)
        )
  );

  const sortMonthsMs =
    elapsedMs(sortMonthsStart);

  const flattenStart = nowNs();

  const rawDraws = [];

  for (const month of months) {
    if (Array.isArray(month.draws)) {
      rawDraws.push(...month.draws);
    }
  }

  const flattenMs =
    elapsedMs(flattenStart);

  const deduplicateStart = nowNs();

  const finalDraws =
    deduplicateDraws(rawDraws);

  const deduplicateMs =
    elapsedMs(deduplicateStart);

  const totalMs =
    elapsedMs(totalStart);

  const result = {
    run: runNumber,
    lotteryKey: LOTTERY_KEY,
    monthDocuments: snapshot.size,
    rawDraws: rawDraws.length,
    finalDraws: finalDraws.length,
    removedDuplicates:
      rawDraws.length - finalDraws.length,
    firestoreGetMs:
      round(firestoreGetMs),
    documentDataMs:
      round(documentDataMs),
    sortMonthsMs:
      round(sortMonthsMs),
    flattenMs:
      round(flattenMs),
    deduplicateMs:
      round(deduplicateMs),
    totalMs:
      round(totalMs),
  };

  console.log("");
  console.log(
    `===== EXECUÇÃO ${runNumber}/${RUNS} =====`
  );
  console.log(JSON.stringify(
    result,
    null,
    2
  ));

  return result;
}

async function main() {
  console.log(
    "===================================================================================================="
  );
  console.log(
    "PERF-TOP3-12 — DECOMPOSIÇÃO DA LEITURA DO HISTÓRICO"
  );
  console.log(
    "===================================================================================================="
  );
  console.log(
    `Loteria: ${LOTTERY_KEY}`
  );
  console.log(
    `Execuções: ${RUNS}`
  );

  const initStart = nowNs();
  const database = getDb();
  const firebaseInitMs =
    elapsedMs(initStart);

  console.log(
    `Firebase init: ${round(firebaseInitMs)}ms`
  );

  const results = [];

  for (
    let run = 1;
    run <= RUNS;
    run += 1
  ) {
    results.push(
      await profileOnce(
        database,
        run
      )
    );
  }

  const metrics = [
    "firestoreGetMs",
    "documentDataMs",
    "sortMonthsMs",
    "flattenMs",
    "deduplicateMs",
    "totalMs",
  ];

  const summary = {
    ok: true,
    lotteryKey: LOTTERY_KEY,
    runs: RUNS,
    firebaseInitMs:
      round(firebaseInitMs),
    monthDocuments:
      results[0]?.monthDocuments || 0,
    rawDraws:
      results[0]?.rawDraws || 0,
    finalDraws:
      results[0]?.finalDraws || 0,
    removedDuplicates:
      results[0]?.removedDuplicates || 0,
    averages: {},
    medians: {},
    executions: results,
  };

  for (const metric of metrics) {
    const values = results.map(
      (item) =>
        Number(item[metric] || 0)
    );

    summary.averages[metric] =
      round(average(values));

    summary.medians[metric] =
      round(median(values));
  }

  console.log("");
  console.log(
    "===== PERF-TOP3-12 — RESUMO ====="
  );
  console.log(JSON.stringify(
    summary,
    null,
    2
  ));
}

main().catch((error) => {
  console.error("");
  console.error(
    "PERF-TOP3-12 FALHOU:"
  );
  console.error(
    error?.stack ||
    error?.message ||
    error
  );
  process.exitCode = 1;
});
