"use strict";

const {
  fetchDrawsWithPrizesByRange,
} = require("./drawRepository");

const {
  readFullHistory,
  readMetadata,
} = require("./top3HistoryRepository");

const {
  computeStatisticalTop3V3,
  loadTop3PublicApi,
} = require("./scoreEngineUnified");

const {
  createPredictionRun,
} = require("./predictionService");

const {
  getDb,
} = require("../service/firebaseAdmin");

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
  "21:00",
];

const FEDERAL_SCHEDULE = [
  "20:00",
];

const ANIMALS = {
  "01": "Avestruz",
  "02": "Águia",
  "03": "Burro",
  "04": "Borboleta",
  "05": "Cachorro",
  "06": "Cabra",
  "07": "Carneiro",
  "08": "Camelo",
  "09": "Cobra",
  "10": "Coelho",
  "11": "Cavalo",
  "12": "Elefante",
  "13": "Galo",
  "14": "Gato",
  "15": "Jacaré",
  "16": "Leão",
  "17": "Macaco",
  "18": "Porco",
  "19": "Pavão",
  "20": "Peru",
  "21": "Touro",
  "22": "Tigre",
  "23": "Urso",
  "24": "Veado",
  "25": "Vaca",
};

function normalizeLotteryKey(value) {
  return String(value || "PT_RIO")
    .trim()
    .toUpperCase() || "PT_RIO";
}

function normalizeYmd(value) {
  const text = String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(
      "Data inválida. Utilize o formato YYYY-MM-DD."
    );
  }

  return text;
}

function normalizeHour(value) {
  const text = String(value || "")
    .trim()
    .replace(/[hH]/g, ":");

  const match = text.match(
    /^(\d{1,2})(?::?(\d{2}))?$/
  );

  if (!match) {
    throw new Error(
      "Horário inválido. Utilize HH:MM."
    );
  }

  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error("Horário fora do intervalo válido.");
  }

  return `${String(hour).padStart(2, "0")}:${String(
    minute
  ).padStart(2, "0")}`;
}

function dateHourKey(ymd, hour) {
  return `${ymd}T${normalizeHour(hour)}`;
}

