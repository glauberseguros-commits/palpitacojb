"use strict";

const crypto = require("node:crypto");

const {
  readLegacyFullHistory,
  encodeCompactDraw,
  deduplicateDraws,
} = require(
  "../../backend/engine/top3HistoryRepository"
);

const LOTTERIES = [
  "FEDERAL",
  "LOOK",
  "NACIONAL",
];

const SAFE_LIMIT_BYTES = 850 * 1024;

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function jsonBytes(value) {
  return Buffer.byteLength(
    JSON.stringify(value),
    "utf8"
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(value),
      "utf8"
    )
    .digest("hex");
}

function groupByYear(draws) {
  const grouped = new Map();

  for (const draw of safeArray(draws)) {
    const year =
      String(draw?.ymd || "").slice(0, 4);

    if (!/^\d{4}$/.test(year)) {
      continue;
    }

    if (!grouped.has(year)) {
      grouped.set(year, []);
    }

    grouped.get(year).push(draw);
  }

  return grouped;
}

async function inspectLottery(lotteryKey) {
  const startedAt = Date.now();

  const legacy =
    await readLegacyFullHistory(
      lotteryKey
    );

  const normalized =
    deduplicateDraws(legacy);

  if (!normalized.length) {
    throw new Error(
      `Histórico mensal vazio para ${lotteryKey}.`
    );
  }

  const grouped =
    groupByYear(normalized);

  const years =
    Array.from(grouped.keys()).sort();

  const yearResults = [];
  const decodedRows = [];

  for (const year of years) {
    const yearDraws =
      deduplicateDraws(
        grouped.get(year)
      );

    const rows = yearDraws
      .map(encodeCompactDraw)
      .filter(Boolean);

    const first =
      yearDraws[0] || null;

    const last =
      yearDraws[
        yearDraws.length - 1
      ] || null;

    const payload = {
      schemaVersion: 1,
      lotteryKey,
      year,
      drawCount:
        yearDraws.length,
      firstYmd:
        first?.ymd || null,
      lastYmd:
        last?.ymd || null,
      firstDrawId:
        first?.drawId || null,
      lastDrawId:
        last?.drawId || null,
      rows,
    };

    const estimatedBytes =
      jsonBytes(payload);

    decodedRows.push(
      ...yearDraws
    );

    yearResults.push({
      year,
      drawCount:
        yearDraws.length,
      estimatedBytes,
      estimatedKiB:
        Number(
          (
            estimatedBytes / 1024
          ).toFixed(2)
        ),
      withinSafeLimit:
        estimatedBytes <=
        SAFE_LIMIT_BYTES,
      firstYmd:
        first?.ymd || null,
      lastYmd:
        last?.ymd || null,
      sha256:
        sha256(rows),
    });
  }

  const reconstructed =
    deduplicateDraws(decodedRows);

  const sourceIds =
    normalized.map(
      (draw) => draw.drawId
    );

  const reconstructedIds =
    reconstructed.map(
      (draw) => draw.drawId
    );

  const manifest = {
    status: "complete",
    totalDraws:
      normalized.length,
    yearCount:
      years.length,
    years,
    firstYmd:
      normalized[0]?.ymd || null,
    lastYmd:
      normalized[
        normalized.length - 1
      ]?.ymd || null,
    firstDrawId:
      normalized[0]?.drawId || null,
    lastDrawId:
      normalized[
        normalized.length - 1
      ]?.drawId || null,
    source:
      "bootstrap_plus_incremental",
  };

  const oversizedYears =
    yearResults.filter(
      (item) =>
        !item.withinSafeLimit
    );

  const result = {
    lotteryKey,
    totalDraws:
      normalized.length,
    reconstructedDraws:
      reconstructed.length,
    years,
    yearCount:
      years.length,
    firstYmd:
      normalized[0]?.ymd || null,
    lastYmd:
      normalized[
        normalized.length - 1
      ]?.ymd || null,
    totalsMatch:
      normalized.length ===
      reconstructed.length,
    idHashSource:
      sha256(sourceIds),
    idHashReconstructed:
      sha256(reconstructedIds),
    hashesMatch:
      sha256(sourceIds) ===
      sha256(reconstructedIds),
    oversizedYears:
      oversizedYears.map(
        (item) => item.year
      ),
    manifestBytes:
      jsonBytes(manifest),
    yearResults,
    valid:
      normalized.length > 0 &&
      normalized.length ===
        reconstructed.length &&
      sha256(sourceIds) ===
        sha256(reconstructedIds) &&
      oversizedYears.length === 0,
    tookMs:
      Date.now() - startedAt,
  };

  return result;
}

async function main() {
  const results = [];

  for (const lotteryKey of LOTTERIES) {
    console.log("");
    console.log(
      `Analisando ${lotteryKey}...`
    );

    results.push(
      await inspectLottery(
        lotteryKey
      )
    );
  }

  const valid =
    results.every(
      (result) =>
        result.valid === true
    );

  console.log("");
  console.log(
    JSON.stringify(
      {
        mode: "DRY_RUN",
        writesPerformed: 0,
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
