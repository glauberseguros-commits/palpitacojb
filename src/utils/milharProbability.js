/*
==========================================================
Motor probabilístico de Milhar
==========================================================

Objetivo

Receber uma centena (025, 326, 947...)

Avaliar os 10 prefixos possíveis

0025
1025
2025
...
9025

e retornar um ranking ordenado por score.

Nesta primeira versão o arquivo é apenas a infraestrutura.
A lógica estatística será implementada na próxima etapa.

*/

export function buildMilharCandidates(centena) {

  const c = String(centena ?? "")
    .replace(/\D/g, "")
    .slice(-3)
    .padStart(3, "0");

  return Array.from({ length: 10 }, (_, prefix) => ({
    prefix: String(prefix),
    milhar: `${prefix}${c}`,
    score: 0,
    evidence: {},
  }));
}

export function rankMilharCandidates(candidates = []) {
  return [...candidates].sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) {
      return (b.score || 0) - (a.score || 0);
    }

    return a.milhar.localeCompare(b.milhar);
  });
}



/*
==========================================================
Auditoria do ranking de milhares
==========================================================

Esta função ainda NÃO usa estatística.

Ela apenas gera o ranking inicial das 10 milhares
para permitir auditoria e futura calibração.

A próxima etapa substituirá score=0
pelos cálculos probabilísticos.
*/

export function auditMilharRanking(args = {}) {

  const {
    centena = "",
  } = args;

  const result = chooseBestMilhar(centena);

  return {
    centena: String(centena).padStart(3,"0"),
    winner: result.winner,
    ranking: result.ranking.map((item, index) => ({
      posicao: index + 1,
      ...item,
    })),
  };
}


export function chooseBestMilhar(centena) {

  const ranking = rankMilharCandidates(
    buildMilharCandidates(centena)
  );

  return {
    winner: ranking[0] || null,
    ranking,
  };
}
