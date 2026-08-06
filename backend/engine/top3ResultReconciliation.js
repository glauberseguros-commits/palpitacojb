"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const {
  getDb,
} = require("../service/firebaseAdmin");

const ANIMALS = {
  1: "Avestruz",
  2: "Águia",
  3: "Burro",
  4: "Borboleta",
  5: "Cachorro",
  6: "Cabra",
  7: "Carneiro",
  8: "Camelo",
  9: "Cobra",
  10: "Coelho",
  11: "Cavalo",
  12: "Elefante",
  13: "Galo",
  14: "Gato",
  15: "Jacaré",
  16: "Leão",
  17: "Macaco",
  18: "Porco",
  19: "Pavão",
  20: "Peru",
  21: "Touro",
  22: "Tigre",
  23: "Urso",
  24: "Veado",
  25: "Vaca",
};

let cachedHitAnalyzer = null;

function safeStr(value) {
  return String(value ?? "").trim();
}

function normalizeLotteryKey(value) {
  return safeStr(value).toUpperCase();
}

function normalizeMilhar(value) {
  const digits = safeStr(value).replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return digits
    .slice(-4)
    .padStart(4, "0");
}

function normalizeHour(value) {
  const raw = safeStr(value).toLowerCase();

  if (!raw) {
    return "";
  }

  const match = raw.match(
    /^(\d{1,2})(?::(\d{2}))?h?$/
  );

  if (!match) {
    return "";
  }

  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );
}

function extractGrupo(prize) {
  const direct = Number(
    prize?.grupo ??
      prize?.group ??
      prize?.animal_grupo ??
      prize?.grupo2
  );

  if (
    Number.isFinite(direct) &&
    direct >= 1 &&
    direct <= 25
  ) {
    return direct;
  }

  const milhar = normalizeMilhar(
    prize?.milhar ??
      prize?.numero ??
      prize?.number ??
      prize?.valor ??
      prize?.value ??
      prize?.raw ??
      ""
  );

  if (!milhar) {
    return null;
  }

  const dezenaRaw = Number(
    milhar.slice(-2)
  );

  const dezena =
    dezenaRaw === 0
      ? 100
      : dezenaRaw;

  const grupo = Math.ceil(dezena / 4);

  return (
    grupo >= 1 &&
    grupo <= 25
  )
    ? grupo
    : null;
}

function analyzerCandidates() {
  return [
    path.resolve(
      __dirname,
      "../../src/pages/Top3/top3.hit-analysis.js"
    ),
    "/src/pages/Top3/top3.hit-analysis.js",
  ];
}

function loadCanonicalHitAnalyzer() {
  if (cachedHitAnalyzer) {
    return cachedHitAnalyzer;
  }

  const analyzerPath =
    analyzerCandidates().find(
      (candidate) => fs.existsSync(candidate)
    );

  if (!analyzerPath) {
    throw new Error(
      "Analisador canônico TOP3 não encontrado."
    );
  }

  let source = fs.readFileSync(
    analyzerPath,
    "utf8"
  );

  source = source
    .replace(
      /export\s+function\s+/g,
      "function "
    )
    .replace(
      /export\s+const\s+/g,
      "const "
    );

  source += `
module.exports = {
  analyzeTop3Hits,
  normalizeTop3Hits,
  buildTop3HistoryAnalysis,
};
`;

  const loaded = new Module(
    analyzerPath,
    module
  );

  loaded.filename = analyzerPath;
  loaded.paths =
    Module._nodeModulePaths(
      path.dirname(analyzerPath)
    );

  loaded._compile(
    source,
    analyzerPath
  );

  if (
    typeof loaded.exports
      ?.analyzeTop3Hits !== "function"
  ) {
    throw new Error(
      "analyzeTop3Hits não foi exportada pelo analisador canônico."
    );
  }

  cachedHitAnalyzer = loaded.exports;

  return cachedHitAnalyzer;
}

async function readPredictionDocuments({
  database,
  lotteryKey,
  targetYmd,
  onlyHour,
}) {
  const snapshot = await database
    .collection("top3_predictions")
    .where("targetYmd", "==", targetYmd)
    .get();

  const normalizedOnlyHour =
    normalizeHour(onlyHour);

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ref: doc.ref,
      ...doc.data(),
    }))
    .filter((entry) => {
      const entryLottery =
        normalizeLotteryKey(
          entry?.lotteryKey
        );

      const entryHour =
        normalizeHour(
          entry?.targetHour
        );

      if (entryLottery !== lotteryKey) {
        return false;
      }

      if (
        normalizedOnlyHour &&
        entryHour !== normalizedOnlyHour
      ) {
        return false;
      }

      return true;
    });
}

