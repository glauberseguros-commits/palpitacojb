import {
  TOP3_V7_ADDITIONAL_LAYER_KEYS,
  buildTop3V7AdditionalLayers,
  getTop3V7AdditionalLayerResult,
} from "./v7/top3.v7.additional-layers";

export const LOOK_FINAL56_PRODUCTION_VERSION =
  "LOOK_FINAL56_FULL29_PRODUCTION_V1";

export const LOOK_FINAL56_MATRIX_CERTIFICATE_SHA256 =
  "8C70C1B17AB33EB6E33DEB904BEB18306BC22EC708D1978969F867CDCAA764DA";

export const LOOK_FINAL56_MODEL_BY_CONTEXT =
  Object.freeze({
  "0|07:00": "BASELINE_DAYMONTH_RECENT",
  "0|09:00": "BASELINE_DOWHOUR_DAYMONTH",
  "0|11:00": "BASELINE_HOUR",
  "0|14:00": "BASELINE_HOUR_DAYMONTH_TRANSITION",
  "0|16:00": "BASELINE_DOWHOUR_DAYMONTH_TRANSITION_RECENT",
  "0|18:00": "BASELINE_DOWHOUR_RECENT_SCENE",
  "0|21:00": "BASELINE_HOUR_DOWHOUR_TRANSITION",
  "0|23:00": "V7_PAIR_50_25_25::firstPrizeFrequency+sequenceOrder2",
  "1|07:00": "BASELINE_DAYMONTH_RECENT",
  "1|09:00": "BASELINE_DOWHOUR_DAYMONTH",
  "1|11:00": "BASELINE_HOUR",
  "1|14:00": "BASELINE_HOUR_DAYMONTH_TRANSITION",
  "1|16:00": "BASELINE_DOWHOUR_DAYMONTH_TRANSITION_RECENT",
  "1|18:00": "BASELINE_DOWHOUR_RECENT_SCENE",
  "1|21:00": "BASELINE_HOUR_DOWHOUR_TRANSITION",
  "1|23:00": "BASELINE_HOUR_DAYMONTH_RECENT_SCENE",
  "2|07:00": "BASELINE_DAYMONTH_RECENT",
  "2|09:00": "BASELINE_DOWHOUR_DAYMONTH",
  "2|11:00": "BASELINE_HOUR",
  "2|14:00": "BASELINE_HOUR_DAYMONTH_TRANSITION",
  "2|16:00": "BASELINE_DOWHOUR_DAYMONTH_TRANSITION_RECENT",
  "2|18:00": "BASELINE_DOWHOUR_RECENT_SCENE",
  "2|21:00": "V7_PAIR_50_25_25::firstPrizeFrequency+delay",
  "2|23:00": "BASELINE_HOUR_DAYMONTH_RECENT_SCENE",
  "3|07:00": "BASELINE_DAYMONTH_RECENT",
  "3|09:00": "BASELINE_DOWHOUR_DAYMONTH",
  "3|11:00": "BASELINE_HOUR",
  "3|14:00": "BASELINE_HOUR_DAYMONTH_TRANSITION",
  "3|16:00": "BASELINE_DOWHOUR_DAYMONTH_TRANSITION_RECENT",
  "3|18:00": "BASELINE_DOWHOUR_RECENT_SCENE",
  "3|21:00": "BASELINE_HOUR_DOWHOUR_TRANSITION",
  "3|23:00": "V2_STANDALONE::v2RepeatBoost",
  "4|07:00": "BASELINE_DAYMONTH_RECENT",
  "4|09:00": "BASELINE_DOWHOUR_DAYMONTH",
  "4|11:00": "BASELINE_HOUR",
  "4|14:00": "BASELINE_HOUR_DAYMONTH_TRANSITION",
  "4|16:00": "BASELINE_DOWHOUR_DAYMONTH_TRANSITION_RECENT",
  "4|18:00": "BASELINE_DOWHOUR_RECENT_SCENE",
  "4|21:00": "BASELINE_HOUR_DOWHOUR_TRANSITION",
  "4|23:00": "V7_STANDALONE::dailyFlow",
  "5|07:00": "V7_STANDALONE::weekday",
  "5|09:00": "BASELINE_DOWHOUR_DAYMONTH",
  "5|11:00": "V7_STANDALONE::cycleRegime",
  "5|14:00": "BASELINE_HOUR_DAYMONTH_TRANSITION",
  "5|16:00": "BASELINE_DOWHOUR_DAYMONTH_TRANSITION_RECENT",
  "5|18:00": "BASELINE_DOWHOUR_RECENT_SCENE",
  "5|21:00": "BASELINE_HOUR_DOWHOUR_TRANSITION",
  "5|23:00": "BASELINE_HOUR_DAYMONTH_RECENT_SCENE",
  "6|07:00": "BASELINE_DAYMONTH_RECENT",
  "6|09:00": "BASELINE_DOWHOUR_DAYMONTH",
  "6|11:00": "V7_PAIR_50_25_25::sequenceOrder2+stoneFlip",
  "6|14:00": "BASELINE_HOUR_DAYMONTH_TRANSITION",
  "6|16:00": "BASELINE_DOWHOUR_DAYMONTH_TRANSITION_RECENT",
  "6|18:00": "BASELINE_DOWHOUR_RECENT_SCENE",
  "6|21:00": "BASELINE_HOUR_DOWHOUR_TRANSITION",
  "6|23:00": "BASELINE_HOUR_DAYMONTH_RECENT_SCENE"
});

