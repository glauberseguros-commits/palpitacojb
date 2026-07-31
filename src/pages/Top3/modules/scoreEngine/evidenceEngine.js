import { buildFrequencyEvidence } from "./frequencyEvidence";
import { buildContextEvidence } from "./contextEvidence";

/**
 * Evidence Engine
 *
 * Centraliza os módulos de evidência.
 *
 * Cada módulo produz fatos; nenhum módulo decide isoladamente
 * o resultado do ranking.
 */

const MODULES = {
  frequency: buildFrequencyEvidence,
  context: buildContextEvidence,
};

function normalizeWeight(value) {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return 1;
  }

  return n;
}

function isValidEvidence(result) {
  if (!result || typeof result !== "object") {
    return false;
  }

  if (result.error) {
    return false;
  }

  if (!result.module) {
    return false;
  }

  const value = Number(result.value);

  return Number.isFinite(value) && value > 0;
}

function collectEvidence({
  item = {},
  context = {},
  config = {},
} = {}) {
  const evidence = [];
  const errors = [];

  const enabled =
    config && typeof config.evidenceModules === "object"
      ? config.evidenceModules
      : {};

  for (const [name, builder] of Object.entries(MODULES)) {
    const moduleConfig = enabled[name] || {};

    if (!moduleConfig.enabled) {
      continue;
    }

    try {
      const result = builder(
        item,
        context,
        moduleConfig
      );

      if (!result) {
        continue;
      }

      const enriched = {
        ...result,
        module: result.module || name,
        weight: normalizeWeight(moduleConfig.weight),
      };

      if (isValidEvidence(enriched)) {
        evidence.push(enriched);
      }
    } catch (err) {
      errors.push({
        module: name,
        error: true,
        message:
          err && err.message
            ? err.message
            : String(err),
      });
    }
  }

  return {
    count: evidence.length,

    modules: evidence.map(
      (entry) => entry.module
    ),

    evidence,

    errors,
  };
}

export {
  collectEvidence,
};