"use strict";

const {
  getDb,
} = require("../../backend/service/firebaseAdmin");

const LOTTERIES = [
  "PT_RIO",
  "FEDERAL",
  "LOOK",
  "NACIONAL",
];

function safeDate(value) {
  if (!value) {
    return null;
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  return String(value);
}

async function inspectTop3History(db, lotteryKey) {
  const root = db
    .collection("top3_history")
    .doc(lotteryKey);

  const rootSnap = await root.get();

  const metadataSnap = await root
    .collection("metadata")
    .doc("current")
    .get();

  const manifestSnap = await root
    .collection("compact_years")
    .doc("__manifest")
    .get();

  const compactSnap = await root
    .collection("compact_years")
    .get();

  const monthsSnap = await root
    .collection("months")
    .get();

  const compactYears = compactSnap.docs
    .filter((doc) => doc.id !== "__manifest")
    .map((doc) => {
      const data = doc.data() || {};

      return {
        id: doc.id,
        drawCount:
          Number(data.drawCount || 0),
        rows:
          Array.isArray(data.rows)
            ? data.rows.length
            : 0,
        firstYmd:
          data.firstYmd || null,
        lastYmd:
          data.lastYmd || null,
        updatedAt:
          safeDate(data.updatedAt),
      };
    })
    .sort((a, b) =>
      String(a.id).localeCompare(String(b.id))
    );

  const months = monthsSnap.docs
    .map((doc) => {
      const data = doc.data() || {};

      return {
        id: doc.id,
        drawCount:
          Number(data.drawCount || 0),
        draws:
          Array.isArray(data.draws)
            ? data.draws.length
            : 0,
        firstYmd:
          data.firstYmd || null,
        lastYmd:
          data.lastYmd || null,
      };
    })
    .sort((a, b) =>
      String(a.id).localeCompare(String(b.id))
    );

  return {
    lotteryKey,
    rootExists: rootSnap.exists,
    metadataExists: metadataSnap.exists,
    metadata:
      metadataSnap.exists
        ? metadataSnap.data() || {}
        : null,
    manifestExists: manifestSnap.exists,
    manifest:
      manifestSnap.exists
        ? manifestSnap.data() || {}
        : null,
    compactDocumentCount:
      compactYears.length,
    compactYears,
    monthlyDocumentCount:
      months.length,
    monthlyTotalDraws:
      months.reduce(
        (sum, month) =>
          sum +
          Math.max(
            month.drawCount,
            month.draws
          ),
        0
      ),
    months,
  };
}

async function countSourceDraws(db, lotteryKey) {
  const candidates = [
    {
      collection: "draws",
      field: "lottery_key",
    },
    {
      collection: "draws",
      field: "lotteryKey",
    },
    {
      collection: "results",
      field: "lottery_key",
    },
    {
      collection: "results",
      field: "lotteryKey",
    },
  ];

  const results = [];

  for (const candidate of candidates) {
    try {
      const snap = await db
        .collection(candidate.collection)
        .where(
          candidate.field,
          "==",
          lotteryKey
        )
        .limit(5000)
        .get();

      results.push({
        ...candidate,
        ok: true,
        count: snap.size,
        firstIds: snap.docs
          .slice(0, 5)
          .map((doc) => doc.id),
      });
    } catch (error) {
      results.push({
        ...candidate,
        ok: false,
        count: null,
        error:
          error?.message ||
          String(error),
      });
    }
  }

  return results;
}

async function main() {
  const db = getDb();

  const output = {
    generatedAt:
      new Date().toISOString(),
    project:
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      null,
    lotteries: [],
  };

  for (const lotteryKey of LOTTERIES) {
    console.error(
      `[AUDIT] ${lotteryKey}`
    );

    const history =
      await inspectTop3History(
        db,
        lotteryKey
      );

    const sourceCandidates =
      await countSourceDraws(
        db,
        lotteryKey
      );

    output.lotteries.push({
      lotteryKey,
      history,
      sourceCandidates,
    });
  }

  process.stdout.write(
    JSON.stringify(
      output,
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    error?.stack ||
    error?.message ||
    error
  );

  process.exitCode = 1;
});
