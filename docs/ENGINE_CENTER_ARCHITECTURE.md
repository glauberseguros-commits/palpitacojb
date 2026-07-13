
# PALPITACO JB
# ENGINE CENTER
## Arquitetura Técnica

---

# Objetivo

Separar definitivamente:

- Interface do usuário
- Ferramentas internas de engenharia

Nenhuma informação técnica será exibida ao usuário final.

---

# Camadas

## 1. Usuário

Dashboard

Top3

Centenas

Resultados

Busca

Downloads

Conta

---

## 2. Admin

Dashboard Técnico

Auditorias

Backtests

Logs

Comparadores

Integridade

---

## 3. Engines

### Motor Dashboard

Responsável pelo ranking.

---

### Motor Centenas

Responsável pelas 40 centenas.

---

### Motor Milhares

Responsável pelo prefixo probabilístico.

Modelo atual:

MILHAR_PROBABILITY_V2

---

### Motor TOP3

Responsável pelas previsões TOP3.

---

### Score Engine

Motor estatístico comum.

---

# Auditorias

Cada Engine possuirá:

Status

Versão

Base utilizada

Tempo processamento

Quantidade de sorteios

Precisão histórica

Backtests

Logs

Comparador entre versões

---

# Filosofia

O usuário recebe apenas:

Resultado.

O Engine Center mostra:

Como o resultado foi produzido.

