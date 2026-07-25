// src/shared/predictiveMilharEngine/index.js

/*
 * Contrato compartilhado do motor de milhar.
 *
 * Etapa estrutural:
 * - não altera regras;
 * - não altera pesos;
 * - não altera resultados;
 * - não altera o motor preditivo de grupos do Top3.
 *
 * O módulo preserva temporariamente os comportamentos dos motores V2 e V3
 * enquanto os consumidores são migrados de forma independente.
 */

export {
  normalizeCentena3,
  normalizeMilhar4,
  pickMilharFromPrize,
  buildMilharCandidates,
  rankMilharCandidates,
  chooseBestMilhar,
  buildMilharRecommendation,
  diversifyMilharRecommendations,
  buildMilharAudit,
} from "../../pages/Centenas/modules/milharProbabilityEngine";

export {
  buildMilharRecommendationV3,
  diversifyMilharRecommendationsV3,
} from "../../pages/Centenas/modules/milharProbabilityEngineV3";

export const PREDICTIVE_MILHAR_ENGINE_CONTRACT =
  "PREDICTIVE_MILHAR_ENGINE_SHARED_V1";
