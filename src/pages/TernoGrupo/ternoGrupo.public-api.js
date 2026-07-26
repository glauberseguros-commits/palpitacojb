/**
 * Contrato público do motor independente
 * Terno de Grupo.
 */

export {
  TERNO_GRUPO_ENGINE_VERSION,
  TERNO_GRUPO_PICK_COUNT,
  TERNO_GRUPO_RESULT_PRIZE_COUNT,
  extractGrupoFromPrize,
  extractTop5Groups,
  normalizeTernoGrupoPicks,
  buildTernoGrupoPrediction,
  analyzeTernoGrupoHit,
} from "./ternoGrupo.engine";
