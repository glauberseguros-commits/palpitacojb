import {
  TOP3_V7_ADDITIONAL_LAYER_KEYS,
  buildTop3V7AdditionalLayers,
  getTop3V7AdditionalLayerResult,
} from "./v7/top3.v7.additional-layers";

export const PT_RIO_MONDAY_CALIBRATED_VERSION =
  "PT_RIO_MONDAY_CALIBRATED_V1";

const SIX_LAYERS = [
  "hour",
  "dowHour",
  "dayMonth",
  "transition",
  "recent",
  "scene",
];

const REQUIRED_V7_SIGNALS = [
  "cycleRegime",
  "dailyFlow",
  "historicalFrequency",
  "animalOfDay",
];

const PROFILES = Object.freeze({
  "14:00": Object.freeze({
    model:
      "V7_PAIR_50_25_25::cycleRegime+dailyFlow",
    baselineLayers: Object.freeze([
      "dowHour",
      "transition",
    ]),
    signalA: "cycleRegime",
    signalB: "dailyFlow",
  }),

  "16:00": Object.freeze({
    model:
      "V7_PAIR_50_25_25::historicalFrequency+animalOfDay",
    baselineLayers: Object.freeze([
      "transition",
      "recent",
    ]),
    signalA: "historicalFrequency",
    signalB: "animalOfDay",
  }),
});

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);

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

