import policy from "./top3.milhar-prefix-challenger.policy.json";

export const TOP3_MILHAR_PREFIX_CHALLENGER_VERSION =
  "PALPITACO_MILHAR_PREFIX_CHALLENGER_PRODUCTION_V1";

const ACTIVATION_YMD =
  "2026-09-01";

const DAY_MS =
  86400000;

const WEEKDAYS =
  Object.freeze([
    "DOM",
    "SEG",
    "TER",
    "QUA",
    "QUI",
    "SEX",
    "SAB",
  ]);

const LOOK_SCHEDULE =
  Object.freeze([
    "07:00",
    "09:00",
    "11:00",
    "14:00",
    "16:00",
    "18:00",
    "21:00",
    "23:00",
  ]);

const NACIONAL_SCHEDULE_BEFORE_21H =
  Object.freeze([
    "02:00",
    "08:00",
    "10:00",
    "12:00",
    "15:00",
    "17:00",
    "20:00",
    "23:00",
  ]);

const NACIONAL_SCHEDULE_21H =
  Object.freeze([
    "02:00",
    "08:00",
    "10:00",
    "12:00",
    "15:00",
    "17:00",
    "21:00",
    "23:00",
  ]);

const NACIONAL_21H_START =
  "2025-11-07";

const CHALLENGER_LOTTERIES =
  new Set([
    "NACIONAL",
    "LOOK",
  ]);

const contextMatrix =
  new Map(
    (Array.isArray(policy?.contexts)
      ? policy.contexts
      : []
    ).map((row) => [
      [
        String(row?.lottery || ""),
        String(row?.dow || ""),
        String(row?.hour || ""),
        Number(row?.group),
      ].join("|"),
      row,
    ])
  );

const variantMap =
  new Map(
    (Array.isArray(policy?.variants)
      ? policy.variants
      : []
    ).map((row) => [
      String(row?.name || ""),
      row,
    ])
  );

const preparedCache =
  new WeakMap();

function safe(value) {
  return String(value ?? "").trim();
}

function lotteryKey(value) {
  const key =
    safe(value).toUpperCase();

  if (
    key === "RJ" ||
    key === "RIO"
  ) {
    return "PT_RIO";
  }

  return key;
}

function normalizeHour(value) {
  const text =
    safe(value)
      .toLowerCase()
      .replace(/\s+/g, "");

  let match =
    text.match(
      /^(\d{1,2}):(\d{2})/
    );

  if (!match) {
    match =
      text.match(
        /^(\d{1,2})h(\d{2})/
      );
  }

  if (!match) {
    match =
      text.match(
        /^(\d{1,2})h?$/
      );

    if (match) {
      match = [
        match[0],
        match[1],
        "00",
      ];
    }
  }

  if (!match) {
    return "";
  }

  const hh =
    Number(match[1]);

  const mm =
    Number(match[2] || 0);

  if (
    !Number.isInteger(hh) ||
    !Number.isInteger(mm) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  ) {
    return "";
  }

  return (
    String(hh).padStart(2, "0") +
    ":" +
    String(mm).padStart(2, "0")
  );
}

function hourMinutes(value) {
  const hour =
    normalizeHour(value);

  if (!hour) {
    return Number.NaN;
  }

  const [hh, mm] =
    hour.split(":").map(Number);

  return hh * 60 + mm;
}

function eventTs(ymd, hour) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      safe(ymd)
    )
  ) {
    return Number.NaN;
  }

  const normalizedHour =
    normalizeHour(hour);

  if (!normalizedHour) {
    return Number.NaN;
  }

  const [Y, M, D] =
    ymd.split("-").map(Number);

  const [hh, mm] =
    normalizedHour
      .split(":")
      .map(Number);

  return Date.UTC(
    Y,
    M - 1,
    D,
    hh,
    mm,
    0,
    0
  );
}

function dowLabel(ymd) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      safe(ymd)
    )
  ) {
    return "";
  }

  return (
    WEEKDAYS[
      new Date(
        `${ymd}T12:00:00Z`
      ).getUTCDay()
    ] || ""
  );
}

