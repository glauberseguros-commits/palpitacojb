"use strict";

const crypto = require("crypto");

const {
  readLegacyFullHistory,
  readCompactFullHistory,
  readFullHistory,
} = require("../backend/engine/top3HistoryRepository");

function stable(value) {
  return JSON.stringify(value);
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(stable(value))
    .digest("hex");
}

function elapsedMs(start) {
  return Number(
    process.hrtime.bigint() - start
  ) / 1_000_000;
}

function canonical(draws) {
  return draws.map((draw) => ({
    drawId: draw.drawId,
    ymd: draw.ymd,
    closeHour: draw.closeHour,
    lotteryKey: draw.lotteryKey,
    lotteryCode:
      draw.lotteryCode || null,
    prizes: (draw.prizes || []).map(
      (prize) => ({
        id: prize.id || null,
        position: prize.position,
        grupo: prize.grupo,
        milhar: prize.milhar,
        centena: prize.centena,
        dezena: prize.dezena,
      })
    ),
  }));
}

async function measure(fn) {
  const start =
    process.hrtime.bigint();

  const value = await fn();

  return {
    value,
    ms:
      Math.round(
        elapsedMs(start) * 100
      ) / 100,
  };
}

async function main() {
  const lotteryKey =
    String(process.argv[2] || "PT_RIO")
      .trim()
      .toUpperCase();

  const legacy =
    await measure(
      () =>
        readLegacyFullHistory(
          lotteryKey
        )
    );

  const compact =
    await measure(
      () =>
        readCompactFullHistory(
          lotteryKey
        )
    );

  const automatic =
    await measure(
      () =>
        readFullHistory(
          lotteryKey
        )
    );

  const legacyCanonical =
    canonical(legacy.value);

  const compactCanonical =
    canonical(compact.value);

  const automaticCanonical =
    canonical(automatic.value);

  const legacyHash =
    hash(legacyCanonical);

  const compactHash =
    hash(compactCanonical);

  const automaticHash =
    hash(automaticCanonical);

  const equal =
    legacyHash === compactHash &&
    legacyHash === automaticHash;

  const result = {
    ok: equal,
    lotteryKey,

    counts: {
      legacy:
        legacy.value.length,
      compact:
        compact.value.length,
      automatic:
        automatic.value.length,
    },

    hashes: {
      legacy:
        legacyHash,
      compact:
        compactHash,
      automatic:
        automaticHash,
    },

    performanceMs: {
      legacy:
        legacy.ms,
      compact:
        compact.ms,
      automatic:
        automatic.ms,
    },

    improvementPct:
      legacy.ms > 0
        ? Math.round(
            (
              1 -
              automatic.ms /
              legacy.ms
            ) *
              10000
          ) / 100
        : 0,
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  if (!equal) {
    throw new Error(
      "Histórico compacto diverge do histórico mensal."
    );
  }

  if (!automatic.value.length) {
    throw new Error(
      "Leitura automática retornou histórico vazio."
    );
  }
}

main().catch((error) => {
  console.error(
    error?.stack ||
    error?.message ||
    error
  );

  process.exit(1);
});