function normalizeHour(value) {
  const text = String(value ?? "")
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

  const hh = Number(match[1]);
  const mm = Number(
    match[2] ?? 0
  );

  if (
    !Number.isFinite(hh) ||
    !Number.isFinite(mm) ||
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

function normalizeLotteryKey(value) {
  const key = String(value || "")
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

function ymdHourToTs(
  ymd,
  hour
) {
  const y =
    String(ymd || "").trim();

  const h =
    normalizeHour(hour);

  if (
    !isYmd(y) ||
    !h
  ) {
    return Number.NaN;
  }

  const [Y, M, D] =
    y.split("-").map(Number);

  const [hh, mm] =
    h.split(":").map(Number);

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

function isMonday(ymd) {
  if (!isYmd(ymd)) {
    return false;
  }

  const [Y, M, D] =
    String(ymd)
      .split("-")
      .map(Number);

  return (
    new Date(
      Date.UTC(
        Y,
        M - 1,
        D
      )
    ).getUTCDay() === 1
  );
}

function validPrizeCount(
  draw,
  helpers
) {
  return safeArray(
    draw?.prizes
  )
    .filter((prize) => {
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

      return (
        Number.isFinite(pos) &&
        pos >= 1 &&
        pos <= 7 &&
        Number.isFinite(group) &&
        group >= 1 &&
        group <= 25
      );
    })
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
    safeArray(draw?.prizes)
      .some(
        (prize) =>
          Number(
            helpers.guessPrizePos(
              prize
            )
          ) === 1
      );

  return (
    count * 100
  ) + (
    hasP1
      ? 10
      : 0
  );
}

function canonicalizeHistory(
  sourceHistory,
  helpers
) {
  const groups = new Map();

  for (
    const draw
    of safeArray(sourceHistory)
  ) {
    const ymd =
      String(
        helpers.pickDrawYMD(
          draw
        ) || ""
      ).trim();

    const hour =
      normalizeHour(
        helpers.pickDrawHour(
          draw
        )
      );

    const ts =
      ymdHourToTs(
        ymd,
        hour
      );

    if (!Number.isFinite(ts)) {
      continue;
    }

    const key =
      `${ymd}|${hour}`;

    if (!groups.has(key)) {
      groups.set(
        key,
        []
      );
    }

    groups
      .get(key)
      .push({
        draw,
        ymd,
        hour,
        ts,
      });
  }

  const history =
    Array.from(
      groups.values()
    )
      .map((rows) => {
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
      })
      .sort(
        (a, b) =>
          a.ts - b.ts ||
          String(a.ymd)
            .localeCompare(
              String(b.ymd)
            ) ||
          String(a.hour)
            .localeCompare(
              String(b.hour)
            )
      );

  return history;
}

function findStage(
  passive,
  group,
  layerKey
) {
  const groupData =
    passive?.byGroup?.[group] ??
    passive?.byGroup?.[
      String(group)
    ] ??
    null;

  return (
    safeArray(
      groupData?.stages
    )
      .find(
        (stage) =>
          String(
            stage?.key || ""
          ) === layerKey
      ) ||
    null
  );
}

function buildSourceOrder({
  passive,
  rankingBefore,
}) {
  const list = [];

  for (
    const rankingRow
    of rankingBefore
  ) {
    const group =
      Number(
        rankingRow?.grupo
      );

    if (
      !Number.isFinite(group) ||
      group < 1 ||
      group > 25
    ) {
      throw new Error(
        "PT_RIO_CALIBRATED_INVALID_GROUP_IN_RANKING"
      );
    }

    const rawByLayer = {};

    for (
      const layerKey
      of SIX_LAYERS
    ) {
      const stage =
        findStage(
          passive,
          group,
          layerKey
        );

      if (!stage) {
        throw new Error(
          `PT_RIO_CALIBRATED_MISSING_LAYER=${layerKey}|G${group}`
        );
      }

      const raw =
        Number(
          stage?.rawProbability ??
          stage?.probability ??
          0
        );

      rawByLayer[layerKey] =
        Number.isFinite(raw)
          ? raw
          : 0;
    }

    list.push({
      group,
      score:
        Number(
          rankingRow?.score || 0
        ),
      scoreProb:
        Number(
          rankingRow?.scoreProb ??
          rankingRow?.score ??
          0
        ),
      rawByLayer,
    });
  }

  if (list.length !== 25) {
    throw new Error(
      `PT_RIO_CALIBRATED_RANKING_EXPECTED_25_GOT=${list.length}`
    );
  }

  return list;
}

function profileScoreMap(
  sourceOrder,
  layerKeys
) {
  const totals =
    Object.fromEntries(
      layerKeys.map(
        (layerKey) => [
          layerKey,
          sourceOrder.reduce(
            (sum, item) =>
              sum +
              Math.max(
                0,
                num(
                  item?.rawByLayer?.[
                    layerKey
                  ],
                  0
                )
              ),
            0
          ),
        ]
      )
    );

  const scores =
    new Map();

  for (
    const item
    of sourceOrder
  ) {
    let sum = 0;
    let used = 0;

    for (
      const layerKey
      of layerKeys
    ) {
      const total =
        num(
          totals[layerKey],
          0
        );

      if (!(total > 0)) {
        continue;
      }

      sum +=
        Math.max(
          0,
          num(
            item?.rawByLayer?.[
              layerKey
            ],
            0
          )
        ) /
        total;

      used += 1;
    }

    scores.set(
      Number(item.group),
      used > 0
        ? sum / used
        : 0
    );
  }

  return scores;
}

function tieMapFromSource(
  sourceOrder
) {
  return new Map(
    sourceOrder.map(
      (item) => [
        Number(item.group),
        Number(
          item?.scoreProb ??
          item?.score ??
          0
        ),
      ]
    )
  );
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

    total += value;
  }

  if (!(total > 0)) {
    return out;
  }

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

  return out;
}

function rankScoreMap(
  scoreMap,
  tieMap
) {
  return Array.from(
    {
      length: 25,
    },
    (_, index) =>
      index + 1
  )
    .sort(
      (a, b) => {
        const scoreA =
          num(
            scoreMap?.get?.(a),
            0
          );

        const scoreB =
          num(
            scoreMap?.get?.(b),
            0
          );

        if (
          scoreB !== scoreA
        ) {
          return (
            scoreB -
            scoreA
          );
        }

        const tieA =
          num(
            tieMap?.get?.(a),
            0
          );

        const tieB =
          num(
            tieMap?.get?.(b),
            0
          );

        if (
          tieB !== tieA
        ) {
          return (
            tieB -
            tieA
          );
        }

        return a - b;
      }
    );
}

function blendBaselineWithTwoSignals({
  baselineMap,
  signalA,
  reliabilityA,
  signalB,
  reliabilityB,
}) {
  const base =
    normalizeSumMap(
      baselineMap
    );

  const a =
    normalizeSumMap(
      signalA
    );

  const b =
    normalizeSumMap(
      signalB
    );

  let wBase = 0.50;

  let wA =
    0.25 *
    clamp01(
      reliabilityA
    );

  let wB =
    0.25 *
    clamp01(
      reliabilityB
    );

  const totalA =
    Array.from(
      a.values()
    )
      .reduce(
        (sum, value) =>
          sum + value,
        0
      );

  const totalB =
    Array.from(
      b.values()
    )
      .reduce(
        (sum, value) =>
          sum + value,
        0
      );

  if (!(totalA > 0)) {
    wA = 0;
  }

  if (!(totalB > 0)) {
    wB = 0;
  }

  const total =
    wBase +
    wA +
    wB;

  wBase /= total;
  wA /= total;
  wB /= total;

  const out =
    new Map();

  for (
    let group = 1;
    group <= 25;
    group += 1
  ) {
    out.set(
      group,
      (
        num(
          base.get(group),
          0
        ) *
        wBase
      ) +
      (
        num(
          a.get(group),
          0
        ) *
        wA
      ) +
      (
        num(
          b.get(group),
          0
        ) *
        wB
      )
    );
  }

  return {
    scoreMap: out,

    weights: {
      baseline:
        wBase,
      signalA:
        wA,
      signalB:
        wB,
    },
  };
}

function v7SignalFromLayers({
  additionalLayers,
  layerKey,
}) {
  const map =
    new Map();

  const reliabilities = [];
  const samples = [];

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

    const probability =
      enabled
        ? Math.max(
            0,
            num(
              result?.probability,
              0
            )
          )
        : 0;

    map.set(
      group,
      probability
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
            (sum, value) =>
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
            (sum, value) =>
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
    enabledGroups,
  };
}

function assertV7Signals() {
  const keys =
    safeArray(
      TOP3_V7_ADDITIONAL_LAYER_KEYS
    );

  for (
    const signal
    of REQUIRED_V7_SIGNALS
  ) {
    if (
      !keys.includes(signal)
    ) {
      throw new Error(
        `PT_RIO_CALIBRATED_V7_SIGNAL_MISSING=${signal}`
      );
    }
  }
}

function resolveTarget(
  input,
  baseCompute
) {
  const forcedY =
    String(
      input?.targetYmdOverride ||
      ""
    ).trim();

  const forcedH =
    normalizeHour(
      input?.targetHourOverride
    );

  if (
    isYmd(forcedY) &&
    forcedH
  ) {
    return {
      targetY:
        forcedY,
      targetH:
        forcedH,
      precomputed:
        null,
    };
  }

  const precomputed =
    baseCompute(
      input
    );

  return {
    targetY:
      String(
        precomputed?.meta?.next?.ymd ||
        ""
      ).trim(),

    targetH:
      normalizeHour(
        precomputed?.meta?.next?.hour
      ),

    precomputed,
  };
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

export function computePtRioMondayCalibratedTop3({
  input = {},
  baseCompute,
  helpers,
}) {
  if (
    typeof baseCompute !==
    "function"
  ) {
    throw new Error(
      "PT_RIO_CALIBRATED_BASE_COMPUTE_MISSING"
    );
  }

  const lotteryKey =
    normalizeLotteryKey(
      input?.lotteryKey
    );

  const resolved =
    resolveTarget(
      input,
      baseCompute
    );

  const {
    targetY,
    targetH,
    precomputed,
  } = resolved;

  const profile =
    PROFILES[targetH] ||
    null;

  const shouldCalibrate =
    lotteryKey === "PT_RIO" &&
    isMonday(targetY) &&
    Boolean(profile);

  if (!shouldCalibrate) {
    return (
      precomputed ||
      baseCompute(
        input
      )
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
      "PT_RIO_CALIBRATED_HELPERS_MISSING"
    );
  }

  assertV7Signals();

  const targetTs =
    ymdHourToTs(
      targetY,
      targetH
    );

  if (
    !Number.isFinite(
      targetTs
    )
  ) {
    throw new Error(
      "PT_RIO_CALIBRATED_INVALID_TARGET"
    );
  }

  const canonicalEntries =
    canonicalizeHistory(
      input?.drawsRange,
      helpers
    )
      .filter(
        (item) =>
          Number.isFinite(
            item?.ts
          ) &&
          item.ts <
            targetTs
      );

  if (
    canonicalEntries.length <
    1
  ) {
    throw new Error(
      "PT_RIO_CALIBRATED_HISTORY_EMPTY"
    );
  }

  const previousEntry =
    canonicalEntries[
      canonicalEntries.length - 1
    ];

  const historyBefore =
    canonicalEntries.map(
      (item) =>
        item.draw
    );

  const drawsToday =
    canonicalEntries
      .filter(
        (item) =>
          item.ymd ===
          targetY
      )
      .map(
        (item) =>
          item.draw
      );

  const base =
    baseCompute({
      ...input,

      lotteryKey:
        "PT_RIO",

      drawsRange:
        historyBefore,

      drawLast:
        previousEntry.draw,

      drawsToday,

      targetYmdOverride:
        targetY,

      targetHourOverride:
        targetH,

      drawsAlreadySorted:
        true,
    });

  const computedY =
    String(
      base?.meta?.next?.ymd ||
      ""
    ).trim();

  const computedH =
    normalizeHour(
      base?.meta?.next?.hour
    );

  if (
    computedY !== targetY ||
    computedH !== targetH
  ) {
    throw new Error(
      `PT_RIO_CALIBRATED_TARGET_DIVERGED=${computedY}|${computedH}`
    );
  }

  const explain =
    base?.meta?.explain ||
    {};

  const passive =
    explain?.passiveInstrumentation ||
    null;

  const rankingBefore =
    safeArray(
      explain
        ?.rankingAudit
        ?.rankingBeforeScore
    );

  if (
    !passive ||
    rankingBefore.length !== 25
  ) {
    throw new Error(
      "PT_RIO_CALIBRATED_V3_INSTRUMENTATION_MISSING"
    );
  }

  const sourceOrder =
    buildSourceOrder({
      passive,
      rankingBefore,
    });

  const tieMap =
    tieMapFromSource(
      sourceOrder
    );

  const baselineMap =
    profileScoreMap(
      sourceOrder,
      profile.baselineLayers
    );

  const additionalLayers =
    buildTop3V7AdditionalLayers({
      history:
        historyBefore,

      targetYmd:
        targetY,

      targetHour:
        targetH,
    });

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
    blendBaselineWithTwoSignals({
      baselineMap,

      signalA:
        signalA.map,

      reliabilityA:
        signalA.reliability,

      signalB:
        signalB.map,

      reliabilityB:
        signalB.reliability,
    });

  const requestedTopN =
    Number(
      input?.topN || 3
    );

  const topLimit =
    Math.min(
      25,
      Math.max(
        1,
        Number.isFinite(
          requestedTopN
        )
          ? Math.trunc(
              requestedTopN
            )
          : 3
      )
    );

  const selectedGroups =
    rankScoreMap(
      blended.scoreMap,
      tieMap
    )
      .slice(
        0,
        topLimit
      );

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
            )
        )
    );

  const periodFrom =
    String(
      helpers.pickDrawYMD(
        historyBefore[0]
      ) || ""
    );

  const periodTo =
    String(
      helpers.pickDrawYMD(
        historyBefore[
          historyBefore.length - 1
        ]
      ) || ""
    );

  const profileMeta = {
    version:
      PT_RIO_MONDAY_CALIBRATED_VERSION,

    model:
      profile.model,

    baselineLayers:
      [
        ...profile.baselineLayers,
      ],

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

    gateEvidence:
      "GATE_B_GATE_C_GATE_D_ACCEPTED",
  };

  const top =
    selectedGroups.map(
      (group, index) => {
        const existing =
          baseTopByGroup.get(
            group
          ) ||
          {};

        const calibratedScore =
          num(
            blended
              .scoreMap
              .get(group),
            0
          );

        const baselineScore =
          num(
            normalizeSumMap(
              baselineMap
            ).get(group),
            0
          );

        const signalAScore =
          num(
            normalizeSumMap(
              signalA.map
            ).get(group),
            0
          );

        const signalBScore =
          num(
            normalizeSumMap(
              signalB.map
            ).get(group),
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

          probCond:
            Number(
              existing?.probCond ||
              0
            ),

          probBase:
            Number(
              existing?.probBase ||
              0
            ),

          lateBonus:
            Number(
              existing?.lateBonus ||
              0
            ),

          freq:
            Number(
              existing?.freq ||
              0
            ),

          freqCond:
            Number(
              existing?.freqCond ||
              0
            ),

          freqBase:
            Number(
              existing?.freqBase ||
              0
            ),

          freqZeroWhy:
            String(
              existing?.freqZeroWhy ||
              ""
            ),

          reasons: [
            `Motor: ${PT_RIO_MONDAY_CALIBRATED_VERSION}`,
            `Perfil aprovado: ${profile.model}`,
            `Baseline: ${profile.baselineLayers.join("+")}`,
            `Sinais: ${profile.signalA} + ${profile.signalB}`,
            (
              "Pesos efetivos: " +
              `baseline=${blended.weights.baseline.toFixed(6)} | ` +
              `${profile.signalA}=${blended.weights.signalA.toFixed(6)} | ` +
              `${profile.signalB}=${blended.weights.signalB.toFixed(6)}`
            ),
          ],

          meta: {
            ...(existing?.meta ||
              {}),

            trigger:
              base?.meta?.trigger ||
              existing?.meta?.trigger ||
              null,

            next:
              base?.meta?.next ||
              existing?.meta?.next ||
              {
                ymd:
                  targetY,
                hour:
                  targetH,
              },

            samples:
              historyBefore.length,

            period:
              existing?.meta?.period ||
              {
                from:
                  periodFrom,
                to:
                  periodTo,
              },

            scenario:
              profile.model,

            explain: {
              ...(
                existing
                  ?.meta
                  ?.explain ||
                {}
              ),

              engine:
                PT_RIO_MONDAY_CALIBRATED_VERSION,

              baselineEngine:
                "V3_STATISTICAL",

              productionProfile:
                profile.model,

              calibratedProfile: {
                ...profileMeta,

                group,

                calibratedScore,
                baselineScore,
                signalAScore,
                signalBScore,
              },
            },
          },
        };
      }
    );

  return {
    ...base,

    top,
    ranking:
      top,

    meta: {
      ...(base?.meta ||
        {}),

      scenario:
        profile.model,

      explain: {
        ...(
          base
            ?.meta
            ?.explain ||
          {}
        ),

        engine:
          PT_RIO_MONDAY_CALIBRATED_VERSION,

        baselineEngine:
          "V3_STATISTICAL",

        productionProfile:
          profile.model,

        calibratedProfile:
          profileMeta,
      },
    },
  };
}


/*
 * =====================================================================
 * PT_RIO - TERCA-FEIRA - V7 FINALISTAS CONGELADOS
 *
 * TER 11:00 -> V7_PAIR_50_25_25::sequenceOrder2+stoneFlip
 * TER 21:00 -> V7_PAIR_50_25_25::weekday+dailyFlow
 * =====================================================================
 */

const PT_RIO_TUESDAY_V7_PROFILES =
  Object.freeze({
    "11:00": Object.freeze({
      model:
        "V7_PAIR_50_25_25::sequenceOrder2+stoneFlip",

      baselineLayers:
        Object.freeze([
          "hour",
          "recent",
        ]),

      signalA:
        "sequenceOrder2",

      signalB:
        "stoneFlip",
    }),

    "21:00": Object.freeze({
      model:
        "V7_PAIR_50_25_25::weekday+dailyFlow",

      baselineLayers:
        Object.freeze([
          "dowHour",
        ]),

      signalA:
        "weekday",

      signalB:
        "dailyFlow",
    }),
  });

function computePtRioTuesdayV7CalibratedTop3({
  input = {},
  baseCompute,
  helpers,
}) {
  if (
    typeof baseCompute !==
    "function"
  ) {
    throw new Error(
      "PT_RIO_CALIBRATED_BASE_COMPUTE_MISSING"
    );
  }

  const lotteryKey =
    normalizeLotteryKey(
      input?.lotteryKey
    );

  const resolved =
    resolveTarget(
      input,
      baseCompute
    );

  const {
    targetY,
    targetH,
    precomputed,
  } = resolved;

  const profile =
    PT_RIO_TUESDAY_V7_PROFILES[targetH] ||
    null;

  const shouldCalibrate =
    lotteryKey === "PT_RIO" &&
    ptRioContextWeekday(targetY) === 2 &&
    Boolean(profile);

  if (!shouldCalibrate) {
    return (
      precomputed ||
      baseCompute(
        input
      )
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
      "PT_RIO_CALIBRATED_HELPERS_MISSING"
    );
  }

  assertV7Signals();

  const targetTs =
    ymdHourToTs(
      targetY,
      targetH
    );

  if (
    !Number.isFinite(
      targetTs
    )
  ) {
    throw new Error(
      "PT_RIO_CALIBRATED_INVALID_TARGET"
    );
  }

  const canonicalEntries =
    canonicalizeHistory(
      input?.drawsRange,
      helpers
    )
      .filter(
        (item) =>
          Number.isFinite(
            item?.ts
          ) &&
          item.ts <
            targetTs
      );

  if (
    canonicalEntries.length <
    1
  ) {
    throw new Error(
      "PT_RIO_CALIBRATED_HISTORY_EMPTY"
    );
  }

  const previousEntry =
    canonicalEntries[
      canonicalEntries.length - 1
    ];

  const historyBefore =
    canonicalEntries.map(
      (item) =>
        item.draw
    );

  const drawsToday =
    canonicalEntries
      .filter(
        (item) =>
          item.ymd ===
          targetY
      )
      .map(
        (item) =>
          item.draw
      );

  const base =
    baseCompute({
      ...input,

      lotteryKey:
        "PT_RIO",

      drawsRange:
        historyBefore,

      drawLast:
        previousEntry.draw,

      drawsToday,

      targetYmdOverride:
        targetY,

      targetHourOverride:
        targetH,

      drawsAlreadySorted:
        true,
    });

  const computedY =
    String(
      base?.meta?.next?.ymd ||
      ""
    ).trim();

  const computedH =
    normalizeHour(
      base?.meta?.next?.hour
    );

  if (
    computedY !== targetY ||
    computedH !== targetH
  ) {
    throw new Error(
      `PT_RIO_CALIBRATED_TARGET_DIVERGED=${computedY}|${computedH}`
    );
  }

  const explain =
    base?.meta?.explain ||
    {};

  const passive =
    explain?.passiveInstrumentation ||
    null;

  const rankingBefore =
    safeArray(
      explain
        ?.rankingAudit
        ?.rankingBeforeScore
    );

  if (
    !passive ||
    rankingBefore.length !== 25
  ) {
    throw new Error(
      "PT_RIO_CALIBRATED_V3_INSTRUMENTATION_MISSING"
    );
  }

  const sourceOrder =
    buildSourceOrder({
      passive,
      rankingBefore,
    });

  const tieMap =
    tieMapFromSource(
      sourceOrder
    );

  const baselineMap =
    profileScoreMap(
      sourceOrder,
      profile.baselineLayers
    );

  const additionalLayers =
    buildTop3V7AdditionalLayers({
      history:
        historyBefore,

      targetYmd:
        targetY,

      targetHour:
        targetH,
    });

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
    blendBaselineWithTwoSignals({
      baselineMap,

      signalA:
        signalA.map,

      reliabilityA:
        signalA.reliability,

      signalB:
        signalB.map,

      reliabilityB:
        signalB.reliability,
    });

  const requestedTopN =
    Number(
      input?.topN || 3
    );

  const topLimit =
    Math.min(
      25,
      Math.max(
        1,
        Number.isFinite(
          requestedTopN
        )
          ? Math.trunc(
              requestedTopN
            )
          : 3
      )
    );

  const selectedGroups =
    rankScoreMap(
      blended.scoreMap,
      tieMap
    )
      .slice(
        0,
        topLimit
      );

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
            )
        )
    );

  const periodFrom =
    String(
      helpers.pickDrawYMD(
        historyBefore[0]
      ) || ""
    );

  const periodTo =
    String(
      helpers.pickDrawYMD(
        historyBefore[
          historyBefore.length - 1
        ]
      ) || ""
    );

  const profileMeta = {
    version:
      PT_RIO_CONTEXT_CALIBRATION_VERSION,

    model:
      profile.model,

    baselineLayers:
      [
        ...profile.baselineLayers,
      ],

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

    gateEvidence:
      "GATE_B_GATE_C_GATE_D_ACCEPTED",
  };

  const top =
    selectedGroups.map(
      (group, index) => {
        const existing =
          baseTopByGroup.get(
            group
          ) ||
          {};

        const calibratedScore =
          num(
            blended
              .scoreMap
              .get(group),
            0
          );

        const baselineScore =
          num(
            normalizeSumMap(
              baselineMap
            ).get(group),
            0
          );

        const signalAScore =
          num(
            normalizeSumMap(
              signalA.map
            ).get(group),
            0
          );

        const signalBScore =
          num(
            normalizeSumMap(
              signalB.map
            ).get(group),
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

          probCond:
            Number(
              existing?.probCond ||
              0
            ),

          probBase:
            Number(
              existing?.probBase ||
              0
            ),

          lateBonus:
            Number(
              existing?.lateBonus ||
              0
            ),

          freq:
            Number(
              existing?.freq ||
              0
            ),

          freqCond:
            Number(
              existing?.freqCond ||
              0
            ),

          freqBase:
            Number(
              existing?.freqBase ||
              0
            ),

          freqZeroWhy:
            String(
              existing?.freqZeroWhy ||
              ""
            ),

          reasons: [
            `Motor: ${PT_RIO_CONTEXT_CALIBRATION_VERSION}`,
            `Perfil aprovado: ${profile.model}`,
            `Baseline: ${profile.baselineLayers.join("+")}`,
            `Sinais: ${profile.signalA} + ${profile.signalB}`,
            (
              "Pesos efetivos: " +
              `baseline=${blended.weights.baseline.toFixed(6)} | ` +
              `${profile.signalA}=${blended.weights.signalA.toFixed(6)} | ` +
              `${profile.signalB}=${blended.weights.signalB.toFixed(6)}`
            ),
          ],

          meta: {
            ...(existing?.meta ||
              {}),

            trigger:
              base?.meta?.trigger ||
              existing?.meta?.trigger ||
              null,

            next:
              base?.meta?.next ||
              existing?.meta?.next ||
              {
                ymd:
                  targetY,
                hour:
                  targetH,
              },

            samples:
              historyBefore.length,

            period:
              existing?.meta?.period ||
              {
                from:
                  periodFrom,
                to:
                  periodTo,
              },

            scenario:
              profile.model,

            explain: {
              ...(
                existing
                  ?.meta
                  ?.explain ||
                {}
              ),

              engine:
                PT_RIO_CONTEXT_CALIBRATION_VERSION,

              baselineEngine:
                "V3_STATISTICAL",

              productionProfile:
                profile.model,

              calibratedProfile: {
                ...profileMeta,

                group,

                calibratedScore,
                baselineScore,
                signalAScore,
                signalBScore,
              },
            },
          },
        };
      }
    );

  return {
    ...base,

    top,
    ranking:
      top,

    meta: {
      ...(base?.meta ||
        {}),

      scenario:
        profile.model,

      explain: {
        ...(
          base
            ?.meta
            ?.explain ||
          {}
        ),

        engine:
          PT_RIO_CONTEXT_CALIBRATION_VERSION,

        baselineEngine:
          "V3_STATISTICAL",

        productionProfile:
          profile.model,

        calibratedProfile:
          profileMeta,
      },
    },
  };
}


