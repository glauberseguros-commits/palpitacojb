"use strict";

const fs = require("fs");
const path = require("path");

const {
  readFullHistory,
  readMetadata,
} = require("../engine/top3HistoryRepository");

const {
  computeStatisticalTop3V3,
  loadTop3PublicApi,
} = require("../engine/scoreEngineUnified");

const PT_RIO_SCHEDULE_NORMAL = [
  "09:00",
  "11:00",
  "14:00",
  "16:00",
  "18:00",
  "21:00",
];

const PT_RIO_SCHEDULE_WED_SAT = [
  "09:00",
  "11:00",
  "14:00",
  "16:00",
  "18:00",
  "21:00",
];

const FEDERAL_SCHEDULE = [
  "19:00",
  "20:00",
];

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function normalizeLotteryKey(value) {
  return String(value || "PT_RIO")
    .trim()
    .toUpperCase() || "PT_RIO";
}

function normalizeHour(value) {
  const raw = String(value || "")
    .trim()
    .replace("h", ":00");

  if (/^\d{1,2}$/.test(raw)) {
    return `${raw.padStart(2, "0")}:00`;
  }

  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [hour, minute] = raw.split(":");

    return `${hour.padStart(2, "0")}:${minute}`;
  }

  return null;
}

function dateHourKey(ymd, hour) {
  return `${ymd}T${normalizeHour(hour) || hour}`;
}

function parseIntegerFlag(
  args,
  name,
  fallback = null
) {
  const prefix = `--${name}=`;

  const match = args.find(
    (value) =>
      String(value).startsWith(prefix)
  );

  if (!match) {
    return fallback;
  }

  const number = Number(
    String(match).slice(prefix.length)
  );

  if (
    !Number.isInteger(number) ||
    number < 1
  ) {
    throw new Error(
      `Parâmetro --${name} inválido.`
    );
  }

  return number;
}

function parseBooleanFlag(
  args,
  name,
  fallback = false
) {
  const exact = `--${name}`;
  const prefix = `--${name}=`;

  const match = args.find(
    (value) => {
      const text = String(value);

      return (
        text === exact ||
        text.startsWith(prefix)
      );
    }
  );

  if (!match) {
    return fallback;
  }

  if (String(match) === exact) {
    return true;
  }

  const raw = String(match)
    .slice(prefix.length)
    .trim()
    .toLowerCase();

  if (
    raw === "1" ||
    raw === "true" ||
    raw === "yes" ||
    raw === "on"
  ) {
    return true;
  }

  if (
    raw === "0" ||
    raw === "false" ||
    raw === "no" ||
    raw === "off"
  ) {
    return false;
  }

  throw new Error(
    `Parâmetro --${name} inválido.`
  );
}


function parseStringFlag(
  args,
  name,
  fallback = null
) {
  const prefix = `--${name}=`;

  const match = args.find(
    (value) =>
      String(value).startsWith(prefix)
  );

  if (!match) {
    return fallback;
  }

  const value = String(match)
    .slice(prefix.length)
    .trim();

  return value || fallback;
}

function parseCliArgs(argv = []) {
  const lotteryKey = normalizeLotteryKey(
    argv[0] || "PT_RIO"
  );

  const flags = argv.slice(1);

  return {
    lotteryKey,
    limit: parseIntegerFlag(
      flags,
      "limit",
      null
    ),
    minHistory: parseIntegerFlag(
      flags,
      "min-history",
      100
    ),
    from: parseStringFlag(
      flags,
      "from",
      null
    ),
    to: parseStringFlag(
      flags,
      "to",
      null
    ),
    outputDir: parseStringFlag(
      flags,
      "output-dir",
      "tmp"
    ),
    telemetry: parseBooleanFlag(
      flags,
      "telemetry",
      false
    ),
  };
}

