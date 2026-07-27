"use strict";

/**
 * Hypothesis Engine V2
 *
 * Responsabilidade:
 * Criar hipóteses estruturadas para serem avaliadas
 * pelo HistoricalQueryEngine e posteriormente
 * pontuadas pelo ScoreEngineV2.
 */

function normalize(value) {
    return value == null ? null : value;
}

function buildHypothesis({
    id = null,
    name,
    priority = 0,
    target = {},
    filters = {},
    context = {},
    evidences = [],
    metadata = {},
} = {}) {

    return {

        id,

        name: name || "Unnamed hypothesis",

        priority: Number(priority) || 0,

        target: {

            animal: normalize(target.animal),

            grupo: normalize(target.grupo),

            dezena: normalize(target.dezena),

            centena: normalize(target.centena),

            milhar: normalize(target.milhar),

        },

        filters: {

            ...filters,

        },

        context: {

            ...context,

        },

        evidences: Array.isArray(evidences)
            ? evidences
            : [],

        metadata: {

            ...metadata,

        },

        statistics: {

            drawsAnalyzed: 0,

            occurrences: 0,

            hits: 0,

            percentage: 0,

            confidence: 0,

            score: 0,

        },

        status: "pending",

        createdAt: null,

        updatedAt: null,

    };

}

module.exports = {

    buildHypothesis,

};
