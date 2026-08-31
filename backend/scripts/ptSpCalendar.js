"use strict";

const fs = require("fs");
const path = require("path");

const REGISTRY_PATH =
  path.join(
    __dirname,
    "..",
    "data",
    "pt_sp",
    "source_registry.json"
  );

let registryCache = null;

function safeString(value) {
  return String(
    value ?? ""
  ).trim();
}

function normalizeIdentity(value) {
  return safeString(value)
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function isISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    safeString(value)
  );
}

function assertISODate(value) {
  const ymd =
    safeString(value);

  if (!isISODate(ymd)) {
    throw new Error(
      `PT_SP invalid YYYY-MM-DD date: ${value}`
    );
  }

  const dt =
    new Date(
      `${ymd}T00:00:00.000Z`
    );

  if (
    Number.isNaN(
      dt.getTime()
    ) ||
    dt
      .toISOString()
      .slice(0, 10) !== ymd
  ) {
    throw new Error(
      `PT_SP invalid calendar date: ${value}`
    );
  }

  return ymd;
}

function normalizeSlot(value) {
  const match =
    safeString(value)
      .match(
        /^(\d{1,2})(?::(\d{1,2}))?$/
      );

  if (!match) {
    return "";
  }

  const hour =
    Number(match[1]);

  const minute =
    Number(
      match[2] || "00"
    );

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }

  return (
    String(hour)
      .padStart(2, "0") +
    ":" +
    String(minute)
      .padStart(2, "0")
  );
}

function sortSlots(values) {
  return Array.from(
    new Set(
      (Array.isArray(values)
        ? values
        : []
      )
        .map(normalizeSlot)
        .filter(Boolean)
    )
  ).sort();
}

function readRegistry() {
  if (registryCache) {
    return registryCache;
  }

  const parsed =
    JSON.parse(
      fs.readFileSync(
        REGISTRY_PATH,
        "utf8"
      )
    );

  if (
    parsed?.lotteryKey !==
    "PT_SP"
  ) {
    throw new Error(
      "Invalid PT_SP source registry."
    );
  }

  if (
    !Array.isArray(
      parsed?.sources
    ) ||
    parsed.sources.length !== 8
  ) {
    throw new Error(
      "PT_SP registry must contain exactly 8 known sources."
    );
  }

  const uuids =
    new Set();

  const names =
    new Set();

  const slots =
    new Set();

  for (
    const source
    of parsed.sources
  ) {
    const uuid =
      safeString(
        source?.uuid
      );

    const sourceName =
      normalizeIdentity(
        source?.sourceName
      );

    const slot =
      normalizeSlot(
        source?.slot
      );

    if (
      !uuid ||
      !sourceName ||
      !slot
    ) {
      throw new Error(
        "PT_SP registry contains incomplete source identity."
      );
    }

    if (uuids.has(uuid)) {
      throw new Error(
        `PT_SP duplicate source UUID: ${uuid}`
      );
    }

    if (names.has(sourceName)) {
      throw new Error(
        `PT_SP duplicate source name: ${sourceName}`
      );
    }

    if (slots.has(slot)) {
      throw new Error(
        `PT_SP duplicate canonical slot: ${slot}`
      );
    }

    uuids.add(uuid);
    names.add(sourceName);
    slots.add(slot);
  }

  registryCache =
    Object.freeze(parsed);

  return registryCache;
}

function clearPtSpCalendarCache() {
  registryCache = null;
}

function ymdDow(ymd) {
  const date =
    assertISODate(ymd);

  return new Date(
    `${date}T00:00:00.000Z`
  ).getUTCDay();
}

function getPtSpSourceRegistry() {
  return readRegistry();
}

function getPtSpAllSlots() {
  const registry =
    readRegistry();

  return sortSlots(
    registry.sources.map(
      (source) =>
        source.slot
    )
  );
}

