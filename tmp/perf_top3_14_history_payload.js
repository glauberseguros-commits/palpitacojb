"use strict";

const zlib = require("zlib");

const {
  getDb,
} = require("../backend/service/firebaseAdmin");

const {
  ROOT_COLLECTION,
  MONTHS_COLLECTION,
  normalizeLotteryKey,
} = require("../backend/engine/top3HistoryRepository");

const LOTTERY_KEY = normalizeLotteryKey(
  process.argv[2] || "PT_RIO"
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

function bytesOf(value) {
  return Buffer.byteLength(
    JSON.stringify(value),
    "utf8"
  );
}

function gzipBytesOf(value) {
  const json = JSON.stringify(value);

  return zlib.gzipSync(
    Buffer.from(json, "utf8")
  ).length;
}

function mib(bytes) {
  return round(
    Number(bytes || 0) /
    1024 /
    1024
  );
}

function pctReduction(original, candidate) {
  if (!original) {
    return 0;
  }

  return round(
    (
      1 -
      Number(candidate || 0) /
      Number(original)
    ) *
    100
  );
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function compactDrawLevel1(draw = {}) {
  return {
    drawId:
      draw.drawId ||
      draw.id ||
      null,
    ymd:
      draw.ymd ||
      draw.date ||
      null,
    closeHour:
      draw.closeHour ||
      draw.close_hour ||
      draw.hour ||
      null,
    prizes: safeArray(draw.prizes).map(
      (prize) => ({
        position:
          prize.position ?? null,
        grupo:
          prize.grupo ?? null,
        milhar:
          prize.milhar ?? null,
        centena:
          prize.centena ?? null,
        dezena:
          prize.dezena ?? null,
      })
    ),
  };
}

function compactDrawLevel2(draw = {}) {
  return {
    ymd:
      draw.ymd ||
      draw.date ||
      null,
    closeHour:
      draw.closeHour ||
      draw.close_hour ||
      draw.hour ||
      null,
    prizes: safeArray(draw.prizes).map(
      (prize) => ({
        position:
          prize.position ?? null,
        grupo:
          prize.grupo ?? null,
        milhar:
          prize.milhar ?? null,
      })
    ),
  };
}

function compactDrawLevel3(draw = {}) {
  return {
    d:
      draw.ymd ||
      draw.date ||
      null,
    h:
      draw.closeHour ||
      draw.close_hour ||
      draw.hour ||
      null,
    p: safeArray(draw.prizes).map(
      (prize) => [
        prize.position ?? null,
        prize.grupo ?? null,
        prize.milhar ?? null,
      ]
    ),
  };
}

async function main() {
  console.log(
    "===================================================================================================="
  );
  console.log(
    "PERF-TOP3-14 — TAMANHO E COMPACTAÇÃO DO HISTÓRICO"
  );
  console.log(
    "===================================================================================================="
  );
  console.log(
    `Loteria: ${LOTTERY_KEY}`
  );

  const database = getDb();

  const queryStart = nowNs();

  const snapshot = await database
    .collection(ROOT_COLLECTION)
    .doc(LOTTERY_KEY)
    .collection(MONTHS_COLLECTION)
    .get();

  const firestoreGetMs =
    elapsedMs(queryStart);

  const months = snapshot.docs.map(
    (doc) => ({
      id: doc.id,
      ...(doc.data() || {}),
    })
  );

  const draws = months.flatMap(
    (month) =>
      safeArray(month.draws)
  );

  const prizes = draws.flatMap(
    (draw) =>
      safeArray(draw.prizes)
  );

  const level1 = draws.map(
    compactDrawLevel1
  );

  const level2 = draws.map(
    compactDrawLevel2
  );

  const level3 = draws.map(
    compactDrawLevel3
  );

  const originalBytes =
    bytesOf(months);

  const drawsOnlyBytes =
    bytesOf(draws);

  const level1Bytes =
    bytesOf(level1);

  const level2Bytes =
    bytesOf(level2);

  const level3Bytes =
    bytesOf(level3);

  const originalGzip =
    gzipBytesOf(months);

  const drawsOnlyGzip =
    gzipBytesOf(draws);

  const level1Gzip =
    gzipBytesOf(level1);

  const level2Gzip =
    gzipBytesOf(level2);

  const level3Gzip =
    gzipBytesOf(level3);

  const fieldPresence = {
    drawsWithDrawId: draws.filter(
      (draw) =>
        Boolean(
          draw?.drawId ||
          draw?.id
        )
    ).length,

    drawsWithYmd: draws.filter(
      (draw) =>
        Boolean(
          draw?.ymd ||
          draw?.date
        )
    ).length,

    drawsWithHour: draws.filter(
      (draw) =>
        Boolean(
          draw?.closeHour ||
          draw?.close_hour ||
          draw?.hour
        )
    ).length,

    prizesWithPosition: prizes.filter(
      (prize) =>
        prize?.position != null
    ).length,

    prizesWithGrupo: prizes.filter(
      (prize) =>
        prize?.grupo != null
    ).length,

    prizesWithMilhar: prizes.filter(
      (prize) =>
        prize?.milhar != null
    ).length,

    prizesWithCentena: prizes.filter(
      (prize) =>
        prize?.centena != null
    ).length,

    prizesWithDezena: prizes.filter(
      (prize) =>
        prize?.dezena != null
    ).length,
  };

  const summary = {
    ok: true,
    lotteryKey: LOTTERY_KEY,
    firestoreGetMs:
      round(firestoreGetMs),

    monthDocuments:
      snapshot.size,

    draws:
      draws.length,

    prizes:
      prizes.length,

    estimatedPayloads: {
      currentMonths: {
        bytes:
          originalBytes,
        mib:
          mib(originalBytes),
        gzipBytes:
          originalGzip,
        gzipMib:
          mib(originalGzip),
      },

      drawsOnly: {
        bytes:
          drawsOnlyBytes,
        mib:
          mib(drawsOnlyBytes),
        reductionPct:
          pctReduction(
            originalBytes,
            drawsOnlyBytes
          ),
        gzipBytes:
          drawsOnlyGzip,
        gzipMib:
          mib(drawsOnlyGzip),
      },

      level1KeepNamedFields: {
        description:
          "drawId, ymd, closeHour e position/grupo/milhar/centena/dezena",
        bytes:
          level1Bytes,
        mib:
          mib(level1Bytes),
        reductionPct:
          pctReduction(
            originalBytes,
            level1Bytes
          ),
        gzipBytes:
          level1Gzip,
        gzipMib:
          mib(level1Gzip),
      },

      level2EssentialNamedFields: {
        description:
          "ymd, closeHour e position/grupo/milhar",
        bytes:
          level2Bytes,
        mib:
          mib(level2Bytes),
        reductionPct:
          pctReduction(
            originalBytes,
            level2Bytes
          ),
        gzipBytes:
          level2Gzip,
        gzipMib:
          mib(level2Gzip),
      },

      level3CompactArrays: {
        description:
          "d, h e prêmios como [position,grupo,milhar]",
        bytes:
          level3Bytes,
        mib:
          mib(level3Bytes),
        reductionPct:
          pctReduction(
            originalBytes,
            level3Bytes
          ),
        gzipBytes:
          level3Gzip,
        gzipMib:
          mib(level3Gzip),
      },
    },

    fieldPresence,
  };

  console.log("");
  console.log(
    "===== PERF-TOP3-14 — RESUMO ====="
  );
  console.log(
    JSON.stringify(
      summary,
      null,
      2
    )
  );

  console.log("");
  console.log(
    "OBSERVAÇÃO:"
  );
  console.log(
    "Este relatório apenas mede tamanhos. Nenhuma estrutura foi gravada no Firestore."
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "PERF-TOP3-14 FALHOU:"
  );
  console.error(
    error?.stack ||
    error?.message ||
    error
  );
  process.exitCode = 1;
});