/*
 * =====================================================================
 * PT_RIO_SIMPLE_CONTEXT_PROFILES_V1
 *
 * Decisões finais congeladas:
 *
 * DOM 14:00 -> BASELINE_DOWHOUR_TRANSITION
 * DOM 16:00 -> REFERENCE_TRANSITION_RECENT
 * SEG 09:00 -> REFERENCE_HOUR_TRANSITION_RECENT
 * SEG 11:00 -> BASELINE_HOUR_RECENT
 *
 * SEG 14:00 e SEG 16:00 continuam delegados ao adaptador V7 já
 * validado acima.
 * =====================================================================
 */

export const PT_RIO_CONTEXT_CALIBRATION_VERSION =
  "PT_RIO_SUNDAY_MONDAY_TUESDAY_CONTEXT_V3";

const PT_RIO_SIMPLE_CONTEXT_PROFILES =
  Object.freeze({
    "0|14:00": Object.freeze({
      model:
        "BASELINE_DOWHOUR_TRANSITION",

      layers:
        Object.freeze([
          "dowHour",
          "transition",
        ]),
    }),

    "0|16:00": Object.freeze({
      model:
        "REFERENCE_TRANSITION_RECENT",

      layers:
        Object.freeze([
          "transition",
          "recent",
        ]),
    }),

    "1|09:00": Object.freeze({
      model:
        "REFERENCE_HOUR_TRANSITION_RECENT",

      layers:
        Object.freeze([
          "hour",
          "transition",
          "recent",
        ]),
    }),

    "1|11:00": Object.freeze({
      model:
        "BASELINE_HOUR_RECENT",

      layers:
        Object.freeze([
          "hour",
          "recent",
        ]),
    }),

    "2|09:00": Object.freeze({
      model:
        "BASELINE_HOUR",

      layers:
        Object.freeze([
          "hour",
        ]),
    }),

    "2|14:00": Object.freeze({
      model:
        "REFERENCE_HOUR_DOWHOUR_DAYMONTH_TRANSITION",

      layers:
        Object.freeze([
          "hour",
          "dowHour",
          "dayMonth",
          "transition",
        ]),
    }),

    "2|16:00": Object.freeze({
      model:
        "BASELINE_TRANSITION_RECENT",

      layers:
        Object.freeze([
          "transition",
          "recent",
        ]),
    }),
  });