function getPtSpKnownSourceSlotsByDate(
  ymd
) {
  const date =
    assertISODate(ymd);

  const registry =
    readRegistry();

  return sortSlots(
    registry.sources
      .filter((source) => {
        const first =
          safeString(
            source?.firstAvailable
          );

        return (
          isISODate(first) &&
          first <= date
        );
      })
      .map(
        (source) =>
          source.slot
      )
  );
}

function pickSourceUuid(draw) {
  return safeString(
    draw?.lottery_id ||
    draw?.lotteryId ||
    draw?.lottery_uuid ||
    draw?.lotteryUuid ||
    ""
  );
}

function pickSourceName(draw) {
  return safeString(
    draw?.lottery_name ||
    draw?.name ||
    ""
  );
}

/**
 * Resolve um draw bruto da King para a identidade
 * registrada do PT_SP.
 *
 * IMPORTANTE:
 * O slot canonico NAO e obtido truncando o close_hour.
 * Ele vem do cadastro da fonte/UUID.
 *
 * close_hour continua sendo observado separadamente
 * como dado bruto da fonte.
 */
function resolvePtSpSourceDraw(
  draw
) {
  const registry =
    readRegistry();

  const lotteryId =
    pickSourceUuid(draw);

  const sourceName =
    pickSourceName(draw);

  const nameKey =
    normalizeIdentity(
      sourceName
    );

  const byUuid =
    lotteryId
      ? registry.sources.find(
          (source) =>
            safeString(
              source.uuid
            ) === lotteryId
        ) || null
      : null;

  const byName =
    nameKey
      ? registry.sources.find(
          (source) =>
            normalizeIdentity(
              source.sourceName
            ) === nameKey
        ) || null
      : null;

  if (
    byUuid &&
    byName &&
    safeString(byUuid.uuid) !==
      safeString(byName.uuid)
  ) {
    return {
      matched: false,
      conflict: true,
      matchedBy: "CONFLICT",
      canonicalSlot: "",
      rawCloseHour:
        normalizeSlot(
          draw?.close_hour ||
          draw?.closeHour ||
          draw?.horario ||
          draw?.close ||
          ""
        ),
      incomingLotteryId:
        lotteryId,
      incomingSourceName:
        sourceName,
      uuidSource:
        byUuid,
      nameSource:
        byName,
    };
  }

  const source =
    byUuid ||
    byName ||
    null;

  if (!source) {
    return {
      matched: false,
      conflict: false,
      matchedBy: "",
      canonicalSlot: "",
      rawCloseHour:
        normalizeSlot(
          draw?.close_hour ||
          draw?.closeHour ||
          draw?.horario ||
          draw?.close ||
          ""
        ),
      incomingLotteryId:
        lotteryId,
      incomingSourceName:
        sourceName,
      source: null,
    };
  }

  return {
    matched: true,
    conflict: false,
    matchedBy:
      byUuid
        ? "UUID"
        : "SOURCE_NAME",
    canonicalSlot:
      normalizeSlot(
        source.slot
      ),
    rawCloseHour:
      normalizeSlot(
        draw?.close_hour ||
        draw?.closeHour ||
        draw?.horario ||
        draw?.close ||
        ""
      ),
    incomingLotteryId:
      lotteryId,
    incomingSourceName:
      sourceName,
    source: {
      slot:
        normalizeSlot(
          source.slot
        ),
      sourceName:
        safeString(
          source.sourceName
        ),
      uuid:
        safeString(
          source.uuid
        ),
      firstAvailable:
        safeString(
          source.firstAvailable
        ),
      preserveSourceIdentity:
        source
          .preserveSourceIdentity ===
        true,
    },
  };
}

function getPtSpExpectedRawMinute(
  ymd
) {
  const date =
    assertISODate(ymd);

  const registry =
    readRegistry();

  const regime =
    registry
      .rawCloseHourRegime;

  const anchor =
    assertISODate(
      regime
        .observedTransitionAnchor
    );

  return date < anchor
    ? safeString(
        regime.beforeMinute
      )
    : safeString(
        regime.onOrAfterMinute
      );
}

