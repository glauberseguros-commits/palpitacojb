"use strict";

const scoreConfig = {
  version: "2.2.0",

  evidenceModules: {
    frequency: {
      enabled: true,
      weight: 1.0,
      description: "Frequência histórica."
    },

    context: {
      enabled: true,
      weight: 0.8,
      description: "Contexto do sorteio."
    },

    delay: {
      enabled: false,
      weight: 0.9,
      description: "Tempo desde a última ocorrência."
    },

    sequence: {
      enabled: false,
      weight: 0.8,
      description: "Sequências históricas."
    },

    history: {
      enabled: false,
      weight: 0.9,
      description: "Cenários históricos semelhantes."
    },

    weekday: {
      enabled: false,
      weight: 0.6,
      description: "Dia da semana."
    },

    hour: {
      enabled: false,
      weight: 0.7,
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
    low: 40
  },

  scoring: {
    maxScore: 100,
    normalize: true,
    minimumEvidence: 2
  },

  learning: {
    enabled: false,
    autoAdjust: false
  }
};

export default scoreConfig;
