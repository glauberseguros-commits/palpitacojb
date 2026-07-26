import {
  buildTernoGrupoPrediction,
  TERNO_GRUPO_ENGINE_VERSION,
} from "../ternoGrupo.public-api";

function clampProb(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return 0;

  if (number > 1) {
    return Math.max(0, Math.min(1, number / 100));
  }

  return Math.max(0, Math.min(1, number));
}

function resolveProbability(item, resolveProbValue) {
  if (typeof resolveProbValue === "function") {
    return clampProb(resolveProbValue(item));
  }

  return clampProb(
    item?.displayConfidence ??
      item?.confidence ??
      item?.scoreProb ??
      item?.prob ??
      0
  );
}

/**
 * Adaptador entre o motor independente do Terno de Grupo
 * e a interface ainda herdada da TOP3.
 *
 * Nesta fase:
 * - a seleção dos três grupos passa pelo motor Terno de Grupo;
 * - milhares permanecem somente por compatibilidade visual temporária;
 * - a identificação do motor já é independente.
 */
export function buildTernoGrupoPredictions({
  analytics,
  build20,
  safeStr,
  getAnimalLabel,
  build4ColsFromEngineOut,
  resolveProbValue,
  getGrupoImgSrc,
  buildResultStyleImgVariants,
}) {
  const prediction = buildTernoGrupoPrediction({
    analytics,
  });

  if (!prediction.valid) {
    return [];
  }

  return prediction.items.map((item, index) => {
    const grupo = Number(item?.grupo);
    const animal = safeStr(getAnimalLabel(grupo) || "");

    const engineOutput =
      typeof build20 === "function"
        ? build20(grupo, item)
        : null;

    const milharesCols =
      typeof build4ColsFromEngineOut === "function"
        ? build4ColsFromEngineOut(engineOutput, 4, 5)
        : [];

    const milhares20 = milharesCols
      .flatMap((column) =>
        Array.isArray(column?.items) ? column.items : []
      )
      .filter(Boolean)
      .slice(0, 20);

    const prob = resolveProbability(
      item,
      resolveProbValue
    );

    const imgBg =
      typeof getGrupoImgSrc === "function"
        ? getGrupoImgSrc(grupo, 512)
        : "";

    const imgIcon =
      typeof buildResultStyleImgVariants === "function"
        ? buildResultStyleImgVariants(grupo, 96)
        : [];

    return {
      ...item,
      rank: index + 1,
      grupo,
      animal,
      prob,
      probPct: prob * 100,
      milharesCols,
      milhares20,
      imgBg: imgBg ? [imgBg] : [],
      imgIcon,
      meta: {
        ...(item?.meta || {}),
        engineVersion: TERNO_GRUPO_ENGINE_VERSION,
        predictionType: "TERNO_GRUPO",
        validationRule: "3_GROUPS_IN_TOP5",
        orderMatters: false,
      },
    };
  });
}
