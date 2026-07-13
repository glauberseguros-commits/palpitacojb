import { buildMilharAudit }
from "../../../Centenas/modules/milharProbabilityEngine";

/*
Camada de adaptação entre o Engine Center
e o motor de probabilidades.

A interface do Admin nunca deve consumir
buildMilharAudit diretamente.
*/

export function loadMilharEngineAudit(args = {}) {
  const audit = buildMilharAudit(args);

  return {
    ok: audit.ok,
    status: audit.status,

    model: audit.model,

    centena: audit.centena,

    milhar: audit.selectedMilhar,

    prefixo: audit.selectedPrefixo,

    score: audit.score,

    confidence: audit.confidence,

    sample: audit.sample,

    winner: audit.winner,

    runnerUp: audit.runnerUp,

    ranking: audit.ranking,

    alternatives: audit.alternatives,

    weights: audit.weights,
  };
}