function officialSchedule(
  lottery,
  ymd
) {
  if (lottery === "LOOK") {
    return [...LOOK_SCHEDULE];
  }

  if (lottery === "NACIONAL") {
    return [
      ...(
        ymd >= NACIONAL_21H_START
          ? NACIONAL_SCHEDULE_21H
          : NACIONAL_SCHEDULE_BEFORE_21H
      ),
    ];
  }

  return [];
}

function drawQuality(
  draw,
  helpers
) {
  const prizes =
    Array.isArray(draw?.prizes)
      ? draw.prizes
      : [];

  let valid =
    0;

  let p1 =
    false;

  for (const prize of prizes) {
    const pos =
      Number(
        helpers.guessPrizePos(
          prize
        )
      );

    const group =
      Number(
        helpers.guessPrizeGrupo(
          prize
        )
      );

    if (
      !Number.isFinite(pos) ||
      !Number.isFinite(group) ||
      pos < 1 ||
      pos > 7 ||
      group < 1 ||
      group > 25
    ) {
      continue;
    }

    valid += 1;

    if (pos === 1) {
      p1 = true;
    }
  }

  return (
    valid * 100 +
    (p1 ? 10 : 0)
  );
}

function canonicalizeHistory(
  lottery,
  rangeDraws,
  helpers
) {
  const unique =
    new Map();

  for (const draw of rangeDraws) {
    const ymd =
      safe(
        helpers.pickDrawYMD(
          draw
        )
      );

    const rawHour =
      normalizeHour(
        helpers.pickDrawHour(
          draw
        )
      );

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        ymd
      ) ||
      !rawHour
    ) {
      continue;
    }

    const key =
      `${ymd}|${rawHour}`;

    const existing =
      unique.get(key);

    if (
      !existing ||
      drawQuality(
        draw,
        helpers
      ) >
      drawQuality(
        existing.draw,
        helpers
      )
    ) {
      unique.set(
        key,
        {
          draw,
          ymd,
          rawHour,
          rawMinutes:
            hourMinutes(rawHour),
        }
      );
    }
  }

  const byDay =
    new Map();

  for (const row of unique.values()) {
    if (!byDay.has(row.ymd)) {
      byDay.set(
        row.ymd,
        []
      );
    }

    byDay
      .get(row.ymd)
      .push(row);
  }

  const structures =
    [];

  for (
    const [ymd, rows]
    of byDay
  ) {
    const official =
      officialSchedule(
        lottery,
        ymd
      );

    structures.push({
      ymd,
      rows:
        [...rows].sort(
          (a, b) =>
            a.rawMinutes -
            b.rawMinutes
        ),
      official,
      pattern:
        official.join("|"),
    });
  }

  const evidence =
    new Map();

  for (const day of structures) {
    if (
      day.ymd >= ACTIVATION_YMD ||
      !day.official.length ||
      day.rows.length !==
        day.official.length
    ) {
      continue;
    }

    for (
      let index = 0;
      index < day.rows.length;
      index += 1
    ) {
      const key =
        [
          day.pattern,
          day.rows[index].rawHour,
        ].join("§");

      if (!evidence.has(key)) {
        evidence.set(
          key,
          new Map()
        );
      }

      const bucket =
        evidence.get(key);

      const officialHour =
        day.official[index];

      bucket.set(
        officialHour,
        Number(
          bucket.get(officialHour) ||
          0
        ) + 1
      );
    }
  }

  const aliases =
    new Map();

  for (
    const [key, bucket]
    of evidence
  ) {
    const entries =
      [...bucket.entries()];

    const total =
      entries.reduce(
        (sum, row) =>
          sum + Number(row[1] || 0),
        0
      );

    if (
      entries.length === 1 &&
      total >= 2
    ) {
      aliases.set(
        key,
        entries[0][0]
      );
    }
  }

  const mapped =
    [];

  for (const day of structures) {
    if (!day.official.length) {
      continue;
    }

    if (
      day.rows.length ===
      day.official.length
    ) {
      for (
        let index = 0;
        index < day.rows.length;
        index += 1
      ) {
        mapped.push({
          ...day.rows[index],
          hour:
            day.official[index],
        });
      }

      continue;
    }

    for (const row of day.rows) {
      if (
        day.official.includes(
          row.rawHour
        )
      ) {
        mapped.push({
          ...row,
          hour:
            row.rawHour,
        });

        continue;
      }

      const alias =
        aliases.get(
          [
            day.pattern,
            row.rawHour,
          ].join("§")
        );

      if (
        alias &&
        day.official.includes(
          alias
        )
      ) {
        mapped.push({
          ...row,
          hour:
            alias,
        });
      }
    }
  }

  return mapped
    .map((row) => ({
      ...row,
      ts:
        eventTs(
          row.ymd,
          row.hour
        ),
      dow:
        dowLabel(row.ymd),
      month:
        row.ymd.slice(5, 7),
      dayMonth:
        row.ymd.slice(8, 10),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.ts)
    )
    .sort(
      (a, b) =>
        a.ts - b.ts
    );
}