function ptRioContextWeekday(
  ymd
) {
  if (!isYmd(ymd)) {
    return -1;
  }

  const [Y, M, D] =
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

function computePtRioSimpleContextProfile({
  input,
  baseCompute,
  helpers,
  targetY,
  targetH,
  profile,
}) {
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
      "PT_RIO_SIMPLE_CONTEXT_HELPERS_MISSING"
    );
  }

  const targetTs =
    ymdHourToTs(
      targetY,
      targetH
    );

  if (!Number.isFinite(targetTs)) {
    throw new Error(
      "PT_RIO_SIMPLE_CONTEXT_INVALID_TARGET"
    );
  }

  const canonicalEntries =
    canonicalizeHistory(
      input?.drawsRange,
      helpers
    )
      .filter(
        (item) =>
          Number.isFinite(
            item?.ts
          ) &&
          item.ts <
            targetTs
      );

  if (
    canonicalEntries.length <
    1
  ) {
    throw new Error(
      "PT_RIO_SIMPLE_CONTEXT_HISTORY_EMPTY"
    );
  }

  const previousEntry =
    canonicalEntries[
      canonicalEntries.length - 1
    ];

  const historyBefore =
    canonicalEntries.map(
      (item) =>
        item.draw
    );

  const drawsToday =
    canonicalEntries
      .filter(
        (item) =>
          item.ymd ===
          targetY
      )
      .map(
        (item) =>
          item.draw
      );

  const base =
    baseCompute({
      ...input,

      lotteryKey:
        "PT_RIO",

      drawsRange:
        historyBefore,

      drawLast:
        previousEntry.draw,

      drawsToday,

      targetYmdOverride:
        targetY,

      targetHourOverride:
        targetH,

      drawsAlreadySorted:
        true,
    });

  const computedY =
    String(
      base?.meta?.next?.ymd ||
      ""
    ).trim();

  const computedH =
    normalizeHour(
      base?.meta?.next?.hour
    );

  if (
    computedY !== targetY ||
    computedH !== targetH
  ) {
    throw new Error(
      `PT_RIO_SIMPLE_CONTEXT_TARGET_DIVERGED=${computedY}|${computedH}`
    );
  }

  const explain =
    base?.meta?.explain ||
    {};

  const passive =
    explain?.passiveInstrumentation ||
    null;

  const rankingBefore =
    safeArray(
      explain
        ?.rankingAudit
        ?.rankingBeforeScore
    );

  if (
    !passive ||
    rankingBefore.length !== 25
  ) {
    throw new Error(
      "PT_RIO_SIMPLE_CONTEXT_V3_INSTRUMENTATION_MISSING"
    );
  }

  const sourceOrder =
    buildSourceOrder({
      passive,
      rankingBefore,
    });

  const tieMap =
    tieMapFromSource(
      sourceOrder
    );

  const scoreMap =
    profileScoreMap(
      sourceOrder,
      profile.layers
    );

  const requestedTopN =
    Number(
      input?.topN || 3
    );

  const topLimit =
    Math.min(
      25,
      Math.max(
        1,
        Number.isFinite(
          requestedTopN
        )
          ? Math.trunc(
              requestedTopN
            )
          : 3
      )
    );

  const selectedGroups =
    rankScoreMap(
      scoreMap,
      tieMap
    )
      .slice(
        0,
        topLimit
      );

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
            )
        )
    );

  const periodFrom =
    String(
      helpers.pickDrawYMD(
        historyBefore[0]
      ) || ""
    );

  const periodTo =
    String(
      helpers.pickDrawYMD(
        historyBefore[
          historyBefore.length - 1
        ]
      ) || ""
    );

  const profileMeta = {
    version:
      PT_RIO_CONTEXT_CALIBRATION_VERSION,

    model:
      profile.model,

    mode:
      "FIXED_V3_LAYER_PROFILE",

    layers:
      [...profile.layers],

    gateEvidence:
      "GATE_B_GATE_C_GATE_D_FINAL_DECISION",
  };

  const top =
    selectedGroups.map(
      (group, index) => {
        const existing =
          baseTopByGroup.get(
            group
          ) ||
          {};

        const calibratedScore =
          num(
            scoreMap.get(group),
            0
          );

        return {
          ...existing,

          rank:
            index + 1,

          title:
            buildTitle(index),

          grupo:
            group,

          scoreProb:
            calibratedScore,

          rawScoreProb:
            calibratedScore,

          score:
            calibratedScore *
            1000,

          probCond:
            Number(
              existing?.probCond ||
              0
            ),

          probBase:
            Number(
              existing?.probBase ||
              0
            ),

          lateBonus:
            Number(
              existing?.lateBonus ||
              0
            ),

          freq:
            Number(
              existing?.freq ||
              0
            ),

          freqCond:
            Number(
              existing?.freqCond ||
              0
            ),

          freqBase:
            Number(
              existing?.freqBase ||
              0
            ),

          freqZeroWhy:
            String(
              existing?.freqZeroWhy ||
              ""
            ),

          reasons: [
            `Motor: ${PT_RIO_CONTEXT_CALIBRATION_VERSION}`,
            `Perfil aprovado: ${profile.model}`,
            `Camadas: ${profile.layers.join("+")}`,
          ],

          meta: {
            ...(existing?.meta ||
              {}),

            trigger:
              base?.meta?.trigger ||
              existing?.meta?.trigger ||
              null,

            next:
              base?.meta?.next ||
              existing?.meta?.next ||
              {
                ymd:
                  targetY,
                hour:
                  targetH,
              },

            samples:
              historyBefore.length,

            period:
              existing?.meta?.period ||
              {
                from:
                  periodFrom,
                to:
                  periodTo,
              },

            scenario:
              profile.model,

            explain: {
              ...(
                existing
                  ?.meta
                  ?.explain ||
                {}
              ),

              engine:
                PT_RIO_CONTEXT_CALIBRATION_VERSION,

              baselineEngine:
                "V3_STATISTICAL",

              productionProfile:
                profile.model,

              calibratedProfile: {
                ...profileMeta,

                group,
                calibratedScore,
              },
            },
          },
        };
      }
    );

  return {
    ...base,

    top,

    ranking:
      top,

    meta: {
      ...(base?.meta ||
        {}),

      scenario:
        profile.model,

      explain: {
        ...(
          base
            ?.meta
            ?.explain ||
          {}
        ),

        engine:
          PT_RIO_CONTEXT_CALIBRATION_VERSION,

        baselineEngine:
          "V3_STATISTICAL",

        productionProfile:
          profile.model,

        calibratedProfile:
          profileMeta,
      },
    },
  };
}


