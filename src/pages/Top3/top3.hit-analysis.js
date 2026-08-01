/*
 * TOP3_MULTI_HIT_CONTRACT_V1
 *
 * Camada canônica de avaliação dos resultados do TOP3.
 * Não possui dependência de React, Firestore ou interface.
 */

function normalizeMilhar(value) {
  const digits = String(value || "")
    .replace(/\D/g, "");

  if (!digits) return "";

  return digits
    .slice(-4)
    .padStart(4, "0");
}

function normalizeGrupo(value) {
  const grupo = Number(value);

  return (
    Number.isFinite(grupo) &&
    grupo >= 1 &&
    grupo <= 25
  )
    ? grupo
    : null;
}

function podiumMedalFromPosition(position) {
  if (Number(position) === 1) return "gold";
  if (Number(position) === 2) return "silver";
  if (Number(position) === 3) return "bronze";

  return "";
}

function normalizeOfficialPodium(
  officialPodium = []
) {
  return (
    Array.isArray(officialPodium)
      ? officialPodium
      : []
  )
    .filter(Boolean)
    .slice(0, 3)
    .map((item, index) => {
      const position = Number(
        item?.position || index + 1
      );

      const grupo = normalizeGrupo(
        item?.grupo
      );

      if (
        !grupo ||
        position < 1 ||
        position > 3
      ) {
        return null;
      }

      return {
        position,
        grupo,
        milhar: normalizeMilhar(
          item?.milhar ??
            item?.numero ??
            item?.number ??
            item?.valor ??
            ""
        ),
        animal: String(
          item?.animal || ""
        ).trim(),
      };
    })
    .filter(Boolean);
}

function normalizePredictions(snapshot = []) {
  return (
    Array.isArray(snapshot)
      ? snapshot
      : []
  )
    .slice(0, 3)
    .map((item, index) => {
      const grupo = normalizeGrupo(
        item?.grupo
      );

      if (!grupo) return null;

      const milhares = (
        Array.isArray(item?.milhares24)
          ? item.milhares24
          : Array.isArray(item?.milhares20)
            ? item.milhares20
            : Array.isArray(item?.milhares)
              ? item.milhares
              : []
      )
        .map(normalizeMilhar)
        .filter(Boolean);

      return {
        predictionPosition: index + 1,
        grupo,
        animal: String(
          item?.animal || ""
        ).trim(),
        milhares,
        centenas: milhares.map(
          (value) => value.slice(-3)
        ),
        dezenas: milhares.map(
          (value) => value.slice(-2)
        ),
      };
    })
    .filter(Boolean);
}

function compareHits(left, right) {
  const leftResult = Number(
    left?.resultPosition || 99
  );

  const rightResult = Number(
    right?.resultPosition || 99
  );

  if (leftResult !== rightResult) {
    return leftResult - rightResult;
  }

  return (
    Number(
      left?.predictionPosition || 99
    ) -
    Number(
      right?.predictionPosition || 99
    )
  );
}

export function analyzeTop3Hits(
  snapshot,
  officialPodium
) {
  const predictions =
    normalizePredictions(snapshot);

  const podium =
    normalizeOfficialPodium(
      officialPodium
    );

  const hits = [];

  for (const officialPrize of podium) {
    const resultMilhar =
      normalizeMilhar(
        officialPrize?.milhar
      );

    const resultCentena =
      resultMilhar
        ? resultMilhar.slice(-3)
        : "";

    const resultDezena =
      resultMilhar
        ? resultMilhar.slice(-2)
        : "";

    for (const prediction of predictions) {
      let hitType = "miss";
      let hitScore = 0;
      let matchedValue = "";

      if (
        resultMilhar &&
        prediction.milhares.includes(
          resultMilhar
        )
      ) {
        hitType = "hit_exact";
        hitScore = 100;
        matchedValue = resultMilhar;
      } else if (
        resultCentena &&
        prediction.centenas.includes(
          resultCentena
        )
      ) {
        hitType = "hit_centena";
        hitScore = 66.67;
        matchedValue = resultCentena;
      } else if (
        resultDezena &&
        prediction.dezenas.includes(
          resultDezena
        )
      ) {
        hitType = "hit_dezena";
        hitScore = 33.33;
        matchedValue = resultDezena;
      } else if (
        Number(prediction.grupo) ===
        Number(officialPrize.grupo)
      ) {
        hitType = "hit_grupo";
        hitScore = 33.33;
        matchedValue = String(
          officialPrize.grupo
        ).padStart(2, "0");
      }

      if (hitType === "miss") {
        continue;
      }

      hits.push({
        hitType,
        type: hitType,

        hitScore,
        score: hitScore,

        hitPosition:
          prediction.predictionPosition,

        position:
          prediction.predictionPosition,

        predictionPosition:
          prediction.predictionPosition,

        resultPosition:
          officialPrize.position,

        podiumMedal:
          podiumMedalFromPosition(
            officialPrize.position
          ),

        matchedValue,

        matchedGrupo:
          officialPrize.grupo,

        matchedMilhar:
          resultMilhar,

        matchedAnimal:
          officialPrize.animal,

        predictionGrupo:
          prediction.grupo,

        predictionAnimal:
          prediction.animal,
      });
    }
  }

  const uniqueHits = hits
    .filter((hit, index, list) => {
      return (
        list.findIndex(
          (other) =>
            Number(
              other.predictionPosition
            ) ===
              Number(
                hit.predictionPosition
              ) &&
            Number(
              other.resultPosition
            ) ===
              Number(
                hit.resultPosition
              )
        ) === index
      );
    })
    .sort(compareHits)
    .slice(0, 3);

  const primaryHit =
    uniqueHits[0] || null;

  if (!primaryHit) {
    return {
      hitType: "miss",
      type: "miss",

      hitScore: 0,
      score: 0,

      hitPosition: -1,
      position: -1,

      predictionPosition: -1,
      resultPosition: -1,

      podiumMedal: "",
      matchedValue: "",
      matchedGrupo: null,
      matchedMilhar: "",
      matchedAnimal: "",

      hits: [],
      hitCount: 0,
      matchedPredictions: 0,
      matchedPrizePositions: 0,
    };
  }

  const matchedPredictions =
    new Set(
      uniqueHits.map(
        (hit) =>
          Number(
            hit.predictionPosition
          )
      )
    ).size;

  const matchedPrizePositions =
    new Set(
      uniqueHits.map(
        (hit) =>
          Number(
            hit.resultPosition
          )
      )
    ).size;

  return {
    ...primaryHit,

    hits: uniqueHits,
    hitCount: uniqueHits.length,

    matchedPredictions,
    matchedPrizePositions,
  };
}

