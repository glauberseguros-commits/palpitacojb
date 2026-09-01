"use strict";

const fs = require("fs");
const path = require("path");

/*
 * PT_SP_SOURCE_IDENTITY_LOCK_V1
 *
 * PT_SP precisa preservar a identidade individual de cada fonte King.
 * O importador le KING_FETCH_PER_LOTTERY durante o carregamento.
 * Portanto o modo por fonte deve ser travado antes do require.
 */
const PTSP_SOURCE_REGISTRY_PATH =
  path.join(
    __dirname,
    "..",
    "data",
    "pt_sp",
    "source_registry.json"
  );

const PTSP_SOURCE_REGISTRY =
  JSON.parse(
    fs.readFileSync(
      PTSP_SOURCE_REGISTRY_PATH,
      "utf8"
    )
  );

const PTSP_SOURCE_IDS =
  Object.freeze(
    (
      Array.isArray(
        PTSP_SOURCE_REGISTRY?.sources
      )
        ? PTSP_SOURCE_REGISTRY.sources
        : []
    )
      .map(
        (source) =>
          String(
            source?.uuid || ""
          ).trim()
      )
      .filter(Boolean)
  );

const PTSP_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (
  PTSP_SOURCE_IDS.length !== 8 ||
  new Set(
    PTSP_SOURCE_IDS
  ).size !== 8 ||
  PTSP_SOURCE_IDS.some(
    (sourceId) =>
      !PTSP_UUID_PATTERN.test(
        sourceId
      )
  )
) {
  throw new Error(
    "PTSP_SOURCE_REGISTRY_INVALID"
  );
}

const PTSP_SOURCE_ID_SET =
  new Set(
    PTSP_SOURCE_IDS
  );

/*
 * PT_SP_SOURCE_SET_LOCK_V1
 *
 * O importador aceita override de KING_LOTTERIES_PT_SP.
 * Nesta automacao, a lista valida vem exclusivamente do registry
 * versionado do PT_SP e deve ser fixada ANTES do require.
 */
process.env.KING_FETCH_PER_LOTTERY = "1";

process.env.KING_LOTTERIES_PT_SP =
  PTSP_SOURCE_IDS.join(",");


const { getDb } = require("../service/firebaseAdmin");

const {
  fetchKingResults,
  importFromPayload,
} = require("./importKingApostas");

const LOTTERY_KEY = "PT_SP";
const STATE_CODE = "SP";
const TIME_ZONE = "America/Sao_Paulo";

const DRY_RUN =
  String(process.env.PTSP_AUTO_DRY_RUN || "").trim() === "1";

function todayYmdSaoPaulo(date = new Date()) {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    );

  const parts =
    Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter(
          (part) =>
            part.type !== "literal"
        )
        .map(
          (part) => [
            part.type,
            part.value,
          ]
        )
    );

  return (
    `${parts.year}-` +
    `${parts.month}-` +
    `${parts.day}`
  );
}

function resolveTargetDate() {
  const forced =
    String(
      process.env.DATE || ""
    ).trim();

  const date =
    forced ||
    todayYmdSaoPaulo();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    throw new Error(
      `DATE_INVALID=${date}`
    );
  }

  const today =
    todayYmdSaoPaulo();

  if (date > today) {
    throw new Error(
      `FUTURE_DATE_BLOCKED=${date}`
    );
  }

  return date;
}

function sourceIdOf(row) {
  const candidates = [
    row?.lottery_id,
    row?.lotteryId,
    row?.lottery_uuid,
    row?.lotteryUuid,
  ];

  for (const value of candidates) {

    const id =
      String(
        value || ""
      ).trim();

    if (id) {
      return id;
    }
  }

  return "";
}

function countPrizes(row) {
  let count = 0;

  for (
    let position = 1;
    position <= 15;
    position += 1
  ) {
    const value =
      row?.[`prize_${position}`];

    if (
      value === null ||
      typeof value === "undefined"
    ) {
      continue;
    }

    if (
      String(value).trim() === ""
    ) {
      continue;
    }

    count += 1;
  }

  return count;
}

function publishedRows(
  payload,
  expectedDate
) {
  const rows =
    Array.isArray(payload?.data)
      ? payload.data
      : [];

  const seen =
    new Set();

  const out = [];

  for (const row of rows) {

    const rowDate =
      String(
        row?.date || ""
      ).slice(0, 10);

    if (
      rowDate &&
      rowDate !== expectedDate
    ) {
      throw new Error(
        `SOURCE_DATE_MISMATCH=${rowDate}`
      );
    }

    const sourceId =
      sourceIdOf(row);

    if (!sourceId) {
      throw new Error(
        "SOURCE_UUID_MISSING"
      );
    }

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        sourceId
      )
    ) {
      throw new Error(
        `SOURCE_UUID_INVALID=${sourceId}`
      );
    }

    if (
      !PTSP_SOURCE_ID_SET.has(
        sourceId
      )
    ) {
      throw new Error(
        `SOURCE_UUID_NOT_REGISTERED=${sourceId}`
      );
    }

    if (seen.has(sourceId)) {
      throw new Error(
        `DUPLICATE_SOURCE_PAYLOAD=${sourceId}`
      );
    }

    seen.add(sourceId);

    const expectedPrizes =
      countPrizes(row);

    if (expectedPrizes <= 0) {
      continue;
    }

    out.push({
      sourceId,
      expectedPrizes,
      row,
    });
  }

  return out;
}

