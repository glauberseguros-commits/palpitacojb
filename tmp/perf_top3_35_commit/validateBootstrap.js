"use strict";

const {
  getDb,
} = require("../../backend/service/firebaseAdmin");

const {
  readMetadata,
  listHistoryMonths,
  readFullHistory,
} = require("../../backend/engine/top3HistoryRepository");

const LOTTERIES = [
  "FEDERAL",
  "LOOK",
  "NACIONAL",
];

async function main() {
  const db = getDb();
  const results = [];

  for (const lotteryKey of LOTTERIES) {
    const metadataResult =
      await readMetadata(lotteryKey, { db });

    const months =
      await listHistoryMonths(
        lotteryKey,
        { db }
      );

    const history =
      await readFullHistory(
        lotteryKey,
        {
          db,
          forceLegacy: true,
        }
      );

    const metadata =
      metadataResult?.data || null;

    const expectedTotal =
      Number(metadata?.totalDraws || 0);

    const result = {
      lotteryKey,
      metadataExists:
        metadataResult?.exists === true,
      bootstrapStatus:
        metadata?.bootstrapStatus || null,
      expectedTotal,
      loadedTotal:
        history.length,
      monthCountMetadata:
        Number(metadata?.monthCount || 0),
      monthCountLoaded:
        months.length,
      firstYmd:
        history[0]?.ymd || null,
      lastYmd:
        history[
          history.length - 1
        ]?.ymd || null,
      totalsMatch:
        expectedTotal === history.length,
      monthsMatch:
        Number(metadata?.monthCount || 0) ===
        months.length,
      valid:
        metadataResult?.exists === true &&
        metadata?.bootstrapStatus ===
          "complete" &&
        expectedTotal > 0 &&
        expectedTotal === history.length &&
        Number(metadata?.monthCount || 0) ===
          months.length,
    };

    results.push(result);
  }

  const valid =
    results.every(
      (item) => item.valid === true
    );

  console.log(
    JSON.stringify(
      {
        valid,
        results,
      },
      null,
      2
    )
  );

  if (!valid) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    error?.stack ||
    error?.message ||
    error
  );

  process.exitCode = 1;
});