function prizeInfo(
  prize,
  helpers
) {
  const pos =
    Number(
      helpers.guessPrizePos(
        prize
      )
    );

  const group =
    Number(
      helpers.guessPrizeGrupo(
        prize
      )
    );

  const milhar =
    safe(
      helpers.pickPrizeMilhar4(
        prize
      )
    )
      .replace(/\D/g, "")
      .padStart(4, "0")
      .slice(-4);

  if (
    !Number.isFinite(pos) ||
    !Number.isFinite(group) ||
    !/^\d{4}$/.test(milhar)
  ) {
    return null;
  }

  return {
    pos,
    group,
    milhar,
    prefix:
      milhar.slice(0, 1),
    centena:
      milhar.slice(1, 4),
    dezena:
      milhar.slice(2, 4),
  };
}

function prepareHistory({
  lottery,
  rangeDraws,
  targetYmd,
  targetHour,
  helpers,
}) {
  const targetTs =
    eventTs(
      targetYmd,
      targetHour
    );

  if (!Number.isFinite(targetTs)) {
    return null;
  }

  const cacheKey =
    [
      lottery,
      targetYmd,
      targetHour,
      rangeDraws.length,
    ].join("|");

  let localCache =
    preparedCache.get(
      rangeDraws
    );

  if (!localCache) {
    localCache =
      new Map();

    preparedCache.set(
      rangeDraws,
      localCache
    );
  }

  if (
    localCache.has(
      cacheKey
    )
  ) {
    return localCache.get(
      cacheKey
    );
  }

  const canonical =
    canonicalizeHistory(
      lottery,
      rangeDraws,
      helpers
    )
      .filter(
        (row) =>
          row.ts < targetTs
      );

  const events =
    [];

  let previousP1Group =
    null;

  for (const row of canonical) {
    const infos =
      (
        Array.isArray(
          row.draw?.prizes
        )
          ? row.draw.prizes
          : []
      )
        .map(
          (prize) =>
            prizeInfo(
              prize,
              helpers
            )
        )
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.pos - b.pos
        );

    for (const info of infos) {
      if (
        info.pos < 1 ||
        info.pos > 3
      ) {
        continue;
      }

      events.push({
        lottery,
        ymd:
          row.ymd,
        hour:
          row.hour,
        dow:
          row.dow,
        month:
          row.month,
        dayMonth:
          row.dayMonth,
        ts:
          row.ts,
        prevP1Group:
          previousP1Group,
        pos:
          info.pos,
        group:
          info.group,
        dezena:
          info.dezena,
        centena:
          info.centena,
        prefix:
          info.prefix,
      });
    }

    const p1 =
      infos.find(
        (info) =>
          info.pos === 1
      );

    if (p1) {
      previousP1Group =
        p1.group;
    }
  }

  const prepared = {
    events,
    prevP1Group:
      previousP1Group,
  };

  localCache.set(
    cacheKey,
    prepared
  );

  return prepared;
}

function contextValue(
  context,
  row
) {
  const transition =
    Number.isFinite(
      Number(
        row.prevP1Group
      )
    )
      ? String(
          Number(
            row.prevP1Group
          )
        )
      : "NONE";

  switch (context) {
    case "ALL":
      return "ALL";

    case "HOUR":
      return row.hour;

    case "DOW":
      return row.dow;

    case "DOW_HOUR":
      return (
        row.dow +
        "|" +
        row.hour
      );

    case "DAY_MONTH":
      return row.dayMonth;

    case "MONTH":
      return row.month;

    case "TRANSITION":
      return transition;

    case "HOUR_TRANSITION":
      return (
        row.hour +
        "|" +
        transition
      );

    default:
      return "";
  }
}

