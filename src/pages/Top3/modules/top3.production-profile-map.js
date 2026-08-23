/**
 * TOP3 PRODUCTION PROFILE MATRIX — PT_RIO NATIVE V3
 *
 * A loteria-alvo continua determinando:
 * - histórico;
 * - calendário;
 * - sorteio-alvo;
 * - resultados oficiais;
 * - persistência.
 *
 * PT_RIO passa a usar sua própria identidade no cálculo.
 *
 * Esta correção não altera os demais mapeamentos da matriz.
 * FEDERAL, LOOK e NACIONAL serão tratados separadamente
 * em suas próprias etapas de auditoria e calibração.
 */

export const TOP3_PRODUCTION_PROFILE_MATRIX_VERSION =
  "TOP3_PRODUCTION_PROFILE_MATRIX_PT_RIO_NATIVE_V3";

export const TOP3_PRODUCTION_PROFILE_BY_TARGET =
  Object.freeze({
    PT_RIO: "PT_RIO",
    FEDERAL: "LOOK",
    LOOK: "LOOK",
    NACIONAL: "NACIONAL",
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