function subtractDaysYmd(ymd, days) {
  const safeDays = Math.max(
    1,
    Math.min(1460, Number(days || 180))
  );

  const date = new Date(`${ymd}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Não foi possível calcular a janela histórica."
    );
  }

  date.setUTCDate(
    date.getUTCDate() - safeDays
  );

  return date.toISOString().slice(0, 10);
}

function normalizeHistorySource(value) {
  const source = String(value || "auto")
    .trim()
    .toLowerCase();

  if (
    source !== "auto" &&
    source !== "snapshot" &&
    source !== "range"
  ) {
    throw new Error(
      "historySource inválido. Utilize auto, snapshot ou range."
    );
  }

  return source;
}

async function loadPredictionHistory({
  lotteryKey,
  date,
  input = {},
  dependencies = {},
} = {}) {
  const requestedSource = normalizeHistorySource(
    input.historySource
  );

  const loadMetadata =
    dependencies.readHistoryMetadata ||
    readMetadata;

  const loadFullHistory =
    dependencies.readFullHistory ||
    readFullHistory;

  const loadRangeHistory =
    dependencies.fetchDraws ||
    fetchDrawsWithPrizesByRange;

  if (
    requestedSource === "auto" ||
    requestedSource === "snapshot"
  ) {
    const metadataResult = await loadMetadata(
      lotteryKey,
      dependencies.historyDependencies || {}
    );

    const metadata =
      metadataResult?.data || null;

    const snapshotReady =
      metadataResult?.exists === true &&
      metadata?.bootstrapStatus === "complete";

    if (snapshotReady) {
      const draws = await loadFullHistory(
        lotteryKey,
        dependencies.historyDependencies || {}
      );

      if (Array.isArray(draws) && draws.length) {
        const expectedTotal = Number(
          metadata?.totalDraws || 0
        );

        if (
          expectedTotal > 0 &&
          draws.length !== expectedTotal
        ) {
          throw new Error(
            "Histórico TOP3 inconsistente: metadata.totalDraws=" +
            `${expectedTotal}, carregados=${draws.length}.`
          );
        }

        return {
          source: "snapshot",
          draws,
          metadata,
          lookbackDays: null,
          maxDraws: null,
          startYmd:
            metadata?.firstYmd || null,
        };
      }

      throw new Error(
        "Metadata do histórico TOP3 está completo, mas nenhum draw foi carregado."
      );
    }

    if (requestedSource === "snapshot") {
      throw new Error(
        "Histórico TOP3 completo ainda não está disponível."
      );
    }
  }

  const lookbackDays = Math.max(
    30,
    Math.min(
      1460,
      Number(input.lookbackDays || 180)
    )
  );

  const maxDraws = Math.max(
    100,
    Math.min(
      5000,
      Number(input.maxDraws || 1200)
    )
  );

  const startYmd = subtractDaysYmd(
    date,
    lookbackDays
  );

  const rawDraws = await loadRangeHistory({
    lottery: lotteryKey,
    startYmd,
    endYmd: date,
    pageSize: Number(input.pageSize || 250),
    maxDraws,
    prizeConcurrency: Number(
      input.prizeConcurrency || 24
    ),
  });

  return {
    source: "range_fallback",
    draws: extractDraws(rawDraws),
    metadata: null,
    lookbackDays,
    maxDraws,
    startYmd,
  };
}

function extractDraws(result) {
  if (Array.isArray(result)) {
    return result;
  }

  const candidates = [
    result?.draws,
    result?.items,
    result?.results,
    result?.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function normalizePublicMilhar(value) {
  const digits = String(value || "")
    .replace(/\D+/g, "");

  if (!digits) {
    return "";
  }

  return digits
    .slice(-4)
    .padStart(4, "0");
}

function publicHourCode(value) {
  return normalizeHour(value)
    .replace(/\D+/g, "")
    .slice(0, 2)
    .padStart(2, "0");
}

function resolveNextTop3Slot({
  lotteryKey,
  ymd,
  hour,
  publicApi,
}) {
  if (
    !publicApi ||
    typeof publicApi.getNextSlotForLottery !== "function"
  ) {
    throw new Error(
      "API pública TOP3 sem getNextSlotForLottery."
    );
  }

  const resolved =
    publicApi.getNextSlotForLottery({
      lotteryKey: normalizeLotteryKey(lotteryKey),
      ymd: normalizeYmd(ymd),
      hourBucket: normalizeHour(hour),
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });

  const rawHour = String(
    resolved?.hour ||
    resolved?.hourBucket ||
    ""
  ).trim();

  const hourMatch =
    rawHour.match(/^(\d{1,2})(?::00|h)?$/i);

  const canonicalHour = hourMatch
    ? `${String(Number(hourMatch[1])).padStart(2, "0")}:00`
    : "";

  return {
    ...resolved,
    ymd: normalizeYmd(resolved?.ymd),
    hour: canonicalHour,
    hourBucket: canonicalHour,
  };
}

function scheduleForPublicProjection(
  lotteryKey,
  date
) {
  if (normalizeLotteryKey(lotteryKey) === "FEDERAL") {
    return [...FEDERAL_SCHEDULE];
  }

  const parsed = new Date(`${date}T12:00:00Z`);
  const dow = parsed.getUTCDay();

  if (dow === 3 || dow === 6) {
    return [...PT_RIO_SCHEDULE_WED_SAT];
  }

  return [...PT_RIO_SCHEDULE_NORMAL];
}

function buildPublicMilharesCols(
  engineOutput,
  expectedCols = 4,
  perCol = 5
) {
  const dezenas = Array.isArray(engineOutput?.dezenas)
    ? engineOutput.dezenas
    : [];

  const slots = Array.isArray(engineOutput?.slots)
    ? engineOutput.slots
    : [];

  const cols = [];

  for (const dezena of dezenas.slice(0, expectedCols)) {
    const items = slots
      .filter(
        (slot) =>
          String(slot?.dezena || "") ===
          String(dezena || "")
      )
      .map(
        (slot) =>
          normalizePublicMilhar(slot?.milhar)
      )
      .filter(
        (milhar) => /^\d{4}$/.test(milhar)
      )
      .slice(0, perCol);

    while (items.length < perCol) {
      items.push("");
    }

    cols.push({
      dezena: String(dezena || ""),
      items,
    });
  }

  while (cols.length < expectedCols) {
    cols.push({
      dezena: "",
      items: Array(perCol).fill(""),
    });
  }

  return cols.slice(0, expectedCols);
}

function buildTop3PublicSnapshot({
  computedTop,
  history,
  lotteryKey,
  date,
  closeHour,
  publicApi,
}) {
  const schedule = scheduleForPublicProjection(
    lotteryKey,
    date
  );

  return (Array.isArray(computedTop)
    ? computedTop
    : []
  )
    .slice(0, 3)
    .map((item, index) => {
      const grupo = Number(item?.grupo);

      if (
        !Number.isFinite(grupo) ||
        grupo < 1 ||
        grupo > 25
      ) {
        return null;
      }

      const probability = Number(
        item?.scoreProb ??
        item?.probability ??
        item?.confidence ??
        0
      );

      const prob =
        probability > 1
          ? probability / 100
          : probability;

      const engineOutput =
        publicApi.build20MilharesForGrupo({
          rangeDraws: history,
          analysisHourBucket: closeHour,
          schedule,
          grupo2: grupo,
          targetYmd: date,
        });

      const milharesCols =
        buildPublicMilharesCols(
          engineOutput,
          4,
          5
        );

      const milhares20 = milharesCols
        .flatMap((column) => column.items)
        .filter(
          (milhar) => /^\d{4}$/.test(milhar)
        )
        .slice(0, 20);

      return {
        rank: index + 1,
        grupo,
        animal:
          item?.animal ||
          ANIMALS[
            String(grupo).padStart(2, "0")
          ] ||
          "",
        prob:
          Number.isFinite(prob)
            ? prob
            : 0,
        probPct:
          Number.isFinite(prob)
            ? Number((prob * 100).toFixed(4))
            : 0,
        milhares20,
        milharesCols,
        meta: item?.meta || null,
      };
    })
    .filter(Boolean);
}

async function saveTop3PublicProjection({
  lotteryKey,
  date,
  closeHour,
  snapshot,
  engineVersion = "V3_STATISTICAL",
  source = "backend-top3",
}) {
  const lottery = normalizeLotteryKey(lotteryKey);
  const hour = normalizeHour(closeHour);
  const hourCode = publicHourCode(hour);

  const id =
    `${lottery}__${date}__${hourCode}`;

  const normalizedSnapshot =
    Array.isArray(snapshot)
      ? snapshot.slice(0, 3)
      : [];

  if (!normalizedSnapshot.length) {
    throw new Error(
      "Snapshot público TOP3 vazio."
    );
  }

  const picks = normalizedSnapshot
    .map((item) => Number(item?.grupo))
    .filter(
      (grupo) =>
        Number.isFinite(grupo) &&
        grupo >= 1 &&
        grupo <= 25
    )
    .slice(0, 3);

  if (!picks.length) {
    throw new Error(
      "Picks públicos TOP3 inválidos."
    );
  }

  const database = getDb();
  const ref = database
    .collection("top3_predictions")
    .doc(id);

  const now = Date.now();

  const payload = {
    id,
    lotteryKey: lottery,
    targetYmd: date,
    targetHour:
      `${hourCode}h`,
    targetKey:
      `${date}_${hourCode}h`,
    picks,
    snapshot: normalizedSnapshot,
    engineVersion,
    status: "predicted",
    resultGrupo: null,
    resultMilhar: "",
    resultAnimal: "",
    hitType: "",
    hitScore: 0,
    hitPosition: -1,
    matchedValue: "",
    createdAt: now,
    updatedAt: now,
    createdBy: source,
    source,
  };

  return database.runTransaction(
    async (transaction) => {
      const current =
        await transaction.get(ref);

      if (!current.exists) {
        transaction.set(ref, payload);

        return {
          ok: true,
          created: true,
          updated: false,
          existing: false,
          protected: false,
          id,
        };
      }

      const currentData =
        current.data() || {};

      const currentStatus = String(
        currentData.status || ""
      )
        .trim()
        .toLowerCase();

      if (currentStatus === "validated") {
        return {
          ok: true,
          created: false,
          updated: false,
          existing: true,
          protected: true,
          reason: "ALREADY_VALIDATED",
          id,
        };
      }

      const updatedPayload = {
        ...payload,
        createdAt:
          currentData.createdAt ||
          payload.createdAt,
        updatedAt: Date.now(),
        resultGrupo:
          currentData.resultGrupo ?? null,
        resultMilhar:
          currentData.resultMilhar || "",
        resultAnimal:
          currentData.resultAnimal || "",
        hitType:
          currentData.hitType || "",
        hitScore:
          Number(currentData.hitScore || 0),
        hitPosition:
          Number.isFinite(
            Number(currentData.hitPosition)
          )
            ? Number(currentData.hitPosition)
            : -1,
        matchedValue:
          currentData.matchedValue || "",
      };

      transaction.set(
        ref,
        updatedPayload,
        { merge: true }
      );

      return {
        ok: true,
        created: false,
        updated: true,
        existing: true,
        protected: false,
        id,
      };
    }
  );
}

function mapTop3ToPredictions(top = []) {
  return (Array.isArray(top) ? top : [])
    .slice(0, 3)
    .map((item, index) => {
      const grupoNumber = Number(item?.grupo);
      const grupo = String(grupoNumber).padStart(2, "0");

      const probability = Number(
        item?.scoreProb ??
        item?.probability ??
        item?.confidence ??
        0
      );

      const percentage =
        probability > 0 && probability <= 1
          ? probability * 100
          : probability;

      return {
        type: "grupo",
        grupo,
        animal:
          item?.animal ||
          ANIMALS[grupo] ||
          null,
        score: Number(
          Number.isFinite(percentage)
            ? percentage.toFixed(4)
            : 0
        ),
        confidence: Number(
          Number.isFinite(percentage)
            ? percentage.toFixed(4)
            : 0
        ),
        reasons: Array.isArray(item?.reasons)
          ? item.reasons.filter(Boolean)
          : [],
        signals: {
          engine: "top3_statistical_v3",
          rankPosition: index + 1,
          scoreProb: Number(item?.scoreProb || 0),
          rawScore: Number(item?.score || 0),
          meta: item?.meta || null,
        },
      };
    })
    .filter((item) => /^\d{2}$/.test(item.grupo));
}

async function createTop3PredictionRun(
  input = {},
  dependencies = {}
) {
  const lotteryKey = normalizeLotteryKey(
    input.lotteryKey
  );

  const date = normalizeYmd(input.date);
  const closeHour = normalizeHour(input.closeHour);

  const computeTop3 =
    dependencies.computeTop3 ||
    computeStatisticalTop3V3;

  const persistRun =
    dependencies.persistRun ||
    createPredictionRun;

  const publicApi =
    dependencies.publicApi ||
    loadTop3PublicApi();

  const historyLoad = await loadPredictionHistory({
    lotteryKey,
    date,
    input,
    dependencies,
  });

  const allDraws = extractDraws(
    historyLoad.draws
  );

  const {
    source: historySource,
    metadata: historyMetadata,
    lookbackDays,
    maxDraws,
    startYmd,
  } = historyLoad;

  if (!allDraws.length) {
    throw new Error(
      `Nenhum resultado encontrado para ${lotteryKey}.`
    );
  }

  const targetKey = dateHourKey(date, closeHour);

  const history = allDraws
    .filter((draw) => {
      const ymd = publicApi.pickDrawYMD(draw);
      const hour = publicApi.pickDrawHour(draw);

      if (!ymd || !hour) {
        return false;
      }

      return dateHourKey(ymd, hour) < targetKey;
    })
    .sort((a, b) => {
      const aKey = dateHourKey(
        publicApi.pickDrawYMD(a),
        publicApi.pickDrawHour(a)
      );

      const bKey = dateHourKey(
        publicApi.pickDrawYMD(b),
        publicApi.pickDrawHour(b)
      );

      return aKey.localeCompare(bKey);
    });

  if (!history.length) {
    throw new Error(
      "Não existe histórico anterior ao horário solicitado."
    );
  }

  const drawLast = history[history.length - 1];

  const drawsToday = history.filter(
    (draw) => publicApi.pickDrawYMD(draw) === date
  );

  const computed = computeTop3({
    lotteryKey,
    drawsRange: history,
    drawLast,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
    topN: 3,
    targetYmdOverride: date,
    targetHourOverride: closeHour,
  });

  const predictions = mapTop3ToPredictions(
    computed?.top
  );

  const publicSnapshot =
    buildTop3PublicSnapshot({
      computedTop: computed?.top,
      history,
      lotteryKey,
      date,
      closeHour,
      publicApi,
    });

  if (!predictions.length) {
    throw new Error(
      "O motor TOP3 não produziu previsões válidas."
    );
  }

  if (
    publicSnapshot.length !== 3 ||
    publicSnapshot.some(
      (item) =>
        !Array.isArray(item?.milhares20) ||
        item.milhares20.length !== 20
    )
  ) {
    throw new Error(
      "O motor TOP3 não produziu 20 milhares válidas para cada grupo."
    );
  }

  const metadata = {
    ...(input.metadata || {}),
    engine: "top3_statistical_v3",
    historyDraws: history.length,
    drawsToday: drawsToday.length,
    historySource,
    historyBootstrapStatus:
      historyMetadata?.bootstrapStatus || null,
    historyTotalStored:
      Number(historyMetadata?.totalDraws || 0) || null,
    lookbackDays,
    maxDraws,
    startYmd,
    lastDrawYmd:
      publicApi.pickDrawYMD(drawLast) || null,
    lastDrawHour:
      publicApi.pickDrawHour(drawLast) || null,
    targetYmd: date,
    targetHour: closeHour,
    engineMeta: computed?.meta || null,
  };

  const engine = {
    name: "top3_statistical_v3",
    historyDraws: history.length,
    drawsToday: drawsToday.length,
    historySource,
    historyBootstrapStatus:
      historyMetadata?.bootstrapStatus || null,
    historyTotalStored:
      Number(historyMetadata?.totalDraws || 0) || null,
    lookbackDays,
    maxDraws,
    startYmd,
    targetYmd: date,
    targetHour: closeHour,
    meta: computed?.meta || null,
  };

  if (input.dryRun === true) {
    return {
      run: null,
      predictions,
      publicSnapshot,
      engine,
      dryRun: true,
    };
  }

  const source =
    input.source || "backend-top3";

  const result = await persistRun({
    lotteryKey,
    date,
    closeHour,
    source,
    algorithm: "top3_statistical_v3",
    metadata,
    predictions,
  });

  const publicProjection =
    await saveTop3PublicProjection({
      lotteryKey,
      date,
      closeHour,
      snapshot: publicSnapshot,
      engineVersion: "V3_STATISTICAL",
      source,
    });

  return {
    ...result,
    publicSnapshot,
    publicProjection,
    engine,
    dryRun: false,
  };
}

module.exports = {
  createTop3PredictionRun,
  mapTop3ToPredictions,
  normalizeHour,
  normalizeHistorySource,
  loadPredictionHistory,
  buildPublicMilharesCols,
  buildTop3PublicSnapshot,
  saveTop3PublicProjection,
  resolveNextTop3Slot,
};