function entityValue(
  entity,
  row
) {
  switch (entity) {
    case "CENTENA":
      return row.centena;

    case "DEZENA":
      return row.dezena;

    case "GROUP":
      return String(
        row.group
      );

    case "GLOBAL":
      return "ALL";

    default:
      return "";
  }
}

function entityBackoff(
  entity
) {
  switch (entity) {
    case "CENTENA":
      return [
        "CENTENA",
        "DEZENA",
        "GROUP",
        "GLOBAL",
      ];

    case "DEZENA":
      return [
        "DEZENA",
        "GROUP",
        "GLOBAL",
      ];

    case "GROUP":
      return [
        "GROUP",
        "GLOBAL",
      ];

    default:
      return [
        "GLOBAL",
      ];
  }
}

function buildPrefixIndex(
  events
) {
  const index =
    new Map();

  const contexts =
    [
      "ALL",
      "HOUR",
      "DOW",
      "DOW_HOUR",
      "DAY_MONTH",
      "MONTH",
      "TRANSITION",
      "HOUR_TRANSITION",
    ];

  function add({
    positionScope,
    entityScope,
    entity,
    context,
    contextText,
    prefix,
    ts,
  }) {
    const key =
      [
        positionScope,
        entityScope,
        entity,
        context,
        contextText,
      ].join("§");

    if (!index.has(key)) {
      index.set(
        key,
        new Map()
      );
    }

    const bucket =
      index.get(key);

    if (
      !bucket.has(prefix)
    ) {
      bucket.set(
        prefix,
        []
      );
    }

    bucket
      .get(prefix)
      .push(ts);
  }

  for (const row of events) {
    const positionScopes =
      row.pos === 1
        ? [
            "P1",
            "P123",
          ]
        : [
            "P123",
          ];

    for (
      const positionScope
      of positionScopes
    ) {
      for (
        const entityScope
        of [
          "CENTENA",
          "DEZENA",
          "GROUP",
          "GLOBAL",
        ]
      ) {
        for (
          const context
          of contexts
        ) {
          add({
            positionScope,
            entityScope,
            entity:
              entityValue(
                entityScope,
                row
              ),
            context,
            contextText:
              contextValue(
                context,
                row
              ),
            prefix:
              row.prefix,
            ts:
              row.ts,
          });
        }
      }
    }
  }

  return index;
}

function lowerBound(
  values,
  target
) {
  let low =
    0;

  let high =
    values.length;

  while (low < high) {
    const middle =
      Math.floor(
        (low + high) / 2
      );

    if (
      values[middle] <
      target
    ) {
      low =
        middle + 1;
    }
    else {
      high =
        middle;
    }
  }

  return low;
}

function scoreBucket({
  bucket,
  targetTs,
  cutoffTs,
  mode,
}) {
  const scores =
    [];

  let sample =
    0;

  for (
    let digit = 0;
    digit <= 9;
    digit += 1
  ) {
    const prefix =
      String(digit);

    const values =
      bucket?.get(prefix) ||
      [];

    const lo =
      Number.isFinite(
        cutoffTs
      )
        ? lowerBound(
            values,
            cutoffTs
          )
        : 0;

    const hi =
      lowerBound(
        values,
        targetTs
      );

    const count =
      Math.max(
        0,
        hi - lo
      );

    sample +=
      count;

    let score =
      count;

    if (mode === "DECAY90") {
      score =
        0;

      const halfLife =
        90 * DAY_MS;

      for (
        let index = lo;
        index < hi;
        index += 1
      ) {
        score +=
          Math.pow(
            0.5,
            (
              targetTs -
              values[index]
            ) /
              halfLife
          );
      }
    }

    scores.push({
      prefix,
      score,
      count,
      last:
        hi > lo
          ? values[hi - 1]
          : 0,
    });
  }

  scores.sort(
    (a, b) =>
      b.score - a.score ||
      b.count - a.count ||
      b.last - a.last ||
      Number(a.prefix) -
        Number(b.prefix)
  );

  return {
    sample,
    prefix:
      scores[0]?.prefix ||
      "0",
  };
}

