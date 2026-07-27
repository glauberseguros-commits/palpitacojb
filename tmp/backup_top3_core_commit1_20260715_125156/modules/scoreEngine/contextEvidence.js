"use strict";

/**
 * Context Evidence V2
 *
 * Responsabilidade:
 * Produzir evidências do contexto do sorteio.
 * Não calcula score.
 */

function normalize(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function buildReasons(ctx) {

    const reasons = [];

    reasons.push("Contexto histórico identificado.");

    if (ctx.lotteryKey)
        reasons.push(`Loteria: ${ctx.lotteryKey}`);

    if (ctx.weekday)
        reasons.push(`Dia da semana: ${ctx.weekday}`);

    if (ctx.closeHour)
        reasons.push(`Horário: ${ctx.closeHour}`);

    if (ctx.previousGroup != null)
        reasons.push(`Grupo anterior: ${ctx.previousGroup}`);

    if (ctx.previousAnimal)
        reasons.push(`Animal anterior: ${ctx.previousAnimal}`);

    return reasons;
}

function buildContextEvidence(item = {}, context = {}) {

    const evidence = {

        lotteryKey: context.lotteryKey || null,

        ymd: context.ymd || null,

        weekday: context.weekday || null,

        closeHour: context.hour || null,

        prize: normalize(context.prize),

        previousAnimal: context.previousAnimal || null,

        previousGroup: normalize(context.previousGroup),

        previousHour: context.previousHour || null,

        lookback: normalize(context.lookback),

        window: normalize(context.window),

    };

    return {

        module: "context",

        value: 1,

        evidence,

        reasons: buildReasons(evidence),

    };

}

export {
buildContextEvidence,
};