function getCurrentObservedSlots(
  ymd
) {
  const date =
    assertISODate(ymd);

  const registry =
    readRegistry();

  const dow =
    String(
      ymdDow(date)
    );

  const slots =
    registry
      .currentOperationalRegime
      ?.dow?.[dow];

  if (!Array.isArray(slots)) {
    throw new Error(
      `PT_SP current regime has no DOW=${dow}`
    );
  }

  return sortSlots(slots);
}

function getPtSpCalendarByDate(
  ymd
) {
  const date =
    assertISODate(ymd);

  const registry =
    readRegistry();

  const historyFloor =
    assertISODate(
      registry.historyFloor
    );

  const validationAnchor =
    assertISODate(
      registry
        .currentOperationalRegime
        .validationAnchor
    );

  const sourceSlots =
    date < historyFloor
      ? []
      : getPtSpKnownSourceSlotsByDate(
          date
        );

  if (date < historyFloor) {
    return {
      lotteryKey:
        "PT_SP",
      uf:
        "SP",
      date,
      dow:
        ymdDow(date),
      mode:
        "NO_KNOWN_SOURCE",
      historyFloor,
      sourceSlots,
      operationalSlots:
        null,
      enforceOperationalSchedule:
        false,
      formalTransitionDateClaimed:
        false,
    };
  }

  if (date < validationAnchor) {
    return {
      lotteryKey:
        "PT_SP",
      uf:
        "SP",
      date,
      dow:
        ymdDow(date),
      mode:
        "HISTORICAL_SOURCE_DRIVEN",
      historyFloor,
      validationAnchor,
      sourceSlots,
      operationalSlots:
        null,
      enforceOperationalSchedule:
        false,
      formalTransitionDateClaimed:
        false,
      backfillPolicy:
        "QUERY_ALL_KNOWN_SOURCE_UUIDS_FOR_DATE",
    };
  }

  return {
    lotteryKey:
      "PT_SP",
    uf:
      "SP",
    date,
    dow:
      ymdDow(date),
    mode:
      "CURRENT_OBSERVED_REGIME",
    historyFloor,
    validationAnchor,
    sourceSlots,
    operationalSlots:
      getCurrentObservedSlots(
        date
      ),
    enforceOperationalSchedule:
      true,
    formalTransitionDateClaimed:
      false,
  };
}

function isPtSpCurrentOperationalSlot(
  ymd,
  slot
) {
  const calendar =
    getPtSpCalendarByDate(
      ymd
    );

  if (
    !calendar
      .enforceOperationalSchedule
  ) {
    return null;
  }

  const normalized =
    normalizeSlot(slot);

  if (!normalized) {
    return false;
  }

  return calendar
    .operationalSlots
    .includes(normalized);
}

module.exports = {
  REGISTRY_PATH,
  normalizeSlot,
  ymdDow,
  getPtSpSourceRegistry,
  getPtSpAllSlots,
  getPtSpKnownSourceSlotsByDate,
  resolvePtSpSourceDraw,
  getPtSpExpectedRawMinute,
  getCurrentObservedSlots,
  getPtSpCalendarByDate,
  isPtSpCurrentOperationalSlot,
  clearPtSpCalendarCache,
};

if (require.main === module) {
  const date =
    process.argv
      .slice(2)
      .find((value) =>
        /^\d{4}-\d{2}-\d{2}$/.test(
          safeString(value)
        )
      );

  if (!date) {
    console.error(
      "Uso: node backend/scripts/ptSpCalendar.js YYYY-MM-DD"
    );

    process.exit(2);
  }

  try {
    console.log(
      JSON.stringify(
        getPtSpCalendarByDate(
          date
        ),
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      error?.stack ||
      error
    );

    process.exit(1);
  }
}