function sortDraws(draws = [], publicApi) {
  return [...safeArray(draws)]
    .filter(Boolean)
    .sort((a, b) => {
      const aYmd =
        publicApi.pickDrawYMD(a) || "";

      const bYmd =
        publicApi.pickDrawYMD(b) || "";

      const aHour =
        publicApi.pickDrawHour(a) || "";

      const bHour =
        publicApi.pickDrawHour(b) || "";

      const aId = String(
        a.drawId || a.id || ""
      );

      const bId = String(
        b.drawId || b.id || ""
      );

      return dateHourKey(
        aYmd,
        aHour
      ).localeCompare(
        dateHourKey(
          bYmd,
          bHour
        )
      ) || aId.localeCompare(bId);
    });
}

function getFirstPrizeGroup(
  draw,
  publicApi
) {
  const value =
    publicApi.pickPrize1GrupoFromDraw(
      draw
    );

  const group = Number(value);

  if (
    !Number.isFinite(group) ||
    group < 1 ||
    group > 25
  ) {
    return null;
  }

  return group;
}

function fallbackPrizePosition(prize) {
  const candidates = [
    prize?.position,
    prize?.posicao,
    prize?.pos,
    prize?.colocacao,
  ];

  for (const value of candidates) {
    const position = Number(value);

    if (Number.isFinite(position)) {
      return position;
    }
  }

  return null;
}

function fallbackPrizeGroup(prize) {
  const directCandidates = [
    prize?.grupo2,
    prize?.group2,
    prize?.grupo,
    prize?.group,
    prize?.animal_grupo,
    prize?.grupo_animal,
    prize?.grupoAnimal,
    prize?.g,
  ];

  for (const value of directCandidates) {
    const group = Number(value);

    if (
      Number.isFinite(group) &&
      group >= 1 &&
      group <= 25
    ) {
      return group;
    }
  }

  const milharCandidates = [
    prize?.milhar,
    prize?.milhar4,
    prize?.numero,
    prize?.number,
    prize?.value,
    prize?.result,
    prize?.resultado,
    prize?.premio,
  ];

  for (const value of milharCandidates) {
    const digits = String(value ?? "")
      .replace(/\D+/g, "");

    if (!digits) {
      continue;
    }

    const dezenaRaw = Number(
      digits.padStart(2, "0").slice(-2)
    );

    if (
      !Number.isFinite(dezenaRaw) ||
      dezenaRaw < 0 ||
      dezenaRaw > 99
    ) {
      continue;
    }

    if (dezenaRaw === 0) {
      return 25;
    }

    const group = Math.ceil(
      dezenaRaw / 4
    );

    if (
      group >= 1 &&
      group <= 25
    ) {
      return group;
    }
  }

  return null;
}

function getPrizeGroupsByPosition(
  draw,
  publicApi,
  maxPosition = 3
) {
  const limit = Math.max(
    1,
    Number(maxPosition || 3)
  );

  const prizes = safeArray(
    draw?.prizes
  );

  const guessPosition =
    typeof publicApi?.guessPrizePos ===
    "function"
      ? publicApi.guessPrizePos
      : fallbackPrizePosition;

  const guessGroup =
    typeof publicApi?.guessPrizeGrupo ===
    "function"
      ? publicApi.guessPrizeGrupo
      : fallbackPrizeGroup;

  const result = Array.from(
    {
      length: limit,
    },
    () => null
  );

  for (const prize of prizes) {
    const position = Number(
      guessPosition(prize)
    );

    if (
      !Number.isFinite(position) ||
      position < 1 ||
      position > limit
    ) {
      continue;
    }

    const group = Number(
      guessGroup(prize)
    );

    if (
      !Number.isFinite(group) ||
      group < 1 ||
      group > 25
    ) {
      continue;
    }

    result[position - 1] = group;
  }

  if (
    !Number.isFinite(
      Number(result[0])
    )
  ) {
    result[0] = getFirstPrizeGroup(
      draw,
      publicApi
    );
  }

  return result;
}

function getPredictionGroups(
  computed
) {
  const candidates =
    safeArray(computed?.top).length
      ? safeArray(computed.top)
      : safeArray(computed?.ranking);

  return candidates
    .map((item) =>
      Number(
        item?.grupo ??
        item?.group
      )
    )
    .filter(
      (group) =>
        Number.isFinite(group) &&
        group >= 1 &&
        group <= 25
    )
    .slice(0, 3);
}