function computePtRioTuesdayV2StructuralFirst({
  input,
  baseCompute,
  v2Compute,
  helpers,
  targetY,
  targetH,
}) {
  if (
    typeof baseCompute !== "function" ||
    typeof v2Compute !== "function"
  ) {
    throw new Error(
      "PT_RIO_TUESDAY_V2_COMPUTE_MISSING"
    );
  }

  if (
    !helpers ||
    typeof helpers.pickDrawYMD !== "function" ||
    typeof helpers.pickDrawHour !== "function" ||
    typeof helpers.guessPrizePos !== "function" ||
    typeof helpers.guessPrizeGrupo !== "function"
  ) {
    throw new Error(
      "PT_RIO_TUESDAY_V2_HELPERS_MISSING"
    );
  }

  const targetTs =
    ymdHourToTs(
      targetY,
      targetH
    );

  if (!Number.isFinite(targetTs)) {
    throw new Error(
      "PT_RIO_TUESDAY_V2_INVALID_TARGET"
    );
  }

  const canonicalEntries =
    canonicalizeHistory(
      input?.drawsRange,
      helpers
    )
      .filter(
        (item) =>
          Number.isFinite(
            item?.ts
          ) &&
          item.ts < targetTs
      );

  if (
    canonicalEntries.length < 1
  ) {
    throw new Error(
      "PT_RIO_TUESDAY_V2_HISTORY_EMPTY"
    );
  }

  const previousEntry =
    canonicalEntries[
      canonicalEntries.length - 1
    ];

  const historyBefore =
    canonicalEntries.map(
      (item) =>
        item.draw
    );

  const drawsToday =
    canonicalEntries
      .filter(
        (item) =>
          item.ymd === targetY
      )
      .map(
        (item) =>
          item.draw
      );

  const base =
    baseCompute({
      ...input,

      lotteryKey:
        "PT_RIO",

      drawsRange:
        historyBefore,

      drawLast:
        previousEntry.draw,

      drawsToday,

      targetYmdOverride:
        targetY,

      targetHourOverride:
        targetH,

      drawsAlreadySorted:
        true,
    });

  const computedY =
    String(
      base?.meta?.next?.ymd ||
      ""
    ).trim();

  const computedH =
    normalizeHour(
      base?.meta?.next?.hour
    );

  if (
    computedY !== targetY ||
    computedH !== targetH
  ) {
    throw new Error(
      "PT_RIO_TUESDAY_V2_BASE_TARGET_DIVERGED=" +
      computedY +
      "|" +
      computedH
    );
  }

  const explain =
    base?.meta?.explain ||
    {};

  const passive =
    explain?.passiveInstrumentation ||
    null;

  const rankingBefore =
    safeArray(
      explain
        ?.rankingAudit
        ?.rankingBeforeScore
    );

  if (
    !passive ||
    rankingBefore.length !== 25
  ) {
    throw new Error(
      "PT_RIO_TUESDAY_V2_V3_INSTRUMENTATION_MISSING"
    );
  }

  const sourceOrder =
    buildSourceOrder({
      passive,
      rankingBefore,
    });

  const tieMap =
    tieMapFromSource(
      sourceOrder
    );

  const baselineMap =
    profileScoreMap(
      sourceOrder,
      [
        "recent",
      ]
    );

  const baselinePicks =
    rankScoreMap(
      baselineMap,
      tieMap
    ).slice(
      0,
      Math.max(
        1,
        Number(
          input?.topN ||
          3
        )
      )
    );

  const PT_RIO_SCHEDULE_NORMAL =
    Array.isArray(
      input?.PT_RIO_SCHEDULE_NORMAL
    )
      ? input.PT_RIO_SCHEDULE_NORMAL
      : [
          "09:00",
          "11:00",
          "14:00",
          "16:00",
          "18:00",
          "21:00",
        ];

  const PT_RIO_SCHEDULE_WED_SAT =
    Array.isArray(
      input?.PT_RIO_SCHEDULE_WED_SAT
    )
      ? input.PT_RIO_SCHEDULE_WED_SAT
      : [
          "09:00",
          "11:00",
          "14:00",
          "16:00",
          "18:00",
          "21:00",
        ];

  const FEDERAL_SCHEDULE =
    Array.isArray(
      input?.FEDERAL_SCHEDULE
    )
      ? input.FEDERAL_SCHEDULE
      : [
          "20:00",
        ];

  if (
    !Array.isArray(
      PT_RIO_SCHEDULE_NORMAL
    ) ||
    !Array.isArray(
      PT_RIO_SCHEDULE_WED_SAT
    ) ||
    !Array.isArray(
      FEDERAL_SCHEDULE
    )
  ) {
    throw new Error(
      "PT_RIO_TUESDAY_V2_SCHEDULES_MISSING"
    );
  }

  const v2 =
    v2Compute({
      lotteryKey:
        "PT_RIO",

      drawsRange:
        historyBefore,

      drawLast:
        previousEntry.draw,

      drawsToday,

      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,

      topN:
        25,

      targetYmdOverride:
        targetY,

      targetHourOverride:
        targetH,
    });

  const v2Top =
    safeArray(
      v2?.top
    );

  if (v2Top.length !== 25) {
    throw new Error(
      "PT_RIO_TUESDAY_V2_TOP25_INCOMPLETE=" +
      v2Top.length
    );
  }

  const structuralFirstMap =
    new Map();

  for (
    let group = 1;
    group <= 25;
    group += 1
  ) {
    structuralFirstMap.set(
      group,
      0
    );
  }

  let parsedCount = 0;

  for (const item of v2Top) {

    const group =
      Number(
        item?.grupo
      );

    if (
      !Number.isFinite(group) ||
      group < 1 ||
      group > 25
    ) {
      continue;
    }

    const reasons =
      safeArray(
        item?.reasons
      )
        .map(
          (reason) =>
            String(
              reason ||
              ""
            )
        );

    const text =
      reasons.join(
        " | "
      );

    const match =
      text.match(
        /estrutural de 1º=([0-9]+(?:.[0-9]+)?)%/i
      );

    if (!match) {
      continue;
    }

    const value =
      Number(
        match[1]
      ) / 100;

    structuralFirstMap.set(
      group,
      Number.isFinite(value)
        ? value
        : 0
    );

    parsedCount += 1;
  }

  if (parsedCount !== 25) {
    throw new Error(
      "PT_RIO_TUESDAY_V2_STRUCTURAL_PARSE_COUNT=" +
      parsedCount
    );
  }

  const structuralNormalized =
    normalizeSumMap(
      structuralFirstMap
    );

  const structuralTotal =
    Array.from(
      structuralNormalized.values()
    )
      .reduce(
        (sum, value) =>
          sum +
          num(
            value,
            0
          ),
        0
      );

  const active =
    structuralTotal > 0;

  const requestedTopN =
    Math.max(
      1,
      Number(
        input?.topN ||
        3
      )
    );

  const selectedGroups =
    active
      ? rankScoreMap(
          structuralNormalized,
          tieMap
        ).slice(
          0,
          requestedTopN
        )
      : baselinePicks;

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
            Number.isFinite(group) &&
            group >= 1 &&
            group <= 25
        )
    );

  const normalizedBaseline =
    normalizeSumMap(
      baselineMap
    );

  const model =
    "V2_STANDALONE::v2StructuralFirst";

  const profileMeta = {
    model,

    family:
      "V2_STANDALONE",

    signal:
      "v2StructuralFirst",

    baselineLayers: [
      "recent",
    ],

    parsedGroups:
      parsedCount,

    active,

    gateEvidence:
      "GATE_B_GATE_C_GATE_D_ACCEPTED",
  };

  const top =
    selectedGroups.map(
      (group, index) => {

        const existing =
          baseTopByGroup.get(
            group
          ) ||
          {};

        const calibratedScore =
          active
            ? num(
                structuralNormalized.get(
                  group
                ),
                0
              )
            : num(
                normalizedBaseline.get(
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
            ...safeArray(
              existing?.reasons
            ),

            "Motor: " +
              PT_RIO_CONTEXT_CALIBRATION_VERSION,

            "Perfil aprovado: " +
              model,

            "Sinal: v2StructuralFirst",
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
                PT_RIO_CONTEXT_CALIBRATION_VERSION,

              baselineEngine:
                "V3_STATISTICAL",

              productionProfile:
                model,

              calibratedProfile:
                profileMeta,
            },
          },
        };
      }
    );

  return {
    ...base,

    top,

    ranking:
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
          PT_RIO_CONTEXT_CALIBRATION_VERSION,

        baselineEngine:
          "V3_STATISTICAL",

        productionProfile:
          model,

        calibratedProfile:
          profileMeta,
      },
    },
  };
}