export function normalizeTop3Hits(
  source
) {
  const explicit = Array.isArray(
    source?.hits
  )
    ? source.hits
    : [];

  if (explicit.length) {
    return explicit
      .filter((hit) => {
        const predictionPosition =
          Number(
            hit?.predictionPosition ??
              hit?.hitPosition ??
              hit?.position ??
              -1
          );

        const resultPosition =
          Number(
            hit?.resultPosition ??
              -1
          );

        return (
          predictionPosition >= 1 &&
          predictionPosition <= 3 &&
          resultPosition >= 1 &&
          resultPosition <= 3
        );
      })
      .sort(compareHits)
      .slice(0, 3);
  }

  const legacyPrediction =
    Number(
      source?.predictionPosition ??
        source?.hitPosition ??
        source?.position ??
        -1
    );

  const legacyResult =
    Number(
      source?.resultPosition ??
        -1
    );

  const legacyType =
    String(
      source?.hitType ??
        source?.type ??
        ""
    )
      .trim()
      .toLowerCase();

  if (
    legacyType &&
    legacyType !== "miss" &&
    legacyType !== "none" &&
    legacyPrediction >= 1 &&
    legacyPrediction <= 3 &&
    legacyResult >= 1 &&
    legacyResult <= 3
  ) {
    return [
      {
        ...source,

        hitType:
          source?.hitType ||
          source?.type,

        type:
          source?.type ||
          source?.hitType,

        hitPosition:
          legacyPrediction,

        position:
          legacyPrediction,

        predictionPosition:
          legacyPrediction,

        resultPosition:
          legacyResult,

        podiumMedal:
          source?.podiumMedal ||
          podiumMedalFromPosition(
            legacyResult
          ),
      },
    ];
  }

  return [];
}


export function buildTop3HistoryAnalysis(
  snapshot,
  officialPodium
) {
  const analysis = analyzeTop3Hits(
    snapshot,
    officialPodium
  );

  const hits = normalizeTop3Hits(
    analysis
  );

  const primaryHit = hits[0] || null;

  return {
    ...analysis,

    type:
      primaryHit?.type ||
      primaryHit?.hitType ||
      "miss",

    hitType:
      primaryHit?.hitType ||
      primaryHit?.type ||
      "miss",

    score: Number(
      primaryHit?.score ??
        primaryHit?.hitScore ??
        0
    ),

    hitScore: Number(
      primaryHit?.hitScore ??
        primaryHit?.score ??
        0
    ),

    position: Number(
      primaryHit?.predictionPosition ??
        primaryHit?.hitPosition ??
        primaryHit?.position ??
        -1
    ),

    hitPosition: Number(
      primaryHit?.predictionPosition ??
        primaryHit?.hitPosition ??
        primaryHit?.position ??
        -1
    ),

    predictionPosition: Number(
      primaryHit?.predictionPosition ??
        primaryHit?.hitPosition ??
        primaryHit?.position ??
        -1
    ),

    resultPosition: Number(
      primaryHit?.resultPosition ??
        -1
    ),

    podiumMedal: String(
      primaryHit?.podiumMedal || ""
    ),

    matchedValue: String(
      primaryHit?.matchedValue || ""
    ),

    matchedGrupo:
      primaryHit?.matchedGrupo ?? null,

    matchedMilhar: String(
      primaryHit?.matchedMilhar || ""
    ),

    matchedAnimal: String(
      primaryHit?.matchedAnimal || ""
    ),

    hits,
    hitCount: hits.length,

    matchedPredictions:
      new Set(
        hits.map((hit) =>
          Number(
            hit?.predictionPosition ??
              hit?.hitPosition ??
              hit?.position ??
              -1
          )
        )
      ).size,

    matchedPrizePositions:
      new Set(
        hits.map((hit) =>
          Number(
            hit?.resultPosition ?? -1
          )
        )
      ).size,
  };
}

export const TOP3_MULTI_HIT_CONTRACT =
  "TOP3_MULTI_HIT_CONTRACT_V1";