function ensureBucket(
  map,
  key
) {
  if (!map[key]) {
    map[key] = {
      evaluated: 0,

      top1Hits: 0,
      top3Hits: 0,

      prize1Hits: 0,
      prize2Hits: 0,
      prize3Hits: 0,

      top3PrizeHits: 0,

      matchedPrizePositions: 0,
      matchedPredictions: 0,

      errors: 0,
    };
  }

  return map[key];
}

function finalizeBucket(bucket = {}) {
  const evaluated = Number(
    bucket.evaluated || 0
  );

  const top1Hits = Number(
    bucket.top1Hits || 0
  );

  const top3Hits = Number(
    bucket.top3Hits || 0
  );

  const prize1Hits = Number(
    bucket.prize1Hits || 0
  );

  const prize2Hits = Number(
    bucket.prize2Hits || 0
  );

  const prize3Hits = Number(
    bucket.prize3Hits || 0
  );

  const top3PrizeHits = Number(
    bucket.top3PrizeHits || 0
  );

  const matchedPrizePositions = Number(
    bucket.matchedPrizePositions || 0
  );

  const matchedPredictions = Number(
    bucket.matchedPredictions || 0
  );

  const rate = (hits) =>
    evaluated > 0
      ? Number(
          (
            Number(hits || 0) /
            evaluated *
            100
          ).toFixed(4)
        )
      : 0;

  return {
    evaluated,

    top1Hits,
    top3Hits,

    prize1Hits,
    prize2Hits,
    prize3Hits,

    top3PrizeHits,

    matchedPrizePositions,
    matchedPredictions,

    errors: Number(
      bucket.errors || 0
    ),

    top1Rate:
      rate(top1Hits),

    top3Rate:
      rate(top3Hits),

    prize1Rate:
      rate(prize1Hits),

    prize2Rate:
      rate(prize2Hits),

    prize3Rate:
      rate(prize3Hits),

    top3PrizeRate:
      rate(top3PrizeHits),

    averageMatchedPrizePositions:
      evaluated > 0
        ? Number(
            (
              matchedPrizePositions /
              evaluated
            ).toFixed(4)
          )
        : 0,

    averageMatchedPredictions:
      evaluated > 0
        ? Number(
            (
              matchedPredictions /
              evaluated
            ).toFixed(4)
          )
        : 0,
  };
}