export const LOOK_FINAL56_CONTEXT_COUNT = 56;
export const LOOK_FINAL56_CONFIRMED_COUNT = 7;
export const LOOK_FINAL56_BASELINE_COUNT = 49;

const LOOK_HOURS = Object.freeze([
  "07:00",
  "09:00",
  "11:00",
  "14:00",
  "16:00",
  "18:00",
  "21:00",
  "23:00",
]);

const ALT_PROFILES = Object.freeze({
  "0|23:00": Object.freeze({
    model:
      "V7_PAIR_50_25_25::firstPrizeFrequency+sequenceOrder2",
    family: "V7_PAIR_50_25_25",
    signalA: "firstPrizeFrequency",
    signalB: "sequenceOrder2",
  }),

  "2|21:00": Object.freeze({
    model:
      "V7_PAIR_50_25_25::firstPrizeFrequency+delay",
    family: "V7_PAIR_50_25_25",
    signalA: "firstPrizeFrequency",
    signalB: "delay",
  }),

  "3|23:00": Object.freeze({
    model:
      "V2_STANDALONE::v2RepeatBoost",
    family: "V2_STANDALONE",
    signal: "v2RepeatBoost",
  }),

  "4|23:00": Object.freeze({
    model:
      "V7_STANDALONE::dailyFlow",
    family: "V7_STANDALONE",
    signal: "dailyFlow",
  }),

  "5|07:00": Object.freeze({
    model:
      "V7_STANDALONE::weekday",
    family: "V7_STANDALONE",
    signal: "weekday",
  }),

  "5|11:00": Object.freeze({
    model:
      "V7_STANDALONE::cycleRegime",
    family: "V7_STANDALONE",
    signal: "cycleRegime",
  }),

  "6|11:00": Object.freeze({
    model:
      "V7_PAIR_50_25_25::sequenceOrder2+stoneFlip",
    family: "V7_PAIR_50_25_25",
    signalA: "sequenceOrder2",
    signalB: "stoneFlip",
  }),
});

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function num(value, fallback = 0) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function clamp01(value) {
  return Math.max(
    0,
    Math.min(
      1,
      num(value, 0)
    )
  );
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(value || "").trim()
  );
}

function normalizeLotteryKey(value) {
  const key =
    String(value || "")
      .trim()
      .toUpperCase();

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
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");

  const match =
    text.match(
      /^(\d{1,2})(?::?(\d{2}))?h?$/
    );

  if (!match) {
    return "";
  }

  const hh =
    Number(match[1]);

  const mm =
    Number(
      match[2] ?? 0
    );

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
    `${String(hh).padStart(2, "0")}:` +
    `${String(mm).padStart(2, "0")}`
  );
}

function canonicalLookHour(value) {
  const hour =
    normalizeHour(value);

  if (!hour) {
    return "";
  }

  const [
    hh,
    mm,
  ] =
    hour
      .split(":")
      .map(Number);

  const rawMinutes =
    (hh * 60) + mm;

  let best = "";
  let bestDistance =
    Number.POSITIVE_INFINITY;
  let tied = false;

  for (
    const official
    of LOOK_HOURS
  ) {
    const [
      officialHour,
      officialMinute,
    ] =
      official
        .split(":")
        .map(Number);

    const distance =
      Math.abs(
        rawMinutes -
        (
          (officialHour * 60) +
          officialMinute
        )
      );

    if (
      distance <
      bestDistance
    ) {
      best =
        official;

      bestDistance =
        distance;

      tied =
        false;
    }
    else if (
      distance ===
      bestDistance
    ) {
      tied =
        true;
    }
  }

  if (
    tied ||
    bestDistance > 15
  ) {
    return "";
  }

  return best;
}

