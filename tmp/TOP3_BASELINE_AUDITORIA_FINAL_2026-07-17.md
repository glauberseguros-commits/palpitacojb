# BASELINE OFICIAL — TOP3 V3

Data: 2026-07-17

## Status da Auditoria

Status: CONCLUÍDA

Nenhuma alteração foi realizada no algoritmo.
Nenhum peso foi alterado.
Nenhum commit foi realizado.
Nenhum deploy foi realizado.

---

## Fluxo validado

backtestTop3Official
    ↓
computeStatisticalTop3V3
    ↓
scoreRanking
    ↓
scoreItem
    ↓
collectEvidence
    ↓
frequencyEvidence
contextEvidence

Fluxo confirmado integralmente.

---

## Score Engine V2

Confirmado:

- scoreRanking é executado.
- scoreItem é executado.
- collectEvidence é executado.
- frequencyEvidence é executado.
- contextEvidence é executado.

---

## Ranking

Ordem utilizada:

1. score
2. confidence
3. scoreProb

Confirmado.

---

## Resultado da auditoria

A camada de evidências é executada.

Entretanto, na baseline atual, não apresenta poder discriminatório suficiente para alterar a ordenação produzida por scoreProb.

Os backtests históricos realizados durante a auditoria mostraram rankings equivalentes ao ranking probabilístico.

---

## Contrato público

computeStatisticalTop3V3 retorna:

{
    top,
    meta
}

---

## Próxima fase

A partir desta baseline, toda evolução deverá obedecer ao seguinte princípio:

"Nenhuma alteração será incorporada ao projeto sem demonstrar melhoria estatisticamente significativa sobre esta baseline."

Esta baseline passa a ser a referência oficial para futuras evoluções do TOP3.