function rankVariant({
  index,
  target,
  variant,
}) {
  const targetTs =
    target.ts;

  const cutoffTs =
    variant.window === "FULL"
      ? Number.NaN
      : targetTs -
        Number(
          variant.window
        ) *
          DAY_MS;

  const backoff =
    entityBackoff(
      variant.entityScope
    );

  for (
    const entityScope
    of backoff
  ) {
    const key =
      [
        variant.positionScope,
        entityScope,
        entityValue(
          entityScope,
          target
        ),
        variant.temporalContext,
        contextValue(
          variant.temporalContext,
          target
        ),
      ].join("§");

    const result =
      scoreBucket({
        bucket:
          index.get(key),
        targetTs,
        cutoffTs,
        mode:
          variant.scoreMode,
      });

    if (
      result.sample >= 10
    ) {
      return result;
    }
  }

  if (
    variant.temporalContext !==
    "ALL"
  ) {
    for (
      const entityScope
      of backoff
    ) {
      const key =
        [
          variant.positionScope,
          entityScope,
          entityValue(
            entityScope,
            target
          ),
          "ALL",
          "ALL",
        ].join("§");

      const result =
        scoreBucket({
          bucket:
            index.get(key),
          targetTs,
          cutoffTs,
          mode:
            variant.scoreMode,
        });

      if (
        result.sample >= 10
      ) {
        return result;
      }
    }
  }

  return scoreBucket({
    bucket:
      index.get(
        [
          variant.positionScope,
          "GLOBAL",
          "ALL",
          "ALL",
          "ALL",
        ].join("§")
      ),
    targetTs,
    cutoffTs:
      Number.NaN,
    mode:
      variant.scoreMode,
  });
}

export function getTop3MilharPrefixPolicyStats() {
  const contexts =
    Array.isArray(policy?.contexts)
      ? policy.contexts
      : [];

  const variants =
    Array.isArray(policy?.variants)
      ? policy.variants
      : [];

  return {
    contexts:
      contexts.length,

    challengerContexts:
      contexts.filter(
        (row) =>
          row?.mode ===
          "CHALLENGER"
      ).length,

    variants:
      variants.length,
  };
}

export function getTop3MilharPrefixPolicyDecision({
  lottery,
  ymd,
  hour,
  group,
}) {
  const key =
    lotteryKey(lottery);

  const targetYmd =
    safe(ymd);

  const targetHour =
    normalizeHour(hour);

  const targetGroup =
    Number(group);

  if (
    targetYmd <
      ACTIVATION_YMD ||
    !CHALLENGER_LOTTERIES.has(
      key
    ) ||
    !targetHour ||
    !Number.isFinite(
      targetGroup
    )
  ) {
    return {
      mode:
        "CURRENT",
      reason:
        "OUTSIDE_CHALLENGER_SCOPE",
      strategy:
        "",
      strategyLevel:
        "CURRENT",
    };
  }

  const row =
    contextMatrix.get(
      [
        key,
        dowLabel(targetYmd),
        targetHour,
        targetGroup,
      ].join("|")
    );

  if (
    !row ||
    row.mode !==
      "CHALLENGER"
  ) {
    return {
      mode:
        "CURRENT",
      reason:
        row
          ? "FROZEN_CONTEXT_CURRENT"
          : "UNKNOWN_CONTEXT_CURRENT",
      strategy:
        "",
      strategyLevel:
        "CURRENT",
    };
  }

  return {
    mode:
      "CHALLENGER",
    reason:
      "FROZEN_APPROVED_CONTEXT",
    strategy:
      String(
        row.strategy ||
        ""
      ),
    strategyLevel:
      String(
        row.strategyLevel ||
        ""
      ),
  };
}