export function computePtRioCalibratedTop3({
  input = {},
  baseCompute,
  v2Compute,
  helpers,
}) {
  const lotteryKey =
    normalizeLotteryKey(
      input?.lotteryKey
    );

  const resolved =
    resolveTarget(
      input,
      baseCompute
    );

  const targetY =
    String(
      resolved?.targetY ||
      ""
    ).trim();

  const targetH =
    normalizeHour(
      resolved?.targetH
    );

  const weekday =
    ptRioContextWeekday(
      targetY
    );

  if (
    lotteryKey === "PT_RIO" &&
    weekday === 2 &&
    targetH === "18:00"
  ) {
    return computePtRioTuesdayV2StructuralFirst({
      input,
      baseCompute,
      v2Compute,
      helpers,
      targetY,
      targetH,
    });
  }

  const simpleProfile =
    PT_RIO_SIMPLE_CONTEXT_PROFILES[
      String(weekday) +
      "|" +
      targetH
    ] ||
    null;

  if (
    lotteryKey === "PT_RIO" &&
    simpleProfile
  ) {
    return computePtRioSimpleContextProfile({
      input,
      baseCompute,
      helpers,
      targetY,
      targetH,
      profile:
        simpleProfile,
    });
  }

  if (
    lotteryKey === "PT_RIO" &&
    weekday === 2 &&
    (
      targetH === "11:00" ||
      targetH === "21:00"
    )
  ) {
    return computePtRioTuesdayV7CalibratedTop3({
      input,
      baseCompute,
      helpers,
    });
  }

  return computePtRioMondayCalibratedTop3({
    input,
    baseCompute,
    helpers,
  });
}
