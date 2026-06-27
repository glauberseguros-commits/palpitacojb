// src/services/king/king.draws.js
// Responsável pela leitura e preparação de sorteios.
// Próxima etapa: mover para cá queryDrawsByField, fetchDrawDocsPreferUf,
// fetchDrawsDayNoPrizes e funções relacionadas à busca de draws.

export const KING_DRAWS_MODULE_READY = true;

// ======================================================
// Próxima migração
// ======================================================
//
// Módulo destinado a concentrar:
//
// - queryDrawsByField()
// - fetchDrawDocsPreferUf()
// - fetchDrawsDayNoPrizes()
// - probeRecentMaxYmd()
// - fetchBoundsFromApi()
// - buildUfWhereClauses()
// - buildRJLockWhereIfNeeded()
//
// Nesta etapa nenhuma função é movida.
// Apenas documentamos a responsabilidade do módulo.