async function readExistingDay(
  db,
  date
) {
  const snap =
    await db
      .collection("draws")
      .where(
        "lottery_key",
        "==",
        LOTTERY_KEY
      )
      .where(
        "ymd",
        "==",
        date
      )
      .get();

  const bySource =
    new Map();

  for (const doc of snap.docs) {

    const data =
      doc.data() || {};

    const sourceId =
      String(
        data.lottery_id || ""
      ).trim();

    if (!sourceId) {
      continue;
    }

    if (bySource.has(sourceId)) {
      throw new Error(
        `DUPLICATE_SOURCE_FIRESTORE=${sourceId}`
      );
    }

    bySource.set(
      sourceId,
      {
        id: doc.id,
        ...data,
      }
    );
  }

  return bySource;
}

function isComplete(
  existing,
  expectedPrizes
) {
  if (!existing) {
    return false;
  }

  if (
    String(
      existing.lottery_key || ""
    )
      .trim()
      .toUpperCase() !==
    LOTTERY_KEY
  ) {
    return false;
  }

  if (
    String(
      existing.uf || ""
    )
      .trim()
      .toUpperCase() !==
    STATE_CODE
  ) {
    return false;
  }

  return (
    Number(
      existing.prizesCount || 0
    ) >=
    Number(
      expectedPrizes || 0
    )
  );
}

function pendingRows(
  published,
  existingBySource
) {
  return published.filter(
    ({
      sourceId,
      expectedPrizes,
    }) =>
      !isComplete(
        existingBySource.get(
          sourceId
        ),
        expectedPrizes
      )
  );
}

function assertComplete(
  published,
  existingBySource
) {
  const incomplete =
    pendingRows(
      published,
      existingBySource
    );

  if (incomplete.length) {
    throw new Error(
      "POST_IMPORT_INCOMPLETE=" +
      incomplete
        .map(
          (item) =>
            item.sourceId
        )
        .join(",")
    );
  }
}

async function main() {
  const date =
    resolveTargetDate();

  const db =
    getDb();

  console.log(
    `[PTSP_AUTO] START date=${date} ` +
    `dryRun=${DRY_RUN ? "YES" : "NO"}`
  );

  console.log(
    "PTSP_SOURCE_IDENTITY_MODE=PER_LOTTERY"
  );

  const payload =
    await fetchKingResults({
      date,
      lotteryKey:
        LOTTERY_KEY,
    });

  const published =
    publishedRows(
      payload,
      date
    );

  console.log(
    `PTSP_AUTO_SOURCE_DRAWS=${published.length}`
  );

  if (!published.length) {

    console.log(
      "PTSP_AUTO_PENDING_DRAWS=0"
    );

    console.log(
      "PTSP_AUTO_WRITE=NO"
    );

    console.log(
      "PTSP_AUTO_FINAL=PASS_NO_SOURCE_DATA"
    );

    return;
  }

  const before =
    await readExistingDay(
      db,
      date
    );

  const pending =
    pendingRows(
      published,
      before
    );

  console.log(
    `PTSP_AUTO_FIRESTORE_DRAWS_BEFORE=${before.size}`
  );

  console.log(
    `PTSP_AUTO_PENDING_DRAWS=${pending.length}`
  );

  if (DRY_RUN) {

    console.log(
      "PTSP_AUTO_WRITE=NO"
    );

    console.log(
      "PTSP_AUTO_DRY_RUN=PASS"
    );

    return;
  }

  if (!pending.length) {

    console.log(
      "PTSP_AUTO_WRITE=NO"
    );

    console.log(
      "PTSP_AUTO_FINAL=PASS_ALREADY_COMPLETE"
    );

    return;
  }

  const pendingPayload = {
    ...payload,
    data:
      pending.map(
        (item) =>
          item.row
      ),
  };

  const result =
    await importFromPayload({
      payload:
        pendingPayload,
      lotteryKey:
        LOTTERY_KEY,
      closeHour:
        null,
      skipIfAlreadyComplete:
        false,
    });

  if (
    Number(
      result?.totalDrawsValid || 0
    ) !==
    pending.length
  ) {
    throw new Error(
      "IMPORT_VALID_COUNT_MISMATCH " +
      `expected=${pending.length} ` +
      `actual=${Number(
        result?.totalDrawsValid || 0
      )}`
    );
  }

  const after =
    await readExistingDay(
      db,
      date
    );

  assertComplete(
    published,
    after
  );

  console.log(
    `PTSP_AUTO_DRAWS_UPSERTED=${Number(
      result?.totalDrawsUpserted || 0
    )}`
  );

  console.log(
    `PTSP_AUTO_PRIZES_UPSERTED=${Number(
      result?.totalPrizesUpserted || 0
    )}`
  );

  console.log(
    `PTSP_AUTO_FIRESTORE_DRAWS_AFTER=${after.size}`
  );

  console.log(
    "PTSP_AUTO_WRITE=YES"
  );

  console.log(
    "PTSP_AUTO_FINAL=PASS"
  );
}

main().catch(
  (error) => {

    console.error(
      "PTSP_AUTO_FINAL=FAIL",
      error?.stack ||
      error
    );

    process.exit(1);
  }
);
