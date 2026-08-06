/**
 * TOP3 PRODUCTION PROFILE MATRIX — BASELINE V2
 *
 * A loteria-alvo continua determinando:
 * - histórico;
 * - calendário;
 * - sorteio-alvo;
 * - resultados oficiais;
 * - persistência.
 *
 * Esta matriz altera somente a lotteryKey entregue ao cálculo
 * das novas previsões do TOP3.
 */

export const TOP3_PRODUCTION_PROFILE_MATRIX_VERSION =
  "TOP3_PRODUCTION_PROFILE_MATRIX_BASELINE_V2";

export const TOP3_PRODUCTION_PROFILE_BY_TARGET =
  Object.freeze({
    PT_RIO: "FEDERAL",
    FEDERAL: "LOOK",
    LOOK: "LOOK",
    NACIONAL: "LOOK",
  });

function normalizeLotteryKey(value) {
  const key = String(value || "")
    .trim()
    .toUpperCase();

  if (key === "RJ" || key === "RIO") {
    return "PT_RIO";
  }

  return key;
}

export function resolveTop3ProductionProfileLotteryKey(
  targetLotteryKey
) {
  const target =
    normalizeLotteryKey(targetLotteryKey);

  return (
    TOP3_PRODUCTION_PROFILE_BY_TARGET[target] ||
    target
  );
}

export function getTop3ProductionProfileAssignment(
  targetLotteryKey
) {
  const target =
    normalizeLotteryKey(targetLotteryKey);

  const profile =
    resolveTop3ProductionProfileLotteryKey(target);

  return Object.freeze({
    version:
      TOP3_PRODUCTION_PROFILE_MATRIX_VERSION,

    targetLotteryKey:
      target,

    profileLotteryKey:
      profile,

    crossed:
      target !== profile,
  });
}

export default {
  version:
    TOP3_PRODUCTION_PROFILE_MATRIX_VERSION,

  matrix:
    TOP3_PRODUCTION_PROFILE_BY_TARGET,

  resolveTop3ProductionProfileLotteryKey,
  getTop3ProductionProfileAssignment,
};
