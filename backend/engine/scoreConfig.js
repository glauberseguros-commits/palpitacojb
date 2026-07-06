"use strict";

/**
 * Score Engine V2
 *
 * Configuração central do mecanismo de pontuação.
 * Cada módulo produz evidências independentes.
 */

module.exports = {

  version: "2.2.0",

  evidenceModules: {

    frequency: {
      enabled: true,
      weight: 1.00,
      description: "Frequência histórica."
    },

    context: {
      enabled: true,
      weight: 0.80,
      description: "Contexto do sorteio."
    },

    delay: {
      enabled: false,
      weight: 0.90,
      description: "Tempo desde a última ocorrência."
    },

    sequence: {
      enabled: false,
      weight: 0.80,
      description: "Sequências históricas."
    },

    history: {
      enabled: false,
      weight: 0.90,
      description: "Cenários históricos semelhantes."
    },

    weekday: {
      enabled: false,
      weight: 0.60,
      description: "Dia da semana."
    },

    hour: {
      enabled: false,
      weight: 0.70,
      description: "Horário do sorteio."
    },

    cycle: {
      enabled: false,
      weight: 0.85,
      description: "Ciclos estatísticos."
    },

    patterns: {
      enabled: false,
      weight: 0.75,
      description: "Padrões identificados."
    }

  },

  confidence: {

    excellent: 90,

    high: 75,

    medium: 60,

    low: 40,

  },

  scoring: {

    maxScore: 100,

    normalize: true,

    minimumEvidence: 2,

  },

  learning: {

    enabled: false,

    autoAdjust: false,

  }

};
