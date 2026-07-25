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
 * O módulo preserva temporariamente o comportamento do motor V2
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

export const PREDICTIVE_MILHAR_ENGINE_CONTRACT =
  "PREDICTIVE_MILHAR_ENGINE_SHARED_V1";
