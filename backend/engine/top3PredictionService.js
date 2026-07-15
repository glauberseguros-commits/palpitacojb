"use strict";

const {
  fetchDrawsWithPrizesByRange,
} = require("./drawRepository");

const {
  computeStatisticalTop3V3,
  loadTop3PublicApi,
} = require("./scoreEngineUnified");

const {
  createPredictionRun,
} = require("./predictionService");

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

  const fetchDraws =
    dependencies.fetchDraws ||
    fetchDrawsWithPrizesByRange;

  const computeTop3 =
    dependencies.computeTop3 ||
    computeStatisticalTop3V3;

  const persistRun =
    dependencies.persistRun ||
    createPredictionRun;

  const publicApi =
    dependencies.publicApi ||
    loadTop3PublicApi();

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

  const rawDraws = await fetchDraws({
    lottery: lotteryKey,
    startYmd,
    endYmd: date,
    pageSize: Number(input.pageSize || 250),
    maxDraws,
    prizeConcurrency: Number(
      input.prizeConcurrency || 24
    ),
  });

  const allDraws = extractDraws(rawDraws);

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

  if (!predictions.length) {
    throw new Error(
      "O motor TOP3 não produziu previsões válidas."
    );
  }

  const metadata = {
    ...(input.metadata || {}),
    engine: "top3_statistical_v3",
    historyDraws: history.length,
    drawsToday: drawsToday.length,
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
      engine,
      dryRun: true,
    };
  }

  const result = await persistRun({
    lotteryKey,
    date,
    closeHour,
    source: input.source || "backend-top3",
    algorithm: "top3_statistical_v3",
    metadata,
    predictions,
  });

  return {
    ...result,
    engine,
    dryRun: false,
  };
}

module.exports = {
  createTop3PredictionRun,
  mapTop3ToPredictions,
  normalizeHour,
};