async function readDrawDocuments({
  database,
  lotteryKey,
  targetYmd,
  onlyHour,
}) {
  const snapshots = [];

  for (const dateField of ["date", "ymd"]) {
    try {
      const snapshot = await database
        .collection("draws")
        .where(dateField, "==", targetYmd)
        .get();

      snapshots.push(snapshot);
    }
    catch (error) {
      console.warn(
        "[TOP3 RECONCILE] consulta ignorada",
        {
          dateField,
          error:
            error?.message ||
            String(error),
        }
      );
    }
  }

  const byId = new Map();

  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      byId.set(doc.id, doc);
    }
  }

  const normalizedOnlyHour =
    normalizeHour(onlyHour);

  const result = [];

  for (const doc of byId.values()) {
    const data = doc.data() || {};

    const drawLottery =
      normalizeLotteryKey(
        data?.lottery_key ??
          data?.lotteryKey ??
          data?.lottery
      );

    if (drawLottery !== lotteryKey) {
      continue;
    }

    const drawHour =
      normalizeHour(
        data?.close_hour ??
          data?.closeHour ??
          data?.hour ??
          data?.hora
      );

    if (!drawHour) {
      continue;
    }

    if (
      normalizedOnlyHour &&
      drawHour !== normalizedOnlyHour
    ) {
      continue;
    }

    const prizesSnapshot =
      await doc.ref
        .collection("prizes")
        .get();

    let prizes =
      prizesSnapshot.docs.map(
        (prizeDoc) => ({
          id: prizeDoc.id,
          ...prizeDoc.data(),
        })
      );

    if (!prizes.length) {
      prizes = Array.isArray(data?.prizes)
        ? data.prizes
        : [];

      if (!prizes.length) {
        prizes = [];

        for (
          let position = 1;
          position <= 15;
          position += 1
        ) {
          const value =
            data?.[`prize_${position}`];

          if (
            value !== undefined &&
            value !== null &&
            safeStr(value)
          ) {
            prizes.push({
              position,
              value,
            });
          }
        }
      }
    }

    prizes = prizes
      .map((prize, index) => {
        const position = Number(
          prize?.position ??
            prize?.posicao ??
            prize?.rank ??
            prize?.ordem ??
            index + 1
        );

        const milhar =
          normalizeMilhar(
            prize?.milhar ??
              prize?.numero ??
              prize?.number ??
              prize?.valor ??
              prize?.value ??
              prize?.raw ??
              ""
          );

        const grupo =
          extractGrupo({
            ...prize,
            milhar,
          });

        return {
          position,
          grupo,
          milhar,
          animal:
            safeStr(prize?.animal) ||
            ANIMALS[grupo] ||
            "",
        };
      })
      .filter(
        (prize) =>
          Number.isFinite(prize.position) &&
          prize.position >= 1 &&
          prize.position <= 15 &&
          prize.grupo >= 1 &&
          prize.grupo <= 25
      )
      .sort(
        (left, right) =>
          left.position -
          right.position
      );

    result.push({
      id: doc.id,
      ref: doc.ref,
      hour: drawHour,
      prizes,
    });
  }

  return result;
}

function selectDrawForHour(
  draws,
  hour
) {
  return (
    draws
      .filter(
        (draw) =>
          normalizeHour(draw?.hour) === hour
      )
      .sort(
        (left, right) =>
          Number(right?.prizes?.length || 0) -
          Number(left?.prizes?.length || 0)
      )[0] ||
    null
  );
}

function buildOfficialPodium(draw) {
  const prizes =
    Array.isArray(draw?.prizes)
      ? draw.prizes
      : [];

  return [1, 2, 3]
    .map((position) => {
      const prize =
        prizes.find(
          (item) =>
            Number(item?.position) ===
            position
        ) ||
        prizes[position - 1] ||
        null;

      if (
        !prize ||
        !Number.isFinite(
          Number(prize?.grupo)
        )
      ) {
        return null;
      }

      return {
        position,
        grupo: Number(prize.grupo),
        milhar:
          normalizeMilhar(
            prize.milhar
          ),
        animal:
          safeStr(prize.animal) ||
          ANIMALS[
            Number(prize.grupo)
          ] ||
          "",
      };
    })
    .filter(Boolean);
}