export function applyTop3MilharPrefixChallenger({
  currentOutput,
  input,
  helpers,
}) {
  const output =
    currentOutput &&
    typeof currentOutput ===
      "object"
      ? currentOutput
      : {
          dezenas: [],
          slots: [],
        };

  const lottery =
    lotteryKey(
      input?.lotteryKey
    );

  const targetYmd =
    safe(
      input?.targetYmd
    );

  const targetHour =
    normalizeHour(
      input?.analysisHourBucket
    );

  const group =
    Number(
      input?.grupo2
    );

  const decision =
    getTop3MilharPrefixPolicyDecision({
      lottery,
      ymd:
        targetYmd,
      hour:
        targetHour,
      group,
    });

  if (
    decision.mode !==
    "CHALLENGER"
  ) {
    return output;
  }

  const variant =
    variantMap.get(
      decision.strategy
    );

  if (!variant) {
    return output;
  }

  const rangeDraws =
    Array.isArray(
      input?.rangeDraws
    )
      ? input.rangeDraws
      : [];

  if (
    !rangeDraws.length ||
    !helpers ||
    typeof helpers.pickDrawYMD !==
      "function" ||
    typeof helpers.pickDrawHour !==
      "function" ||
    typeof helpers.guessPrizePos !==
      "function" ||
    typeof helpers.guessPrizeGrupo !==
      "function" ||
    typeof helpers.pickPrizeMilhar4 !==
      "function"
  ) {
    return output;
  }

  const prepared =
    prepareHistory({
      lottery,
      rangeDraws,
      targetYmd,
      targetHour,
      helpers,
    });

  if (!prepared) {
    return output;
  }

  const index =
    buildPrefixIndex(
      prepared.events
    );

  const targetTs =
    eventTs(
      targetYmd,
      targetHour
    );

  const targetBase = {
    lottery,
    ymd:
      targetYmd,
    hour:
      targetHour,
    dow:
      dowLabel(
        targetYmd
      ),
    month:
      targetYmd.slice(
        5,
        7
      ),
    dayMonth:
      targetYmd.slice(
        8,
        10
      ),
    ts:
      targetTs,
    prevP1Group:
      prepared.prevP1Group,
    group,
  };

  let changed =
    0;

  const slots =
    (
      Array.isArray(
        output?.slots
      )
        ? output.slots
        : []
    ).map((slot) => {
      const oldMilhar =
        safe(
          slot?.milhar
        )
          .replace(/\D/g, "")
          .padStart(4, "0")
          .slice(-4);

      const centena =
        safe(
          slot?.centena
        )
          .replace(/\D/g, "")
          .padStart(3, "0")
          .slice(-3) ||
        (
          /^\d{4}$/.test(
            oldMilhar
          )
            ? oldMilhar.slice(1)
            : ""
        );

      if (
        !/^\d{3}$/.test(
          centena
        )
      ) {
        return slot;
      }

      const target = {
        ...targetBase,
        centena,
        dezena:
          centena.slice(-2),
      };

      const ranked =
        rankVariant({
          index,
          target,
          variant,
        });

      const prefix =
        String(
          ranked?.prefix ??
          ""
        );

      if (
        !/^\d$/.test(
          prefix
        )
      ) {
        return slot;
      }

      const newMilhar =
        prefix +
        centena;

      if (
        newMilhar !==
        oldMilhar
      ) {
        changed += 1;
      }

      return {
        ...slot,
        milhar:
          newMilhar,
        centena,
        prefix,
        prefixPolicy:
          TOP3_MILHAR_PREFIX_CHALLENGER_VERSION,
        prefixStrategy:
          decision.strategy,
        prefixStrategyLevel:
          decision.strategyLevel,
      };
    });

  return {
    ...output,
    slots,
    meta: {
      ...(
        output?.meta &&
        typeof output.meta ===
          "object"
          ? output.meta
          : {}
      ),
      milharPrefixPolicy:
        TOP3_MILHAR_PREFIX_CHALLENGER_VERSION,
      milharPrefixMode:
        "CHALLENGER",
      milharPrefixStrategy:
        decision.strategy,
      milharPrefixStrategyLevel:
        decision.strategyLevel,
      milharPrefixChangedSlots:
        changed,
      centenaPreserved:
        true,
      activationYmd:
        ACTIVATION_YMD,
    },
  };
}