function finalizeMap(map = {}) {
  const result = {};

  for (
    const [key, bucket]
    of Object.entries(map)
  ) {
    result[key] = finalizeBucket(
      bucket
    );
  }

  return result;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function buildTextReport(result) {
  const lines = [];

  lines.push(
    "=============================================="
  );

  lines.push(
    "TOP3 OFFICIAL BACKTEST"
  );

  lines.push(
    "=============================================="
  );

  lines.push("");

  lines.push(
    `Loteria.............: ${result.lotteryKey}`
  );

  lines.push(
    `Engine..............: ${result.engine}`
  );

  lines.push(
    `Histórico carregado.: ${result.historyLoaded}`
  );

  lines.push(
    `Casos elegíveis.....: ${result.eligibleCases}`
  );

  lines.push(
    `Casos avaliados.....: ${result.global.evaluated}`
  );

  lines.push(
    `Casos ignorados.....: ${result.skipped}`
  );

  lines.push(
    `Erros...............: ${result.global.errors}`
  );

  lines.push(
    `Período histórico...: ${result.historyPeriod.from} até ${result.historyPeriod.to}`
  );

  lines.push(
    `Período avaliado....: ${result.evaluationPeriod.from || "-"} até ${result.evaluationPeriod.to || "-"}`
  );

  lines.push(
    `TOP1................: ${result.global.top1Hits} (${formatPercent(result.global.top1Rate)})`
  );

  lines.push(
    `TOP3 no 1º prêmio...: ${result.global.top3Hits} (${formatPercent(result.global.top3Rate)})`
  );

  lines.push(
    `Acerto no 1º prêmio.: ${result.global.prize1Hits} (${formatPercent(result.global.prize1Rate)})`
  );

  lines.push(
    `Acerto no 2º prêmio.: ${result.global.prize2Hits} (${formatPercent(result.global.prize2Rate)})`
  );

  lines.push(
    `Acerto no 3º prêmio.: ${result.global.prize3Hits} (${formatPercent(result.global.prize3Rate)})`
  );

  lines.push(
    `Algum acerto 1º-3º..: ${result.global.top3PrizeHits} (${formatPercent(result.global.top3PrizeRate)})`
  );

  lines.push(
    `Posições atingidas..: ${result.global.matchedPrizePositions}`
  );

  lines.push(
    `Média posições/caso.: ${Number(result.global.averageMatchedPrizePositions || 0).toFixed(4)}`
  );

  lines.push(
    `Palpites atingidos..: ${result.global.matchedPredictions}`
  );

  lines.push(
    `Média palpites/caso.: ${Number(result.global.averageMatchedPredictions || 0).toFixed(4)}`
  );

  lines.push(
    `Tempo total.........: ${result.tookMs} ms`
  );

  lines.push("");
  lines.push("POR HORÁRIO");

  for (
    const [hour, bucket]
    of Object.entries(result.byHour)
  ) {
    lines.push(
      `${hour.padEnd(8)} avaliados=${String(bucket.evaluated).padStart(5)} | TOP1=${formatPercent(bucket.top1Rate).padStart(8)} | 1º=${formatPercent(bucket.prize1Rate).padStart(8)} | 2º=${formatPercent(bucket.prize2Rate).padStart(8)} | 3º=${formatPercent(bucket.prize3Rate).padStart(8)} | QUALQUER=${formatPercent(bucket.top3PrizeRate).padStart(8)} | erros=${bucket.errors}`
    );
  }

  lines.push("");
  lines.push("POR DIA DA SEMANA");

  for (
    const [weekday, bucket]
    of Object.entries(result.byWeekday)
  ) {
    lines.push(
      `${weekday.padEnd(3)} avaliados=${String(bucket.evaluated).padStart(5)} | TOP1=${formatPercent(bucket.top1Rate).padStart(8)} | 1º=${formatPercent(bucket.prize1Rate).padStart(8)} | 2º=${formatPercent(bucket.prize2Rate).padStart(8)} | 3º=${formatPercent(bucket.prize3Rate).padStart(8)} | QUALQUER=${formatPercent(bucket.top3PrizeRate).padStart(8)} | erros=${bucket.errors}`
    );
  }

  lines.push("");
  lines.push("POR MÊS");

  for (
    const [month, bucket]
    of Object.entries(result.byMonth)
  ) {
    lines.push(
      `${month} avaliados=${String(bucket.evaluated).padStart(5)} | TOP1=${formatPercent(bucket.top1Rate).padStart(8)} | 1º=${formatPercent(bucket.prize1Rate).padStart(8)} | 2º=${formatPercent(bucket.prize2Rate).padStart(8)} | 3º=${formatPercent(bucket.prize3Rate).padStart(8)} | QUALQUER=${formatPercent(bucket.top3PrizeRate).padStart(8)} | erros=${bucket.errors}`
    );
  }

  return lines.join("\n");
}

async function runOfficialBacktest(
  options = {},
  dependencies = {}
) {
  const startedAt = Date.now();

  const lotteryKey =
    normalizeLotteryKey(
      options.lotteryKey ||
      "PT_RIO"
    );

  const publicApi =
    dependencies.publicApi ||
    loadTop3PublicApi();

  const loadHistory =
    dependencies.readFullHistory ||
    readFullHistory;

  const loadMetadata =
    dependencies.readMetadata ||
    readMetadata;

  const computeTop3 =
    dependencies.computeTop3 ||
    computeStatisticalTop3V3;

  const history = sortDraws(
    await loadHistory(
      lotteryKey,
      dependencies.historyDependencies || {}
    ),
    publicApi
  );

  if (!history.length) {
    throw new Error(
      "Histórico TOP3 vazio."
    );
  }

  const metadataResult =
    await loadMetadata(
      lotteryKey,
      dependencies.historyDependencies || {}
    );

  const metadata =
    metadataResult?.data || null;

  if (
    dependencies.allowIncompleteSnapshot !== true &&
    (
      metadataResult?.exists !== true ||
      metadata?.bootstrapStatus !==
        "complete"
    )
  ) {
    throw new Error(
      "Histórico TOP3 não está marcado como completo."
    );
  }

  const minHistory = Number(
    options.minHistory || 100
  );

  const from =
    options.from || null;

  const to =
    options.to || null;

  const eligibleIndexes = [];

  for (
    let index = minHistory;
    index < history.length;
    index += 1
  ) {
    const draw = history[index];

    const ymd =
      publicApi.pickDrawYMD(draw);

    const hour =
      publicApi.pickDrawHour(draw);

    if (!ymd || !hour) {
      continue;
    }

    if (from && ymd < from) {
      continue;
    }

    if (to && ymd > to) {
      continue;
    }

    if (
      getFirstPrizeGroup(
        draw,
        publicApi
      ) == null
    ) {
      continue;
    }

    eligibleIndexes.push(index);
  }

  const selectedIndexes =
    options.limit
      ? eligibleIndexes.slice(
          0,
          Number(options.limit)
        )
      : eligibleIndexes;

  const globalBucket = {
    evaluated: 0,

    top1Hits: 0,
    top3Hits: 0,

    prize1Hits: 0,
    prize2Hits: 0,
    prize3Hits: 0,

    top3PrizeHits: 0,

    matchedPrizePositions: 0,
    matchedPredictions: 0,

    errors: 0,
  };

  const byHour = {};
  const byWeekday = {};
  const byMonth = {};

  const telemetryCases = [];

  let skipped = 0;
  let evaluationFrom = null;
  let evaluationTo = null;

  for (
    let position = 0;
    position < selectedIndexes.length;
    position += 1
  ) {
    const index =
      selectedIndexes[position];

    const targetDraw =
      history[index];

    const targetYmd =
      publicApi.pickDrawYMD(
        targetDraw
      );

    const targetHour =
      publicApi.pickDrawHour(
        targetDraw
      );

    const actualTop3Groups =
      getPrizeGroupsByPosition(
        targetDraw,
        publicApi,
        3
      );

    const actualGroup =
      Number(
        actualTop3Groups[0]
      );

    const historyBefore =
      history.slice(0, index);

    const drawLast =
      historyBefore[
        historyBefore.length - 1
      ];

    if (
      !targetYmd ||
      !targetHour ||
      actualGroup == null ||
      !drawLast
    ) {
      skipped += 1;
      continue;
    }

    const weekday = String(
      new Date(
        `${targetYmd}T12:00:00Z`
      ).getUTCDay()
    );

    const month =
      targetYmd.slice(0, 7);

    const hourBucket =
      ensureBucket(
        byHour,
        normalizeHour(targetHour) ||
        targetHour
      );

    const weekdayBucket =
      ensureBucket(
        byWeekday,
        weekday
      );

    const monthBucket =
      ensureBucket(
        byMonth,
        month
      );

    try {
      const computed =
        computeTop3({
          lotteryKey,
          drawsRange:
            historyBefore,
          drawLast,
          PT_RIO_SCHEDULE_NORMAL,
          PT_RIO_SCHEDULE_WED_SAT,
          FEDERAL_SCHEDULE,
          topN: 3,
          targetYmdOverride:
            targetYmd,
          targetHourOverride:
            targetHour,
        });

      const predictionGroups =
        getPredictionGroups(
          computed
        );

      if (
        predictionGroups.length < 3
      ) {
        throw new Error(
          "Motor retornou menos de 3 grupos."
        );
      }

      const top1Hit =
        predictionGroups[0] ===
        actualGroup;

      const top3Hit =
        predictionGroups.includes(
          actualGroup
        );

      const prizePositionHits =
        actualTop3Groups.map(
          (group) =>
            Number.isFinite(
              Number(group)
            ) &&
            predictionGroups.includes(
              Number(group)
            )
        );

      const predictionHits =
        predictionGroups.map(
          (group) =>
            actualTop3Groups.some(
              (actual) =>
                Number.isFinite(
                  Number(actual)
                ) &&
                Number(actual) ===
                Number(group)
            )
        );

      const prize1Hit =
        Boolean(
          prizePositionHits[0]
        );

      const prize2Hit =
        Boolean(
          prizePositionHits[1]
        );

      const prize3Hit =
        Boolean(
          prizePositionHits[2]
        );

      const matchedPrizePositions =
        prizePositionHits.filter(
          Boolean
        ).length;

      const matchedPredictions =
        predictionHits.filter(
          Boolean
        ).length;

      const top3PrizeHit =
        matchedPrizePositions > 0;

      if (options.telemetry === true) {
        const computedTop = safeArray(
          computed?.top
        );

        telemetryCases.push({
          caseNumber: position + 1,
          historyIndex: index,
          target: {
            ymd: targetYmd,
            hour:
              normalizeHour(targetHour) ||
              targetHour,
            weekday,
            month,
          },
          history: {
            availableBefore:
              historyBefore.length,
            lastDrawYmd:
              publicApi.pickDrawYMD(
                drawLast
              ) || null,
            lastDrawHour:
              publicApi.pickDrawHour(
                drawLast
              ) || null,
          },
          actual: {
            group: actualGroup,
            top3Groups:
              actualTop3Groups,
          },
          prediction: {
            groups:
              predictionGroups,

            top1Hit,
            top3Hit,

            prize1Hit,
            prize2Hit,
            prize3Hit,

            top3PrizeHit,

            matchedPrizePositions,
            matchedPredictions,

            prizePositionHits,
            predictionHits,
          },
          candidates: computedTop
            .slice(0, 3)
            .map((item, rankIndex) => ({
              rank: rankIndex + 1,
              grupo: Number(
                item?.grupo ??
                item?.group
              ),
              score: Number.isFinite(
                Number(item?.score)
              )
                ? Number(item.score)
                : null,
              scoreProb: Number.isFinite(
                Number(item?.scoreProb)
              )
                ? Number(item.scoreProb)
                : null,
              probability: Number.isFinite(
                Number(item?.probability)
              )
                ? Number(item.probability)
                : null,
              confidence: Number.isFinite(
                Number(item?.confidence)
              )
                ? Number(item.confidence)
                : null,
              frequency: Number.isFinite(
                Number(
                  item?.freq ??
                  item?.frequency
                )
              )
                ? Number(
                    item?.freq ??
                    item?.frequency
                  )
                : null,
              reasons: safeArray(
                item?.reasons
              ),
              signals:
                item?.signals || null,
              evidence:
                item?.evidence || null,
              meta:
                item?.meta || null,
            })),
          engineMeta:
            computed?.meta || null,
        });
      }

      for (const bucket of [
        globalBucket,
        hourBucket,
        weekdayBucket,
        monthBucket,
      ]) {
        bucket.evaluated += 1;

        if (top1Hit) {
          bucket.top1Hits += 1;
        }

        if (top3Hit) {
          bucket.top3Hits += 1;
        }

        if (prize1Hit) {
          bucket.prize1Hits += 1;
        }

        if (prize2Hit) {
          bucket.prize2Hits += 1;
        }

        if (prize3Hit) {
          bucket.prize3Hits += 1;
        }

        if (top3PrizeHit) {
          bucket.top3PrizeHits += 1;
        }

        bucket.matchedPrizePositions +=
          matchedPrizePositions;

        bucket.matchedPredictions +=
          matchedPredictions;
      }

      evaluationFrom =
        evaluationFrom || targetYmd;

      evaluationTo = targetYmd;
    } catch (error) {
      globalBucket.errors += 1;
      hourBucket.errors += 1;
      weekdayBucket.errors += 1;
      monthBucket.errors += 1;

      if (
        dependencies.onCaseError
      ) {
        dependencies.onCaseError({
          index,
          targetYmd,
          targetHour,
          error,
        });
      }
    }

    const done = position + 1;

    if (
      options.progress !== false &&
      (
        done % 25 === 0 ||
        done === selectedIndexes.length
      )
    ) {
      console.log(
        `[BACKTEST] ${done}/${selectedIndexes.length} | avaliados=${globalBucket.evaluated} | erros=${globalBucket.errors}`
      );
    }
  }

  const result = {
    ok: true,
    lotteryKey,
    engine:
      "top3_statistical_v3",
    historySource:
      "snapshot",
    historyLoaded:
      history.length,
    eligibleCases:
      eligibleIndexes.length,
    selectedCases:
      selectedIndexes.length,
    skipped,
    minHistory,
    limit:
      options.limit || null,
    historyPeriod: {
      from:
        publicApi.pickDrawYMD(
          history[0]
        ) || null,
      to:
        publicApi.pickDrawYMD(
          history[
            history.length - 1
          ]
        ) || null,
    },
    evaluationPeriod: {
      from: evaluationFrom,
      to: evaluationTo,
    },
    global:
      finalizeBucket(
        globalBucket
      ),
    byHour:
      finalizeMap(byHour),
    byWeekday:
      finalizeMap(byWeekday),
    byMonth:
      finalizeMap(byMonth),
    telemetry:
      options.telemetry === true
        ? {
            enabled: true,
            schemaVersion: 1,
            cases: telemetryCases,
          }
        : {
            enabled: false,
            schemaVersion: 1,
            cases: [],
          },
    metadata: {
      bootstrapStatus:
        metadata?.bootstrapStatus ||
        null,
      totalStored:
        Number(
          metadata?.totalDraws || 0
        ) || null,
      lastProcessedDrawId:
        metadata?.lastProcessedDrawId ||
        null,
    },
    tookMs:
      Date.now() - startedAt,
  };

  return result;
}

async function main() {
  const options = parseCliArgs(
    process.argv.slice(2)
  );

  console.log("");
  console.log(
    "===================================="
  );
  console.log(
    "TOP3 OFFICIAL BACKTEST"
  );
  console.log(
    "===================================="
  );
  console.log("");
  console.log(
    "Loteria............:",
    options.lotteryKey
  );
  console.log(
    "Limite.............:",
    options.limit || "TODOS"
  );
  console.log(
    "Histórico mínimo...:",
    options.minHistory
  );
  console.log(
    "Período............:",
    `${options.from || "início"} até ${options.to || "fim"}`
  );
  console.log(
    "Telemetria.........:",
    options.telemetry
      ? "ATIVA"
      : "DESATIVADA"
  );
  console.log("");

  const result =
    await runOfficialBacktest(
      options
    );

  const outputDir = path.resolve(
    options.outputDir
  );

  fs.mkdirSync(
    outputDir,
    {
      recursive: true,
    }
  );

  const lotterySuffix =
    String(options.lotteryKey || "PT_RIO")
      .trim()
      .toLowerCase();

  const suffix =
    options.limit
      ? `${lotterySuffix}_limit_${options.limit}`
      : `${lotterySuffix}_full`;

  const jsonPath = path.join(
    outputDir,
    `top3_official_backtest_${suffix}.json`
  );

  const txtPath = path.join(
    outputDir,
    `top3_official_backtest_${suffix}.txt`
  );

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      result,
      null,
      2
    ),
    "utf8"
  );

  fs.writeFileSync(
    txtPath,
    buildTextReport(result),
    "utf8"
  );

  console.log("");
  console.log(
    buildTextReport(result)
  );
  console.log("");
  console.log(
    "JSON:",
    jsonPath
  );
  console.log(
    "TXT :",
    txtPath
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      error?.stack ||
      error?.message ||
      error
    );

    process.exit(1);
  });
}

module.exports = {
  parseBooleanFlag,
  parseCliArgs,
  sortDraws,
  getFirstPrizeGroup,
  getPrizeGroupsByPosition,
  getPredictionGroups,
  finalizeBucket,
  buildTextReport,
  runOfficialBacktest,
};
