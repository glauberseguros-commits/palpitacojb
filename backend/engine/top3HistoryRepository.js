"use strict";

const {
  getDb,
} = require("../service/firebaseAdmin");

const ROOT_COLLECTION = "top3_history";
const MONTHS_COLLECTION = "months";
const METADATA_COLLECTION = "metadata";
const CURRENT_METADATA_DOC = "current";
const SCHEMA_VERSION = 1;

function normalizeLotteryKey(value) {
  const key = String(value || "PT_RIO")
    .trim()
    .toUpperCase();

  if (!key) {
    throw new Error(
      "lotteryKey obrigatório."
    );
  }

  return key;
}

function normalizeYearMonth(value) {
  const yearMonth = String(value || "").trim();

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new Error(
      "yearMonth inválido. Utilize YYYY-MM."
    );
  }

  const month = Number(yearMonth.slice(5, 7));

  if (month < 1 || month > 12) {
    throw new Error(
      "Mês inválido em yearMonth."
    );
  }

  return yearMonth;
}

function normalizeYmd(value) {
  const ymd = String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return null;
  }

  return ymd;
}

function resolveDb(dependencies = {}) {
  if (dependencies.db) {
    return dependencies.db;
  }

  return getDb();
}

function historyRootRef(
  database,
  lotteryKey
) {
  return database
    .collection(ROOT_COLLECTION)
    .doc(normalizeLotteryKey(lotteryKey));
}

function historyMonthRef(
  database,
  lotteryKey,
  yearMonth
) {
  return historyRootRef(
    database,
    lotteryKey
  )
    .collection(MONTHS_COLLECTION)
    .doc(normalizeYearMonth(yearMonth));
}

function metadataRef(
  database,
  lotteryKey
) {
  return historyRootRef(
    database,
    lotteryKey
  )
    .collection(METADATA_COLLECTION)
    .doc(CURRENT_METADATA_DOC);
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function normalizePrize(prize = {}) {
  const position = Number(prize.position);
  const grupo = Number(prize.grupo);

  if (
    !Number.isFinite(position) ||
    position < 1 ||
    position > 10 ||
    !Number.isFinite(grupo) ||
    grupo < 1 ||
    grupo > 25
  ) {
    return null;
  }

  return {
    id: prize.id
      ? String(prize.id)
      : null,
    position,
    grupo,
    milhar:
      prize.milhar != null
        ? String(prize.milhar).padStart(4, "0")
        : null,
    centena:
      prize.centena != null
        ? String(prize.centena).padStart(3, "0")
        : null,
    dezena:
      prize.dezena != null
        ? String(prize.dezena).padStart(2, "0")
        : null,
  };
}

function normalizeDraw(draw = {}) {
  const drawId = String(
    draw.drawId ||
    draw.id ||
    ""
  ).trim();

  const ymd = normalizeYmd(
    draw.ymd ||
    draw.date
  );

  const closeHour = String(
    draw.close_hour ||
    draw.closeHour ||
    draw.hour ||
    ""
  ).trim();

  if (!drawId || !ymd || !closeHour) {
    return null;
  }

  const prizes = safeArray(draw.prizes)
    .map(normalizePrize)
    .filter(Boolean)
    .sort(
      (a, b) =>
        Number(a.position) -
        Number(b.position)
    );

  return {
    drawId,
    id: drawId,
    ymd,
    closeHour,
    lotteryKey: normalizeLotteryKey(
      draw.lottery_key ||
      draw.lotteryKey ||
      "PT_RIO"
    ),
    lotteryCode:
      draw.lottery_code ||
      draw.lotteryCode ||
      null,
    prizes,
  };
}

function sortDraws(draws = []) {
  return [...draws].sort((a, b) => {
    const aKey =
      `${a.ymd}T${a.closeHour}T${a.drawId}`;

    const bKey =
      `${b.ymd}T${b.closeHour}T${b.drawId}`;

    return aKey.localeCompare(bKey);
  });
}

function deduplicateDraws(draws = []) {
  const map = new Map();

  for (const raw of safeArray(draws)) {
    const draw = normalizeDraw(raw);

    if (!draw) {
      continue;
    }

    map.set(draw.drawId, draw);
  }

  return sortDraws(
    Array.from(map.values())
  );
}

async function readHistoryMonth(
  lotteryKey,
  yearMonth,
  dependencies = {}
) {
  const database = resolveDb(dependencies);

  const snap = await historyMonthRef(
    database,
    lotteryKey,
    yearMonth
  ).get();

  if (!snap.exists) {
    return {
      exists: false,
      lotteryKey: normalizeLotteryKey(
        lotteryKey
      ),
      yearMonth: normalizeYearMonth(
        yearMonth
      ),
      draws: [],
      data: null,
    };
  }

  const data = snap.data() || {};

  return {
    exists: true,
    lotteryKey: normalizeLotteryKey(
      lotteryKey
    ),
    yearMonth: normalizeYearMonth(
      yearMonth
    ),
    draws: deduplicateDraws(data.draws),
    data,
  };
}

async function writeHistoryMonth(
  lotteryKey,
  yearMonth,
  draws,
  dependencies = {}
) {
  const database = resolveDb(dependencies);
  const key = normalizeLotteryKey(lotteryKey);
  const month = normalizeYearMonth(yearMonth);

  const normalizedDraws = deduplicateDraws(
    draws
  ).filter(
    (draw) =>
      draw.ymd.slice(0, 7) === month
  );

  const firstDraw =
    normalizedDraws[0] || null;

  const lastDraw =
    normalizedDraws[
      normalizedDraws.length - 1
    ] || null;

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    lotteryKey: key,
    yearMonth: month,
    drawCount: normalizedDraws.length,
    firstYmd: firstDraw?.ymd || null,
    lastYmd: lastDraw?.ymd || null,
    firstDrawId:
      firstDraw?.drawId || null,
    lastDrawId:
      lastDraw?.drawId || null,
    draws: normalizedDraws,
    updatedAt: new Date(),
  };

  await historyMonthRef(
    database,
    key,
    month
  ).set(
    payload,
    {
      merge: false,
    }
  );

  return payload;
}