function ymdHourToTs(
  ymd,
  hour
) {
  const y =
    String(ymd || "")
      .trim();

  const h =
    normalizeHour(hour);

  if (
    !isYmd(y) ||
    !h
  ) {
    return Number.NaN;
  }

  const [
    Y,
    M,
    D,
  ] =
    y
      .split("-")
      .map(Number);

  const [
    hh,
    mm,
  ] =
    h
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

function getDow(ymd) {
  if (!isYmd(ymd)) {
    return Number.NaN;
  }

  const [
    Y,
    M,
    D,
  ] =
    String(ymd)
      .split("-")
      .map(Number);

  return new Date(
    Date.UTC(
      Y,
      M - 1,
      D
    )
  ).getUTCDay();
}

function canonicalLookDraw(
  draw,
  hour
) {
  return {
    ...(draw || {}),
    close_hour: hour,
    closeHour: hour,
    hour,
    hora: hour,
  };
}

function validPrizeCount(
  draw,
  helpers
) {
  return safeArray(
    draw?.prizes
  )
    .filter(
      (prize) => {
        const position =
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

        return (
          Number.isFinite(
            position
          ) &&
          position >= 1 &&
          position <= 7 &&
          Number.isFinite(
            group
          ) &&
          group >= 1 &&
          group <= 25
        );
      }
    )
    .length;
}

function drawQuality(
  draw,
  helpers
) {
  const count =
    validPrizeCount(
      draw,
      helpers
    );

  const hasP1 =
    safeArray(
      draw?.prizes
    )
      .some(
        (prize) =>
          Number(
            helpers.guessPrizePos(
              prize
            )
          ) === 1
      );

  return (
    (count * 100) +
    (
      hasP1
        ? 10
        : 0
    )
  );
}

function canonicalizeHistory(
  sourceHistory,
  helpers
) {
  const groups =
    new Map();

  let exactRows = 0;
  let mappedRows = 0;
  let rejectedRows = 0;

  for (
    const draw
    of safeArray(
      sourceHistory
    )
  ) {
    const ymd =
      String(
        helpers.pickDrawYMD(
          draw
        ) || ""
      ).trim();

    const rawHour =
      normalizeHour(
        helpers.pickDrawHour(
          draw
        )
      );

    const hour =
      canonicalLookHour(
        rawHour
      );

    if (
      !isYmd(ymd) ||
      !hour
    ) {
      rejectedRows += 1;
      continue;
    }

    if (
      rawHour === hour
    ) {
      exactRows += 1;
    }
    else {
      mappedRows += 1;
    }

    const ts =
      ymdHourToTs(
        ymd,
        hour
      );

    if (
      !Number.isFinite(
        ts
      )
    ) {
      rejectedRows += 1;
      continue;
    }

    const canonicalDraw =
      canonicalLookDraw(
        draw,
        hour
      );

    const key =
      `${ymd}|${hour}`;

    if (
      !groups.has(key)
    ) {
      groups.set(
        key,
        []
      );
    }

    groups
      .get(key)
      .push({
        draw:
          canonicalDraw,
        ymd,
        hour,
        ts,
      });
  }

  const duplicateGroups =
    Array.from(
      groups.values()
    )
      .filter(
        (rows) =>
          rows.length > 1
      )
      .length;

  const duplicateExcess =
    Array.from(
      groups.values()
    )
      .reduce(
        (
          total,
          rows
        ) =>
          total +
          Math.max(
            0,
            rows.length - 1
          ),
        0
      );

  const history =
    Array.from(
      groups.values()
    )
      .map(
        (rows) => {
          let best =
            rows[0];

          for (
            let index = 1;
            index < rows.length;
            index += 1
          ) {
            if (
              drawQuality(
                rows[index].draw,
                helpers
              ) >
              drawQuality(
                best.draw,
                helpers
              )
            ) {
              best =
                rows[index];
            }
          }

          return best;
        }
      )
      .sort(
        (a, b) =>
          a.ts - b.ts ||
          a.ymd.localeCompare(
            b.ymd
          ) ||
          a.hour.localeCompare(
            b.hour
          )
      );

  return {
    history,
    exactRows,
    mappedRows,
    rejectedRows,
    duplicateGroups,
    duplicateExcess,
  };
}

function topLimitFromInput(
  input
) {
  const requested =
    Number(
      input?.topN || 3
    );

  return Math.min(
    25,
    Math.max(
      1,
      Number.isFinite(
        requested
      )
        ? Math.trunc(
            requested
          )
        : 3
    )
  );
}

function buildTitle(index) {
  if (index === 0) {
    return "Mais provável";
  }

  if (index === 1) {
    return "2º mais provável";
  }

  return "3º mais provável";
}

function normalizeSumMap(
  input
) {
  const out =
    new Map();

  let total = 0;

  for (
    let group = 1;
    group <= 25;
    group += 1
  ) {
    const value =
      Math.max(
        0,
        num(
          input?.get?.(group),
          0
        )
      );

    out.set(
      group,
      value
    );

    total +=
      value;
  }

  if (
    total > 0
  ) {
    for (
      let group = 1;
      group <= 25;
      group += 1
    ) {
      out.set(
        group,
        num(
          out.get(group),
          0
        ) / total
      );
    }
  }

  return out;
}

function rankMap(
  scoreMap,
  tieMap
) {
  return Array.from(
    {
      length: 25,
    },
    (
      _,
      index
    ) =>
      index + 1
  )
    .sort(
      (a, b) => {
        const delta =
          num(
            scoreMap?.get?.(b),
            0
          ) -
          num(
            scoreMap?.get?.(a),
            0
          );

        if (delta) {
          return delta;
        }

        const tieDelta =
          num(
            tieMap?.get?.(b),
            0
          ) -
          num(
            tieMap?.get?.(a),
            0
          );

        if (tieDelta) {
          return tieDelta;
        }

        return a - b;
      }
    );
}

function v7SignalFromLayers({
  additionalLayers,
  layerKey,
}) {
  const map =
    new Map();

  const reliabilities =
    [];

  const samples =
    [];

  let enabledGroups = 0;

  for (
    let group = 1;
    group <= 25;
    group += 1
  ) {
    const result =
      getTop3V7AdditionalLayerResult(
        additionalLayers,
        layerKey,
        group
      );

    const enabled =
      result?.enabled !== false;

    map.set(
      group,
      enabled
        ? Math.max(
            0,
            num(
              result?.probability,
              0
            )
          )
        : 0
    );

    if (enabled) {
      enabledGroups += 1;

      reliabilities.push(
        clamp01(
          result?.reliability
        )
      );

      samples.push(
        Math.max(
          0,
          num(
            result?.samples,
            0
          )
        )
      );
    }
  }

  const reliability =
    reliabilities.length
      ? (
          reliabilities.reduce(
            (
              sum,
              value
            ) =>
              sum + value,
            0
          ) /
          reliabilities.length
        )
      : 0;

  const sample =
    samples.length
      ? (
          samples.reduce(
            (
              sum,
              value
            ) =>
              sum + value,
            0
          ) /
          samples.length
        )
      : 0;

  const active =
    enabledGroups > 0 &&
    Array.from(
      map.values()
    )
      .some(
        (value) =>
          value > 0
      );

  return {
    map,
    reliability,
    sample,
    active,
  };
}

function blendTwo({
  baselineMap,
  signalAMap,
  signalAReliability,
  signalBMap,
  signalBReliability,
}) {
  const baseline =
    normalizeSumMap(
      baselineMap
    );

  const signalA =
    normalizeSumMap(
      signalAMap
    );

  const signalB =
    normalizeSumMap(
      signalBMap
    );

  let baselineWeight =
    0.50;

  let signalAWeight =
    0.25 *
    clamp01(
      signalAReliability
    );

  let signalBWeight =
    0.25 *
    clamp01(
      signalBReliability
    );

  const signalATotal =
    Array.from(
      signalA.values()
    )
      .reduce(
        (
          total,
          value
        ) =>
          total + value,
        0
      );

  const signalBTotal =
    Array.from(
      signalB.values()
    )
      .reduce(
        (
          total,
          value
        ) =>
          total + value,
        0
      );

  if (
    !(signalATotal > 0)
  ) {
    signalAWeight = 0;
  }

  if (
    !(signalBTotal > 0)
  ) {
    signalBWeight = 0;
  }

  const totalWeight =
    baselineWeight +
    signalAWeight +
    signalBWeight;

  baselineWeight /=
    totalWeight;

  signalAWeight /=
    totalWeight;

  signalBWeight /=
    totalWeight;

  const scoreMap =
    new Map();

  for (
    let group = 1;
    group <= 25;
    group += 1
  ) {
    scoreMap.set(
      group,
      (
        num(
          baseline.get(group),
          0
        ) *
        baselineWeight
      ) +
      (
        num(
          signalA.get(group),
          0
        ) *
        signalAWeight
      ) +
      (
        num(
          signalB.get(group),
          0
        ) *
        signalBWeight
      )
    );
  }

  return {
    scoreMap,
    active:
      signalAWeight > 0 ||
      signalBWeight > 0,
    weights: {
      baseline:
        baselineWeight,
      signalA:
        signalAWeight,
      signalB:
        signalBWeight,
    },
  };
}

function parsePercent(
  reasons,
  regex
) {
  for (
    const reason
    of safeArray(reasons)
  ) {
    const match =
      String(reason || "")
        .match(regex);

    if (match) {
      return (
        num(
          match[1],
          0
        ) /
        100
      );
    }
  }

  return 0;
}

function buildV2RepeatBoostSignal(
  v2
) {
  const raw =
    new Map();

  for (
    const item
    of safeArray(
      v2?.top
    )
  ) {
    const group =
      Number(
        item?.grupo ??
        item?.group
      );

    if (
      !Number.isFinite(
        group
      ) ||
      group < 1 ||
      group > 25
    ) {
      continue;
    }

    raw.set(
      group,
      parsePercent(
        item?.reasons,
        /boost de repetição=([0-9.]+)%/i
      )
    );
  }

  for (
    let group = 1;
    group <= 25;
    group += 1
  ) {
    if (
      !raw.has(group)
    ) {
      raw.set(
        group,
        0
      );
    }
  }

  const map =
    normalizeSumMap(
      raw
    );

  const active =
    Array.from(
      map.values()
    )
      .reduce(
        (
          total,
          value
        ) =>
          total + value,
        0
      ) > 0;

  return {
    map,
    active,
    samples:
      num(
        v2
          ?.meta
          ?.explain
          ?.repeatWindowConsidered,
        0
      ),
  };
}

function assertProductionMatrix() {
  const keys =
    Object.keys(
      LOOK_FINAL56_MODEL_BY_CONTEXT
    );

  if (
    keys.length !==
    LOOK_FINAL56_CONTEXT_COUNT
  ) {
    throw new Error(
      "LOOK_FINAL56_MATRIX_CONTEXT_COUNT_INVALID"
    );
  }

  let expectedContexts = 0;

  for (
    let dow = 0;
    dow <= 6;
    dow += 1
  ) {
    for (
      const hour
      of LOOK_HOURS
    ) {
      expectedContexts += 1;

      const key =
        `${dow}|${hour}`;

      if (
        !Object.prototype
          .hasOwnProperty
          .call(
            LOOK_FINAL56_MODEL_BY_CONTEXT,
            key
          )
      ) {
        throw new Error(
          `LOOK_FINAL56_MATRIX_CONTEXT_MISSING=${key}`
        );
      }
    }
  }

  if (
    expectedContexts !==
    LOOK_FINAL56_CONTEXT_COUNT
  ) {
    throw new Error(
      "LOOK_FINAL56_MATRIX_EXPECTED_CONTEXTS_INVALID"
    );
  }

  const altKeys =
    Object.keys(
      ALT_PROFILES
    );

  if (
    altKeys.length !==
    LOOK_FINAL56_CONFIRMED_COUNT
  ) {
    throw new Error(
      "LOOK_FINAL56_ALT_PROFILE_COUNT_INVALID"
    );
  }

  for (
    const [
      key,
      profile,
    ]
    of Object.entries(
      ALT_PROFILES
    )
  ) {
    if (
      LOOK_FINAL56_MODEL_BY_CONTEXT[
        key
      ] !== profile.model
    ) {
      throw new Error(
        `LOOK_FINAL56_PROFILE_MATRIX_DIVERGED=${key}`
      );
    }
  }

  const confirmedInMatrix =
    Object.values(
      LOOK_FINAL56_MODEL_BY_CONTEXT
    )
      .filter(
        (model) =>
          !String(model)
            .startsWith(
              "BASELINE_"
            )
      )
      .length;

  if (
    confirmedInMatrix !==
    LOOK_FINAL56_CONFIRMED_COUNT
  ) {
    throw new Error(
      "LOOK_FINAL56_CONFIRMED_COUNT_DIVERGED"
    );
  }

  const requiredV7Signals =
    new Set();

  for (
    const profile
    of Object.values(
      ALT_PROFILES
    )
  ) {
    if (
      profile.family ===
      "V7_STANDALONE"
    ) {
      requiredV7Signals.add(
        profile.signal
      );
    }

    if (
      profile.family ===
      "V7_PAIR_50_25_25"
    ) {
      requiredV7Signals.add(
        profile.signalA
      );

      requiredV7Signals.add(
        profile.signalB
      );
    }
  }

  const catalog =
    safeArray(
      TOP3_V7_ADDITIONAL_LAYER_KEYS
    );

  for (
    const signal
    of requiredV7Signals
  ) {
    if (
      !catalog.includes(
        signal
      )
    ) {
      throw new Error(
        `LOOK_FINAL56_V7_SIGNAL_MISSING=${signal}`
      );
    }
  }
}

assertProductionMatrix();

function decorateTop({
  base,
  selectedGroups,
  scoreMap,
  contextKey,
  model,
  profile,
  canonical,
  targetYmd,
  targetHour,
  topLimit,
  profileRuntime,
}) {
  const baseTopByGroup =
    new Map(
      safeArray(
        base?.top
      )
        .map(
          (item) => [
            Number(
              item?.grupo
            ),
            item,
          ]
        )
        .filter(
          ([group]) =>
            Number.isFinite(
              group
            ) &&
            group >= 1 &&
            group <= 25
        )
    );

  return selectedGroups
    .slice(
      0,
      topLimit
    )
    .map(
      (
        group,
        index
      ) => {
        const existing =
          baseTopByGroup.get(
            group
          ) ||
          {};

        const calibratedScore =
          num(
            scoreMap?.get?.(
              group
            ),
            0
          );

        return {
          ...existing,

          rank:
            index + 1,

          title:
            buildTitle(
              index
            ),

          grupo:
            group,

          scoreProb:
            calibratedScore,

          rawScoreProb:
            calibratedScore,

          score:
            calibratedScore *
            1000,

          reasons: [
            `Motor: ${LOOK_FINAL56_PRODUCTION_VERSION}`,
            `Perfil confirmado: ${model}`,
            `Contexto: ${contextKey}`,
            `Matriz FULL29: ${LOOK_FINAL56_MATRIX_CERTIFICATE_SHA256}`,
          ],

          meta: {
            ...(
              existing?.meta ||
              {}
            ),

            scenario:
              model,

            explain: {
              ...(
                existing
                  ?.meta
                  ?.explain ||
                {}
              ),

              engine:
                LOOK_FINAL56_PRODUCTION_VERSION,

              baselineEngine:
                "CURRENT_PRODUCTION_LOOK_TOP3_DIRECT",

              productionProfile:
                model,

              lookFinal56: {
                version:
                  LOOK_FINAL56_PRODUCTION_VERSION,

                contextKey,
                model,
                family:
                  profile?.family ||
                  "UNKNOWN",

                applied:
                  true,

                targetYmd,
                targetHour,

                canonicalization: {
                  maxDistanceMinutes:
                    15,

                  exactRows:
                    canonical.exactRows,

                  mappedRows:
                    canonical.mappedRows,

                  rejectedRows:
                    canonical.rejectedRows,

                  duplicateGroups:
                    canonical.duplicateGroups,

                  duplicateExcess:
                    canonical.duplicateExcess,
                },

                fullReplay: {
                  from:
                    "2022-06-07",

                  to:
                    "2026-08-14",

                  holdoutParity:
                    "2026-08-15..2026-08-28",

                  decision:
                    "FINALIST_CONFIRMED_FULL_REPLAY",
                },

                runtime:
                  profileRuntime ||
                  null,

                matrixCertificateSha256:
                  LOOK_FINAL56_MATRIX_CERTIFICATE_SHA256,
              },
            },
          },
        };
      }
    );
}

function decorateBaseline({
  base,
  contextKey,
  model,
  canonical,
  targetYmd,
  targetHour,
  topLimit,
}) {
  const top =
    safeArray(
      base?.top
    )
      .slice(
        0,
        topLimit
      )
      .map(
        (
          item,
          index
        ) => ({
          ...item,

          rank:
            index + 1,

          title:
            buildTitle(
              index
            ),

          meta: {
            ...(
              item?.meta ||
              {}
            ),

            explain: {
              ...(
                item
                  ?.meta
                  ?.explain ||
                {}
              ),

              lookFinal56: {
                version:
                  LOOK_FINAL56_PRODUCTION_VERSION,

                contextKey,
                model,

                family:
                  "BASELINE",

                applied:
                  false,

                targetYmd,
                targetHour,

                canonicalization: {
                  maxDistanceMinutes:
                    15,

                  exactRows:
                    canonical.exactRows,

                  mappedRows:
                    canonical.mappedRows,

                  rejectedRows:
                    canonical.rejectedRows,

                  duplicateGroups:
                    canonical.duplicateGroups,

                  duplicateExcess:
                    canonical.duplicateExcess,
                },

                fullReplay: {
                  decision:
                    "BASELINE_PRESERVED",
                },

                matrixCertificateSha256:
                  LOOK_FINAL56_MATRIX_CERTIFICATE_SHA256,
              },
            },
          },
        })
      );

  return {
    ...base,

    top,

    meta: {
      ...(
        base?.meta ||
        {}
      ),

      explain: {
        ...(
          base
            ?.meta
            ?.explain ||
          {}
        ),

        lookFinal56: {
          version:
            LOOK_FINAL56_PRODUCTION_VERSION,

          contextKey,
          model,

          family:
            "BASELINE",

          applied:
            false,

          targetYmd,
          targetHour,

          canonicalization: {
            maxDistanceMinutes:
              15,

            exactRows:
              canonical.exactRows,

            mappedRows:
              canonical.mappedRows,

            rejectedRows:
              canonical.rejectedRows,

            duplicateGroups:
              canonical.duplicateGroups,

            duplicateExcess:
              canonical.duplicateExcess,
          },

          fullReplay: {
            decision:
              "BASELINE_PRESERVED",
          },

          matrixCertificateSha256:
            LOOK_FINAL56_MATRIX_CERTIFICATE_SHA256,
        },
      },
    },
  };
}

export function computeLookFinal56Top3({
  input = {},
  baseCompute,
  currentCompute,
  v2Compute,
  helpers = {},
}) {
  if (
    typeof currentCompute !==
    "function"
  ) {
    throw new Error(
      "LOOK_FINAL56_CURRENT_COMPUTE_REQUIRED"
    );
  }

  if (
    normalizeLotteryKey(
      input?.lotteryKey
    ) !== "LOOK"
  ) {
    return currentCompute(
      input
    );
  }

  let fallbackCurrent =
    null;

  try {
    if (
      typeof baseCompute !==
      "function"
    ) {
      throw new Error(
        "LOOK_FINAL56_BASE_COMPUTE_REQUIRED"
      );
    }

    if (
      !helpers ||
      typeof helpers.pickDrawYMD !==
        "function" ||
      typeof helpers.pickDrawHour !==
        "function" ||
      typeof helpers.guessPrizePos !==
        "function" ||
      typeof helpers.guessPrizeGrupo !==
        "function"
    ) {
      throw new Error(
        "LOOK_FINAL56_HELPERS_REQUIRED"
      );
    }

    const forcedYmd =
      isYmd(
        input?.targetYmdOverride
      )
        ? String(
            input.targetYmdOverride
          ).trim()
        : "";

    const forcedHour =
      canonicalLookHour(
        input?.targetHourOverride
      );

    let targetYmd =
      forcedYmd;

    let targetHour =
      forcedHour;

    if (
      !targetYmd ||
      !targetHour
    ) {
      fallbackCurrent =
        currentCompute(
          input
        );

      targetYmd =
        String(
          fallbackCurrent
            ?.meta
            ?.next
            ?.ymd ||
          ""
        ).trim();

      targetHour =
        canonicalLookHour(
          fallbackCurrent
            ?.meta
            ?.next
            ?.hour
        );
    }

    if (
      !isYmd(
        targetYmd
      ) ||
      !targetHour
    ) {
      throw new Error(
        "LOOK_FINAL56_TARGET_INVALID"
      );
    }

    const targetTs =
      ymdHourToTs(
        targetYmd,
        targetHour
      );

    if (
      !Number.isFinite(
        targetTs
      )
    ) {
      throw new Error(
        "LOOK_FINAL56_TARGET_TS_INVALID"
      );
    }

    const sourceHistory = [
      ...safeArray(
        input?.drawsRange
      ),
    ];

    if (input?.drawLast) {
      sourceHistory.push(
        input.drawLast
      );
    }

    const canonical =
      canonicalizeHistory(
        sourceHistory,
        helpers
      );

    const canonicalEntries =
      canonical.history
        .filter(
          (entry) =>
            Number.isFinite(
              entry?.ts
            ) &&
            entry.ts <
              targetTs
        );

    if (
      canonicalEntries.length < 1
    ) {
      throw new Error(
        "LOOK_FINAL56_CAUSAL_HISTORY_EMPTY"
      );
    }

    const previousEntry =
      canonicalEntries[
        canonicalEntries.length - 1
      ];

    const historyBefore =
      canonicalEntries.map(
        (entry) =>
          entry.draw
      );

    const drawsToday =
      canonicalEntries
        .filter(
          (entry) =>
            entry.ymd ===
            targetYmd
        )
        .map(
          (entry) =>
            entry.draw
        );

    const base =
      baseCompute({
        ...input,

        lotteryKey:
          "LOOK",

        drawsRange:
          historyBefore,

        drawLast:
          previousEntry.draw,

        drawsToday,

        topN:
          25,

        targetYmdOverride:
          targetYmd,

        targetHourOverride:
          targetHour,

        drawsAlreadySorted:
          true,
      });

    const computedYmd =
      String(
        base
          ?.meta
          ?.next
          ?.ymd ||
        ""
      ).trim();

    const computedHour =
      canonicalLookHour(
        base
          ?.meta
          ?.next
          ?.hour
      );

    if (
      computedYmd !==
        targetYmd ||
      computedHour !==
        targetHour
    ) {
      throw new Error(
        "LOOK_FINAL56_TARGET_PARITY_FAIL=" +
        computedYmd +
        "|" +
        computedHour +
        "|EXPECTED=" +
        targetYmd +
        "|" +
        targetHour
      );
    }

    const dow =
      getDow(
        targetYmd
      );

    const contextKey =
      `${dow}|${targetHour}`;

    const model =
      LOOK_FINAL56_MODEL_BY_CONTEXT[
        contextKey
      ] ||
      "";

    if (!model) {
      throw new Error(
        `LOOK_FINAL56_CONTEXT_NOT_FOUND=${contextKey}`
      );
    }

    const topLimit =
      topLimitFromInput(
        input
      );

    const profile =
      ALT_PROFILES[
        contextKey
      ] ||
      null;

    if (!profile) {
      return decorateBaseline({
        base,
        contextKey,
        model,
        canonical,
        targetYmd,
        targetHour,
        topLimit,
      });
    }

    if (
      profile.model !==
      model
    ) {
      throw new Error(
        `LOOK_FINAL56_PROFILE_MODEL_DIVERGED=${contextKey}`
      );
    }

    const rankingBefore =
      safeArray(
        base
          ?.meta
          ?.explain
          ?.rankingAudit
          ?.rankingBeforeScore
      );

    if (
      rankingBefore.length !==
      25
    ) {
      throw new Error(
        "LOOK_FINAL56_V3_RANKING_BEFORE_MISSING"
      );
    }

    const tieMap =
      new Map();

    const baselineMap =
      new Map();

    for (
      const row
      of rankingBefore
    ) {
      const group =
        Number(
          row?.grupo
        );

      if (
        !Number.isFinite(
          group
        ) ||
        group < 1 ||
        group > 25
      ) {
        throw new Error(
          "LOOK_FINAL56_INVALID_GROUP_IN_V3_RANKING"
        );
      }

      const score =
        Math.max(
          0,
          num(
            row?.scoreProb ??
            row?.score,
            0
          )
        );

      tieMap.set(
        group,
        score
      );

      baselineMap.set(
        group,
        score
      );
    }

    const baselineFallbackTop =
      safeArray(
        base?.top
      )
        .slice(
          0,
          25
        );

    const baselineFallbackGroups =
      baselineFallbackTop
        .map(
          (item) =>
            Number(
              item?.grupo
            )
        )
        .filter(
          (group) =>
            Number.isFinite(
              group
            ) &&
            group >= 1 &&
            group <= 25
        );

    if (
      baselineFallbackGroups.length !== 25 ||
      new Set(
        baselineFallbackGroups
      ).size !== 25
    ) {
      throw new Error(
        "LOOK_FINAL56_CURRENT_BASELINE_TOP25_INVALID"
      );
    }

    const baselineFallbackScoreMap =
      new Map(
        baselineFallbackTop
          .map(
            (item) => {
              const group =
                Number(
                  item?.grupo
                );

              const score =
                Math.max(
                  0,
                  num(
                    item?.scoreProb ??
                    item?.rawScoreProb ??
                    (
                      num(
                        item?.score,
                        0
                      ) / 1000
                    ),
                    0
                  )
                );

              return [
                group,
                score,
              ];
            }
          )
      );

    let inactiveFallback =
      null;
    let scoreMap =
      null;

    let selectedGroups =
      null;

    let profileRuntime =
      null;

    if (
      profile.family ===
      "V7_STANDALONE" ||
      profile.family ===
      "V7_PAIR_50_25_25"
    ) {
      const additionalLayers =
        buildTop3V7AdditionalLayers({
          history:
            historyBefore,

          targetYmd,

          targetHour,
        });

      if (
        profile.family ===
        "V7_STANDALONE"
      ) {
        const signal =
          v7SignalFromLayers({
            additionalLayers,
            layerKey:
              profile.signal,
          });

        if (signal.active) {
          scoreMap =
            normalizeSumMap(
              signal.map
            );

          selectedGroups =
            rankMap(
              scoreMap,
              tieMap
            );
        }
        else {
          scoreMap =
            baselineFallbackScoreMap;

          selectedGroups =
            baselineFallbackGroups
              .slice();

          inactiveFallback =
            "CURRENT_LOOK_BASELINE";
        }

        profileRuntime = {
          signal: {
            key:
              profile.signal,

            reliability:
              signal.reliability,

            samples:
              signal.sample,

            active:
              signal.active,
          },
        };
      }
      else {
        const signalA =
          v7SignalFromLayers({
            additionalLayers,
            layerKey:
              profile.signalA,
          });

        const signalB =
          v7SignalFromLayers({
            additionalLayers,
            layerKey:
              profile.signalB,
          });

        const blended =
          blendTwo({
            baselineMap,

            signalAMap:
              signalA.map,

            signalAReliability:
              signalA.reliability,

            signalBMap:
              signalB.map,

            signalBReliability:
              signalB.reliability,
          });

        scoreMap =
          blended.scoreMap;

        selectedGroups =
          rankMap(
            scoreMap,
            tieMap
          );

        if (!blended.active) {
          inactiveFallback =
            "RAW_V3_BLEND_ANCHOR";
        }

        profileRuntime = {
          signalA: {
            key:
              profile.signalA,

            reliability:
              signalA.reliability,

            samples:
              signalA.sample,

            active:
              signalA.active,
          },

          signalB: {
            key:
              profile.signalB,

            reliability:
              signalB.reliability,

            samples:
              signalB.sample,

            active:
              signalB.active,
          },

          weights: {
            ...blended.weights,
          },
        };
      }
    }
    else if (
      profile.family ===
      "V2_STANDALONE"
    ) {
      if (
        typeof v2Compute !==
        "function"
      ) {
        throw new Error(
          "LOOK_FINAL56_V2_COMPUTE_REQUIRED"
        );
      }

      const v2 =
        v2Compute({
          lotteryKey:
            "LOOK",

          drawsRange:
            historyBefore,

          drawLast:
            previousEntry.draw,

          drawsToday,

          PT_RIO_SCHEDULE_NORMAL:
            input?.PT_RIO_SCHEDULE_NORMAL,

          PT_RIO_SCHEDULE_WED_SAT:
            input?.PT_RIO_SCHEDULE_WED_SAT,

          FEDERAL_SCHEDULE:
            input?.FEDERAL_SCHEDULE,

          topN:
            25,

          targetYmdOverride:
            targetYmd,

          targetHourOverride:
            targetHour,

          drawsAlreadySorted:
            true,
        });

      if (
        safeArray(
          v2?.top
        ).length !== 25
      ) {
        throw new Error(
          "LOOK_FINAL56_V2_TOP25_INCOMPLETE"
        );
      }

      const signal =
        buildV2RepeatBoostSignal(
          v2
        );

      if (signal.active) {
        scoreMap =
          signal.map;

        selectedGroups =
          rankMap(
            scoreMap,
            tieMap
          );
      }
      else {
        scoreMap =
          baselineFallbackScoreMap;

        selectedGroups =
          baselineFallbackGroups
            .slice();

        inactiveFallback =
          "CURRENT_LOOK_BASELINE";
      }

      profileRuntime = {
        signal: {
          key:
            profile.signal,

          samples:
            signal.samples,

          active:
            signal.active,
        },
      };
    }
    else {
      throw new Error(
        `LOOK_FINAL56_FAMILY_UNSUPPORTED=${profile.family}`
      );
    }

    if (
      profileRuntime &&
      typeof profileRuntime ===
        "object"
    ) {
      profileRuntime = {
        ...profileRuntime,

        inactiveFallback:
          inactiveFallback,

        baselineFallbackGroups:
          inactiveFallback ===
          "CURRENT_LOOK_BASELINE"
            ? baselineFallbackGroups
                .slice(
                  0,
                  topLimit
                )
            : [],
      };
    }
    const top =
      decorateTop({
        base,
        selectedGroups,
        scoreMap,
        contextKey,
        model,
        profile,
        canonical,
        targetYmd,
        targetHour,
        topLimit,
        profileRuntime,
      });

    if (
      top.length !==
      topLimit
    ) {
      throw new Error(
        `LOOK_FINAL56_TOP_COUNT_INVALID=${top.length}|EXPECTED=${topLimit}`
      );
    }

    return {
      ...base,

      top,

      meta: {
        ...(
          base?.meta ||
          {}
        ),

        scenario:
          model,

        explain: {
          ...(
            base
              ?.meta
              ?.explain ||
            {}
          ),

          engine:
            LOOK_FINAL56_PRODUCTION_VERSION,

          baselineEngine:
            "CURRENT_PRODUCTION_LOOK_TOP3_DIRECT",

          productionProfile:
            model,

          lookFinal56: {
            version:
              LOOK_FINAL56_PRODUCTION_VERSION,

            contextKey,
            model,

            family:
              profile.family,

            applied:
              true,

            targetYmd,
            targetHour,

            canonicalization: {
              maxDistanceMinutes:
                15,

              exactRows:
                canonical.exactRows,

              mappedRows:
                canonical.mappedRows,

              rejectedRows:
                canonical.rejectedRows,

              duplicateGroups:
                canonical.duplicateGroups,

              duplicateExcess:
                canonical.duplicateExcess,
            },

            fullReplay: {
              from:
                "2022-06-07",

              to:
                "2026-08-14",

              holdoutParity:
                "2026-08-15..2026-08-28",

              decision:
                "FINALIST_CONFIRMED_FULL_REPLAY",
            },

            runtime:
              profileRuntime,

            matrixCertificateSha256:
              LOOK_FINAL56_MATRIX_CERTIFICATE_SHA256,
          },
        },
      },
    };
  }
  catch (error) {
    try {
      console.warn(
        "[LOOK FINAL56] fallback -> CURRENT_LOOK",
        {
          error:
            String(
              error?.message ||
              error
            ),
        }
      );
    }
    catch {
      // sem efeito funcional
    }

    return (
      fallbackCurrent ||
      currentCompute(
        input
      )
    );
  }
}

export default {
  version:
    LOOK_FINAL56_PRODUCTION_VERSION,

  matrixCertificateSha256:
    LOOK_FINAL56_MATRIX_CERTIFICATE_SHA256,

  matrix:
    LOOK_FINAL56_MODEL_BY_CONTEXT,

  computeLookFinal56Top3,
};
