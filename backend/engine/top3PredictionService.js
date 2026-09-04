"use strict";

const {
  getTop3ProductionProfileAssignment,
} = require("./top3ProductionProfileMap");


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
  "18:00",
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

        const snapshotCountMismatch =
          expectedTotal > 0 &&
          draws.length !== expectedTotal;

        if (!snapshotCountMismatch) {
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

        const mismatchMessage =
          "Histórico TOP3 inconsistente: metadata.totalDraws=" +
          `${expectedTotal}, carregados=${draws.length}.`;

        if (requestedSource === "snapshot") {
          throw new Error(mismatchMessage);
        }

        console.warn(
          "[TOP3 HISTORY FALLBACK] " +
          mismatchMessage +
          " Utilizando histórico por intervalo."
        );
      } else if (requestedSource === "snapshot") {
        throw new Error(
          "Metadata do histórico TOP3 está completo, mas nenhum draw foi carregado."
        );
      } else {
        console.warn(
          "[TOP3 HISTORY FALLBACK] Metadata completa sem draws carregados. " +
          "Utilizando histórico por intervalo."
        );
      }
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

  /*
   * TOP3_PUBLIC_HOUR_CONTRACT_BRIDGE_V1
   *
   * A API publica TOP3 pode retornar buckets como "09h", "20h".
   * O backend trabalha com o contrato canonico "HH:MM".
   *
   * Esta ponte normaliza somente a fronteira entre os contratos.
   * Nao altera calendario, motor ou regra de proximo slot.
   */
  const publicHourMatch =
    rawHour.match(/^(\d{1,2})h$/i);

  const hourForBackend =
    publicHourMatch
      ? `${String(
          Number(publicHourMatch[1])
        ).padStart(2, "0")}:00`
      : rawHour;

  let canonicalHour = "";

  try {
    canonicalHour =
      normalizeHour(hourForBackend);
  } catch {
    canonicalHour = "";
  }

  return {
    ...resolved,
    ymd: normalizeYmd(resolved?.ymd),
    hour: canonicalHour,
    hourBucket: canonicalHour,
  };
}

function scheduleForPublicProjection(
  lotteryKey,
  date,
  publicApi
) {
  if (
    !publicApi ||
    typeof publicApi.getScheduleForLottery !== "function"
  ) {
    throw new Error(
      "API pública TOP3 sem getScheduleForLottery."
    );
  }

  return publicApi.getScheduleForLottery({
    lotteryKey: normalizeLotteryKey(lotteryKey),
    ymd: normalizeYmd(date),
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });
}