async function upsertHistoryMonth(
  lotteryKey,
  yearMonth,
  newDraws,
  dependencies = {}
) {
  const current = await readHistoryMonth(
    lotteryKey,
    yearMonth,
    dependencies
  );

  const merged = deduplicateDraws([
    ...current.draws,
    ...safeArray(newDraws),
  ]);

  const payload = await writeHistoryMonth(
    lotteryKey,
    yearMonth,
    merged,
    dependencies
  );

  return {
    ...payload,
    previousDrawCount: current.draws.length,
    previousFirstYmd:
      current.draws[0]?.ymd || null,
    previousLastYmd:
      current.draws[
        current.draws.length - 1
      ]?.ymd || null,
    previousFirstDrawId:
      current.draws[0]?.drawId || null,
    previousLastDrawId:
      current.draws[
        current.draws.length - 1
      ]?.drawId || null,
  };
}

async function readMetadata(
  lotteryKey,
  dependencies = {}
) {
  const database = resolveDb(dependencies);
  const key = normalizeLotteryKey(lotteryKey);

  const snap = await metadataRef(
    database,
    key
  ).get();

  if (!snap.exists) {
    return {
      exists: false,
      lotteryKey: key,
      data: null,
    };
  }

  return {
    exists: true,
    lotteryKey: key,
    data: snap.data() || {},
  };
}

async function writeMetadata(
  lotteryKey,
  metadata = {},
  dependencies = {}
) {
  const database = resolveDb(dependencies);
  const key = normalizeLotteryKey(lotteryKey);

  const payload = {
    ...metadata,
    schemaVersion: SCHEMA_VERSION,
    lotteryKey: key,
    updatedAt: new Date(),
  };

  await metadataRef(
    database,
    key
  ).set(
    payload,
    {
      merge: true,
    }
  );

  return payload;
}

async function listHistoryMonths(
  lotteryKey,
  dependencies = {}
) {
  const database = resolveDb(dependencies);
  const key = normalizeLotteryKey(lotteryKey);

  const snap = await historyRootRef(
    database,
    key
  )
    .collection(MONTHS_COLLECTION)
    .get();

  return snap.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() || {}),
    }))
    .sort(
      (a, b) =>
        String(a.yearMonth || a.id)
          .localeCompare(
            String(b.yearMonth || b.id)
          )
    );
}

async function readFullHistory(
  lotteryKey,
  dependencies = {}
) {
  const database = resolveDb(dependencies);

  const key = normalizeLotteryKey(lotteryKey);

  const snap = await historyRootRef(
    database,
    key
  )
    .collection(MONTHS_COLLECTION)
    .orderBy("yearMonth")
    .select("draws")
    .get();

  const draws = [];

  for (const doc of snap.docs) {
    const data = doc.data() || {};

    if (Array.isArray(data.draws) && data.draws.length) {
      draws.push(...data.draws);
    }
  }

  return deduplicateDraws(draws);
}

module.exports = {
  ROOT_COLLECTION,
  MONTHS_COLLECTION,
  METADATA_COLLECTION,
  SCHEMA_VERSION,
  normalizeLotteryKey,
  normalizeYearMonth,
  normalizeDraw,
  deduplicateDraws,
  readHistoryMonth,
  writeHistoryMonth,
  upsertHistoryMonth,
  readMetadata,
  writeMetadata,
  listHistoryMonths,
  readFullHistory,
};
