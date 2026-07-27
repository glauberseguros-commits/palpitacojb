/**
 * Motor independente — Terno de Grupo.
 *
 * Regra oficial:
 * - o palpite contém exatamente 3 grupos únicos;
 * - o resultado considera os grupos do 1º ao 5º prêmio;
 * - existe acerto somente quando os 3 grupos previstos aparecem no TOP5;
 * - a ordem dos grupos não interfere na validação.
 */

export const TERNO_GRUPO_ENGINE_VERSION =
  "TERNO_GRUPO_V1_TOP5";

export const TERNO_GRUPO_PICK_COUNT = 3;
export const TERNO_GRUPO_RESULT_PRIZE_COUNT = 5;

function normalizeGrupo(value) {
  const grupo = Number(value);

  if (
    !Number.isFinite(grupo) ||
    grupo < 1 ||
    grupo > 25
  ) {
    return null;
  }

  return Math.trunc(grupo);
}

function normalizeMilhar(value) {
  const digits = String(value ?? "")
    .replace(/\D/g, "");

  if (!digits) return "";

  return digits
    .slice(-4)
    .padStart(4, "0");
}

function grupoFromMilhar(value) {
  const milhar = normalizeMilhar(value);

  if (!milhar) return null;

  const dezenaRaw = Number(milhar.slice(-2));

  if (!Number.isFinite(dezenaRaw)) {
    return null;
  }

  const dezena =
    dezenaRaw === 0
      ? 100
      : dezenaRaw;

  return normalizeGrupo(
    Math.ceil(dezena / 4)
  );
}

export function extractGrupoFromPrize(prize) {
  if (!prize || typeof prize !== "object") {
    return null;
  }

  const direct = normalizeGrupo(
    prize?.grupo ??
      prize?.group ??
      prize?.animal_grupo ??
      prize?.grupo2
  );

  if (direct != null) {
    return direct;
  }

  return grupoFromMilhar(
    prize?.milhar ??
      prize?.numero ??
      prize?.number ??
      prize?.valor ??
      prize?.result ??
      ""
  );
}

function getPrizeByPosition(draw, position) {
  const prizes = Array.isArray(draw?.prizes)
    ? draw.prizes
    : [];

  return (
    prizes.find(
      (item) =>
        Number(item?.position) ===
        Number(position)
    ) ||
    prizes[Number(position) - 1] ||
    null
  );
}

export function extractTop5Groups(draw) {
  const groups = [];

  for (
    let position = 1;
    position <= TERNO_GRUPO_RESULT_PRIZE_COUNT;
    position += 1
  ) {
    const prize = getPrizeByPosition(
      draw,
      position
    );

    const grupo =
      extractGrupoFromPrize(prize);

    if (grupo == null) {
      continue;
    }

    groups.push({
      position,
      grupo,
      milhar: normalizeMilhar(
        prize?.milhar ??
          prize?.numero ??
          prize?.number ??
          prize?.valor ??
          ""
      ),
      animal: String(
        prize?.animal ?? ""
      ).trim(),
    });
  }

  return groups;
}

export function normalizeTernoGrupoPicks(
  values
) {
  const seen = new Set();
  const picks = [];

  for (
    const raw of Array.isArray(values)
      ? values
      : []
  ) {
    const candidate =
      raw && typeof raw === "object"
        ? raw?.grupo
        : raw;

    const grupo =
      normalizeGrupo(candidate);

    if (
      grupo == null ||
      seen.has(grupo)
    ) {
      continue;
    }

    seen.add(grupo);
    picks.push(grupo);

    if (
      picks.length ===
      TERNO_GRUPO_PICK_COUNT
    ) {
      break;
    }
  }

  return picks;
}

export function buildTernoGrupoPrediction({
  rankedGroups,
  analytics,
} = {}) {
  const source =
    Array.isArray(rankedGroups) &&
    rankedGroups.length
      ? rankedGroups
      : Array.isArray(analytics?.top)
        ? analytics.top
        : [];

  const seen = new Set();
  const items = [];

  for (const raw of source) {
    const grupo = normalizeGrupo(
      raw?.grupo ?? raw
    );

    if (
      grupo == null ||
      seen.has(grupo)
    ) {
      continue;
    }

    seen.add(grupo);

    items.push({
      ...(raw &&
      typeof raw === "object"
        ? raw
        : {}),
      rank: items.length + 1,
      grupo,
    });

    if (
      items.length ===
      TERNO_GRUPO_PICK_COUNT
    ) {
      break;
    }
  }

  return {
    engineVersion:
      TERNO_GRUPO_ENGINE_VERSION,
    valid:
      items.length ===
      TERNO_GRUPO_PICK_COUNT,
    picks: items.map(
      (item) => item.grupo
    ),
    items,
  };
}

export function analyzeTernoGrupoHit(
  predictedGroups,
  resultSource
) {
  const picks =
    normalizeTernoGrupoPicks(
      predictedGroups
    );

  const officialPrizes =
    Array.isArray(resultSource)
      ? resultSource
          .slice(
            0,
            TERNO_GRUPO_RESULT_PRIZE_COUNT
          )
          .map((item, index) => {
            const grupo =
              normalizeGrupo(
                item?.grupo ?? item
              );

            if (grupo == null) {
              return null;
            }

            return {
              position: Number(
                item?.position ??
                  index + 1
              ),
              grupo,
              milhar: normalizeMilhar(
                item?.milhar ?? ""
              ),
              animal: String(
                item?.animal ?? ""
              ).trim(),
            };
          })
          .filter(Boolean)
      : extractTop5Groups(
          resultSource
        );

  const resultGroups =
    officialPrizes.map(
      (item) => item.grupo
    );

  const resultSet =
    new Set(resultGroups);

  const matchedGroups =
    picks.filter((grupo) =>
      resultSet.has(grupo)
    );

  const missingGroups =
    picks.filter(
      (grupo) =>
        !resultSet.has(grupo)
    );

  const matchedPrizes =
    officialPrizes.filter(
      (item) =>
        picks.includes(item.grupo)
    );

  const predictionValid =
    picks.length ===
    TERNO_GRUPO_PICK_COUNT;

  const resultValid =
    officialPrizes.length ===
    TERNO_GRUPO_RESULT_PRIZE_COUNT;

  const hit =
    predictionValid &&
    resultValid &&
    matchedGroups.length ===
      TERNO_GRUPO_PICK_COUNT;

  return {
    engineVersion:
      TERNO_GRUPO_ENGINE_VERSION,

    status:
      !predictionValid
        ? "invalid_prediction"
        : !resultValid
          ? "pending_result"
          : hit
            ? "hit"
            : "miss",

    hit,
    score: hit ? 100 : 0,

    predictionValid,
    resultValid,

    picks,
    resultGroups,

    matchedGroups,
    missingGroups,
    matchedCount:
      matchedGroups.length,

    matchedPrizes,
    officialPrizes,
  };
}
