/**
 * Context Evidence V2
 *
 * O contexto atual é apenas descritivo.
 *
 * Como os mesmos dados contextuais são entregues a todos os grupos,
 * esse módulo não possui capacidade discriminatória suficiente para
 * alterar o ranking.
 *
 * Ele permanece disponível na arquitetura, mas não produz evidência
 * pontuável enquanto não houver uma relação específica entre o grupo
 * candidato e o contexto histórico.
 */

function normalize(value) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function buildContextEvidence(
  item = {},
  context = {}
) {
  const grupo = normalize(
    item.grupo ??
    item.group
  );

  const evidence = {
    grupo,

    lotteryKey:
      context.lotteryKey ||
      null,

    ymd:
      context.ymd ||
      context.targetYmd ||
      null,

    weekday:
      context.weekday ||
      null,

    closeHour:
      context.hour ||
      context.targetHour ||
      null,

    prize:
      normalize(context.prize),

    previousAnimal:
      context.previousAnimal ||
      null,

    previousGroup:
      normalize(context.previousGroup),

    previousHour:
      context.previousHour ||
      null,

    lookback:
      normalize(context.lookback),

    window:
      normalize(context.window),

    totalDraws:
      normalize(context.totalDraws),
  };

  return {
    module: "context",

    value: 0,

    informational: true,

    evidence,

    reasons: [
      "Contexto disponível apenas como metadado.",
      "Sem contribuição ao score por não diferenciar os grupos candidatos.",
    ],
  };
}

export {
  buildContextEvidence,
};