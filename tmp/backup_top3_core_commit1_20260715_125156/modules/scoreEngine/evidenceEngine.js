"use strict";

import { buildFrequencyEvidence } from "./frequencyEvidence";
import { buildContextEvidence } from "./contextEvidence";

/**
 * Evidence Engine
 *
 * Centraliza todos os módulos de evidência.
 * Cada módulo produz fatos; nenhum decide o resultado.
 */

const MODULES = {
  frequency: buildFrequencyEvidence,
  context: buildContextEvidence,
};

function collectEvidence({
  item = {},
  context = {},
  config = {},
} = {}) {

  const evidence = [];
  const enabled = config.evidenceModules || {};

  for (const [name, builder] of Object.entries(MODULES)) {

    if (!enabled[name]?.enabled) {
      continue;
    }

    try {

      const result = builder(item, context);

      if (result) {
        evidence.push(result);
      }

    } catch (err) {

      evidence.push({
        module: name,
        error: true,
        message: err.message,
      });

    }

  }

  return {

    count: evidence.filter(e => !e.error).length,

    modules: evidence
      .filter(e => !e.error)
      .map(e => e.module),

    evidence,

  };

}

export {
collectEvidence,
};