async function reconcileTop3PredictionDayBackend({
  lotteryKey,
  targetYmd,
  onlyHour = null,
  dryRun = false,
  source = "backend-top3-reconciliation-v1",
} = {}) {
  const lottery =
    normalizeLotteryKey(lotteryKey);

  const ymd = safeStr(targetYmd);

  if (
    !lottery ||
    !/^\d{4}-\d{2}-\d{2}$/.test(ymd)
  ) {
    throw new Error(
      "Parâmetros inválidos para reconciliação TOP3."
    );
  }

  const database = getDb();

  const predictions =
    await readPredictionDocuments({
      database,
      lotteryKey: lottery,
      targetYmd: ymd,
      onlyHour,
    });

  const draws =
    await readDrawDocuments({
      database,
      lotteryKey: lottery,
      targetYmd: ymd,
      onlyHour,
    });

  const {
    analyzeTop3Hits,
  } = loadCanonicalHitAnalyzer();

  const rows = [];

  for (const prediction of predictions) {
    const hour = normalizeHour(
      prediction?.targetHour
    );

    const draw =
      selectDrawForHour(
        draws,
        hour
      );

    if (!draw) {
      rows.push({
        id: prediction.id,
        hour,
        status: "DRAW_NOT_FOUND",
      });

      continue;
    }

    const officialPodium =
      buildOfficialPodium(draw);

    if (officialPodium.length < 3) {
      rows.push({
        id: prediction.id,
        hour,
        status: "PODIUM_INCOMPLETE",
        podiumLength:
          officialPodium.length,
      });

      continue;
    }

    const analysis =
      analyzeTop3Hits(
        prediction?.snapshot,
        officialPodium
      );

    const firstOfficialPrize =
      officialPodium.find(
        (item) =>
          Number(item?.position) === 1
      ) ||
      officialPodium[0];

    const now = Date.now();

    const payload = {
      status: "validated",

      resultGrupo:
        Number(
          firstOfficialPrize?.grupo
        ) || null,

      resultMilhar:
        normalizeMilhar(
          firstOfficialPrize?.milhar
        ),

      resultAnimal:
        safeStr(
          firstOfficialPrize?.animal
        ),

      resultLotteryKey: lottery,

      resultTop3Groups:
        officialPodium.map(
          (item) =>
            Number(item?.grupo) || null
        ),

      resultTop3Milhares:
        officialPodium.map(
          (item) =>
            normalizeMilhar(item?.milhar)
        ),

      hitType:
        safeStr(
          analysis?.hitType ||
          analysis?.type ||
          "miss"
        ),

      hitScore:
        Number(
          analysis?.hitScore ??
          analysis?.score ??
          0
        ),

      hitPosition:
        Number(
          analysis?.hitPosition ??
          analysis?.predictionPosition ??
          analysis?.position ??
          -1
        ),

      predictionPosition:
        Number(
          analysis?.predictionPosition ??
          analysis?.hitPosition ??
          analysis?.position ??
          -1
        ),

      resultPosition:
        Number(
          analysis?.resultPosition ??
          -1
        ),

      podiumMedal:
        safeStr(
          analysis?.podiumMedal
        ),

      matchedValue:
        safeStr(
          analysis?.matchedValue
        ),

      matchedGrupo:
        analysis?.matchedGrupo ??
        null,

      matchedMilhar:
        safeStr(
          analysis?.matchedMilhar
        ),

      matchedAnimal:
        safeStr(
          analysis?.matchedAnimal
        ),

      hits:
        Array.isArray(analysis?.hits)
          ? analysis.hits
          : [],

      hitCount:
        Number(
          analysis?.hitCount || 0
        ),

      matchedPredictions:
        Number(
          analysis?.matchedPredictions ||
          0
        ),

      matchedPrizePositions:
        Number(
          analysis?.matchedPrizePositions ||
          0
        ),

      validatedAt: now,
      updatedAt: now,
      validationSource: source,
    };

    if (!dryRun) {
      await prediction.ref.set(
        payload,
        {
          merge: true,
        }
      );
    }

    rows.push({
      id: prediction.id,
      hour,
      status:
        dryRun
          ? "DRY_RUN"
          : "UPDATED",
      hitType: payload.hitType,
      hitScore: payload.hitScore,
      hitPosition:
        payload.hitPosition,
      predictionPosition:
        payload.predictionPosition,
      resultPosition:
        payload.resultPosition,
      hitCount:
        payload.hitCount,
      resultTop3Groups:
        payload.resultTop3Groups,
      resultTop3Milhares:
        payload.resultTop3Milhares,
      hits: payload.hits,
    });
  }

  return {
    ok: true,
    lotteryKey: lottery,
    targetYmd: ymd,
    onlyHour:
      normalizeHour(onlyHour) ||
      null,
    dryRun,
    predictionsFound:
      predictions.length,
    drawsFound:
      draws.length,
    updated:
      rows.filter(
        (row) =>
          row.status === "UPDATED"
      ).length,
    simulated:
      rows.filter(
        (row) =>
          row.status === "DRY_RUN"
      ).length,
    rows,
  };
}

module.exports = {
  reconcileTop3PredictionDayBackend,
  loadCanonicalHitAnalyzer,
  normalizeHour,
  normalizeMilhar,
};