function buildPublicMilharesCols(
  engineOutput,
  expectedCols = 4,
  perCol = 6
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
    date,
    publicApi
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
        publicApi.build24MilharesForGrupo({
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
          6
        );

      const milhares24 = milharesCols
        .flatMap((column) => column.items)
        .filter(
          (milhar) => /^\d{4}$/.test(milhar)
        )
        .slice(0, 24);

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
        milhares24,
        milharesCols,
        meta: {
          ...(item?.meta && typeof item.meta === "object"
            ? item.meta
            : {}),
          predictionType: "TOP3",
          persistenceContext: {
            lotteryKey: normalizeLotteryKey(lotteryKey),
            targetYmd: date,
            targetHour: normalizeHour(closeHour),
          },
        },
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
      lottery === "FEDERAL" &&
      hour === "11:30"
        ? "11:30"
        : `${hourCode}h`,
    targetKey:
      `${date}_${hourCode}h`,
    predictionType: "TOP3",
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
          entry: payload,
        };
      }

      const currentData =
        current.data() || {};

      /*
       * TOP3_DOMAIN_OWNERSHIP_GUARD_V1
       *
       * Documento explicitamente pertencente ao Terno de Grupo
       * jamais é recalculado, convertido ou sobrescrito pelo TOP3.
       *
       * Os casos históricos ficam preservados até migração
       * administrativa específica.
       */
      if (
        isExplicitForeignTop3Projection(
          currentData
        )
      ) {
        return {
          ok: false,
          created: false,
          updated: false,
          existing: true,
          protected: true,
          foreign: true,
          reason:
            "FOREIGN_PERSISTED_SNAPSHOT_REQUIRES_MIGRATION",
          id,
          entry: currentData,
        };
      }

      const currentIsValid =
        isStoredPublicProjectionValid(
          currentData,
          {
            lotteryKey: lottery,
            date,
            closeHour: hour,
          }
        );

      /*
       * TOP3_FIRST_VALID_PUBLIC_SNAPSHOT_IMMUTABLE_V1
       *
       * Snapshot válido já publicado permanece imutável.
       */
      if (currentIsValid) {
        return {
          ok: true,
          created: false,
          updated: false,
          existing: true,
          protected: true,
          reason:
            "ALREADY_PERSISTED_VALID_SNAPSHOT",
          id,
          entry: currentData,
        };
      }

      /*
       * Documento inválido pode ser reparado uma única vez
       * com um snapshot válido para o contexto correto.
       */
      const replacementPayload = {
        ...payload,

        createdAt:
          currentData?.createdAt ??
          payload.createdAt,

        createdBy:
          currentData?.createdBy ??
          payload.createdBy,

        updatedAt: now,
      };

      transaction.set(
        ref,
        replacementPayload
      );

      return {
        ok: true,
        created: false,
        updated: true,
        existing: true,
        protected: false,
        repaired: true,
        reason:
          "INVALID_PERSISTED_SNAPSHOT_REPAIRED",
        id,
        entry: replacementPayload,
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

function isExplicitForeignTop3Projection(data) {
  if (!data || typeof data !== "object") {
    return false;
  }

  const outerType = String(
    data?.predictionType || ""
  )
    .trim()
    .toUpperCase();

  const outerEngine = String(
    data?.engineVersion || ""
  )
    .trim()
    .toUpperCase();

  if (
    outerType === "TERNO_GRUPO" ||
    outerEngine.includes("TERNO_GRUPO")
  ) {
    return true;
  }

  const snapshot =
    Array.isArray(data?.snapshot)
      ? data.snapshot.slice(0, 3)
      : [];

  return snapshot.some((item) => {
    const metaType = String(
      item?.meta?.predictionType || ""
    )
      .trim()
      .toUpperCase();

    const metaEngine = String(
      item?.meta?.engineVersion || ""
    )
      .trim()
      .toUpperCase();

    return (
      metaType === "TERNO_GRUPO" ||
      metaEngine.includes("TERNO_GRUPO")
    );
  });
}

/*
 * TOP3_FIRST_VALID_PUBLIC_SNAPSHOT_IMMUTABLE_V1
 *
 * Primeira projeção pública válida de um slot é canônica.
 * Documento inválido pode ser reparado; documento válido não
 * pode ser substituído por nova execução.
 */
function normalizeStoredFederalTargetHour({
  lotteryKey,
  date,
  value,
} = {}) {
  const lottery =
    normalizeLotteryKey(lotteryKey);

  if (lottery !== "FEDERAL") {
    return normalizeHour(value);
  }

  const raw =
    String(value || "").trim();

  let normalized = "";

  const legacyHour =
    raw.match(/^(\d{1,2})h$/i);

  if (legacyHour) {
    normalized =
      `${String(Number(legacyHour[1])).padStart(2, "0")}:00`;
  } else {
    try {
      normalized =
        normalizeHour(raw);
    } catch {
      normalized = "";
    }
  }

  /*
   * Snapshots dominicais gravados antes da correção
   * podem conter 11h/11:00.
   */
  if (
    String(date || "").trim() >= "2026-07-19" &&
    normalized === "11:00"
  ) {
    return "11:30";
  }

  return normalized;
}

function isStoredPublicProjectionValid(
  data,
  {
    lotteryKey,
    date,
    closeHour,
  }
) {
  if (!data || typeof data !== "object") {
    return false;
  }

  if (isExplicitForeignTop3Projection(data)) {
    return false;
  }

  const expectedLottery =
    normalizeLotteryKey(lotteryKey);

  const expectedDate =
    normalizeYmd(date);

  const expectedHour =
    normalizeHour(closeHour);

  const storedOuterHour =
    expectedLottery === "FEDERAL"
      ? normalizeStoredFederalTargetHour({
          lotteryKey: expectedLottery,
          date: expectedDate,
          value: data?.targetHour,
        })
      : normalizeHour(
          data?.targetHour
        );

  if (
    normalizeLotteryKey(
      data?.lotteryKey
    ) !== expectedLottery ||
    String(
      data?.targetYmd || ""
    ).trim() !== expectedDate ||
    storedOuterHour !== expectedHour
  ) {
    return false;
  }

  const snapshot =
    Array.isArray(data?.snapshot)
      ? data.snapshot.slice(0, 3)
      : [];

  if (snapshot.length !== 3) {
    return false;
  }

  return snapshot.every((item) => {
    const grupo =
      Number(item?.grupo);

    if (
      !Number.isFinite(grupo) ||
      grupo < 1 ||
      grupo > 25
    ) {
      return false;
    }

    const context =
      item?.meta?.persistenceContext;

    if (
      !context ||
      typeof context !== "object"
    ) {
      return true;
    }

    const storedContextHour =
      expectedLottery === "FEDERAL"
        ? normalizeStoredFederalTargetHour({
            lotteryKey: expectedLottery,
            date: expectedDate,
            value: context?.targetHour,
          })
        : normalizeHour(
            context?.targetHour
          );

    return (
      normalizeLotteryKey(
        context?.lotteryKey
      ) === expectedLottery &&
      String(
        context?.targetYmd || ""
      ).trim() === expectedDate &&
      storedContextHour === expectedHour
    );
  });
}

function mapPersistedSnapshotToPredictions(
  snapshot = []
) {
  const normalized =
    Array.isArray(snapshot)
      ? snapshot.slice(0, 3)
      : [];

  return mapTop3ToPredictions(
    normalized.map((item) => {
      const prob = Number(item?.prob);
      const probPct = Number(item?.probPct);

      return {
        ...item,

        scoreProb:
          Number.isFinite(prob)
            ? prob
            : Number.isFinite(probPct)
              ? probPct / 100
              : 0,
      };
    })
  );
}

async function loadExistingTop3PublicProjection({
  lotteryKey,
  date,
  closeHour,
}) {
  const lk = normalizeLotteryKey(lotteryKey);
  const ymd = normalizeYmd(date);
  const hour = normalizeHour(closeHour);
  const hourCode = publicHourCode(hour);

  const id =
    `${lk}__${ymd}__${hourCode}`;

  const ref = getDb()
    .collection("top3_predictions")
    .doc(id);

  const snap = await ref.get();

  if (!snap.exists) {
    return {
      exists: false,
      id,
      data: null,
    };
  }

  return {
    exists: true,
    id,
    data: snap.data() || null,
  };
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

  

  /*
   * TOP3_PRODUCTION_PROFILE_MATRIX_BASELINE_V2
   *
   * lotteryKey permanece como loteria-alvo para histórico,
   * resultados e persistência.
   * profileLotteryKey é entregue somente ao cálculo.
   */
  const productionProfile =
    getTop3ProductionProfileAssignment(
      lotteryKey
    );
const computeTop3 =
    dependencies.computeTop3 ||
    computeStatisticalTop3V3;

  const persistRun =
    dependencies.persistRun ||
    createPredictionRun;

  const publicApi =
    dependencies.publicApi ||
    loadTop3PublicApi();

  /*
   * TOP3_OFFICIAL_SNAPSHOT_EARLY_GUARD_V1
   *
   * Qualquer execução persistente precisa respeitar a projeção
   * pública válida que já venceu para este slot.
   *
   * dryRun continua livre para cálculo/auditoria sem escrita.
   */
  if (input.dryRun !== true) {
    const existingPublic =
      await loadExistingTop3PublicProjection({
        lotteryKey,
        date,
        closeHour,
      });

    /*
     * TOP3_DOMAIN_OWNERSHIP_GUARD_V1
     *
     * Não transformar retroativamente um documento de outro
     * produto em previsão TOP3.
     */
    if (
      existingPublic.exists &&
      isExplicitForeignTop3Projection(
        existingPublic.data
      )
    ) {
      return {
        run: null,
        predictions: [],
        publicSnapshot: [],
        publicProjection: {
          ok: false,
          created: false,
          updated: false,
          existing: true,
          protected: true,
          foreign: true,
          reason:
            "FOREIGN_PERSISTED_SNAPSHOT_REQUIRES_MIGRATION",
          id: existingPublic.id,
          entry: existingPublic.data,
        },
        engine: null,
        dryRun: false,
        skipped: true,
        skipReason:
          "FOREIGN_PERSISTED_SNAPSHOT_REQUIRES_MIGRATION",
      };
    }

    const existingIsValid =
      existingPublic.exists &&
      isStoredPublicProjectionValid(
        existingPublic.data,
        {
          lotteryKey,
          date,
          closeHour,
        }
      );

    if (existingIsValid) {
      const existingSnapshot =
        Array.isArray(
          existingPublic?.data?.snapshot
        )
          ? existingPublic.data.snapshot.slice(
              0,
              3
            )
          : [];

      return {
        run: null,

        predictions:
          mapPersistedSnapshotToPredictions(
            existingSnapshot
          ),

        publicSnapshot:
          existingSnapshot,

        publicProjection: {
          ok: true,
          created: false,
          updated: false,
          existing: true,
          protected: true,
          reason:
            "ALREADY_PERSISTED_VALID_SNAPSHOT",
          id: existingPublic.id,
          entry:
            existingPublic.data,
        },

        engine: null,
        dryRun: false,
        skipped: true,
        skipReason:
          "ALREADY_PERSISTED_VALID_SNAPSHOT",
      };
    }
  }

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
    .map((draw) => {
      const ymd =
        publicApi.pickDrawYMD(draw);

      const rawHour =
        publicApi.pickDrawHour(draw);

      if (!ymd || !rawHour) {
        return null;
      }

      const hour =
        normalizeHour(rawHour);

      return {
        draw,
        ymd,
        hour,
        key: `${ymd}T${hour}`,
      };
    })
    .filter(
      (item) =>
        item &&
        item.key < targetKey
    )
    .sort((a, b) =>
      a.key.localeCompare(b.key)
    )
    .map((item) => item.draw);

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
    lotteryKey:
      productionProfile.profileLotteryKey,
    drawsRange: history,
    drawLast,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
    topN: 3,
    targetYmdOverride: date,
    targetHourOverride: closeHour,
    drawsAlreadySorted: true,
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
        !Array.isArray(item?.milhares24) ||
        item.milhares24.length !== 24
    )
  ) {
    throw new Error(
      "O motor TOP3 não produziu 24 milhares válidas para cada grupo."
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

  /*
   * TOP3_ENGINE_VERSION_RUNTIME_SAFE_V2
   * TOP3_ENGINE_VERSION_SURGICAL_CLEANUP_V4
   *
   * Persist the engine version produced by the current TOP3 result.
   *
   * Priority:
   * 1. publicSnapshot[0].meta.explain.engine
   * 2. metadata.explain.engine
   * 3. metadata.engine
   * 4. V3_STATISTICAL
   */
  const effectiveEngineVersion =
    publicSnapshot?.[0]?.meta?.explain?.engine ||
    metadata?.explain?.engine ||
    metadata?.engine ||
    "V3_STATISTICAL";

  /*
   * TOP3_PUBLIC_PROJECTION_WRITE_AUTHORITY_V1
   *
   * A transação da projeção pública acontece antes de prediction_runs.
   *
   * Assim, duas execuções concorrentes não conseguem persistir
   * versões operacionais diferentes antes da definição do snapshot
   * oficial vencedor.
   */
  const publicProjection =
    await saveTop3PublicProjection({
      lotteryKey,
      date,
      closeHour,
      snapshot: publicSnapshot,
      engineVersion: effectiveEngineVersion,
      source,
    });

  if (
    publicProjection?.foreign === true
  ) {
    return {
      run: null,
      predictions: [],
      publicSnapshot: [],
      publicProjection,
      engine: null,
      dryRun: false,
      skipped: true,
      skipReason:
        "FOREIGN_PERSISTED_SNAPSHOT_REQUIRES_MIGRATION",
    };
  }

  if (
    publicProjection?.protected === true &&
    publicProjection?.existing === true
  ) {
    const officialSnapshot =
      Array.isArray(
        publicProjection?.entry?.snapshot
      )
        ? publicProjection.entry.snapshot.slice(
            0,
            3
          )
        : [];

    return {
      run: null,

      predictions:
        mapPersistedSnapshotToPredictions(
          officialSnapshot
        ),

      publicSnapshot:
        officialSnapshot,

      publicProjection,

      engine: null,
      dryRun: false,
      skipped: true,
      skipReason:
        "ALREADY_PERSISTED_VALID_SNAPSHOT",
    };
  }

  const result = await persistRun({
    lotteryKey,
    date,
    closeHour,
    source,
    algorithm: "top3_statistical_v3",
    metadata,
    predictions,
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
