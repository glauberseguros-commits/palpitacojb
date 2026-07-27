// src/pages/Top3/top3.public-api.js
//
// Contrato público e estável do núcleo TOP3.
//
// Regras:
// - não contém lógica própria;
// - não acessa navegador, React, Firebase ou armazenamento;
// - não expõe helpers internos do motor;
// - deve ser o único ponto de entrada compartilhado por consumidores externos.

export {
  // Predição principal
  computeConditionalNextTop3,
  computeConditionalNextTop3V2,
  computeStatisticalTop3V3,

  // Timeline e auditoria
  buildTimelineTop3,
  auditTop3Timeline,
  auditTop3Backtest,

  // Milhares
  buildMilharesForGrupo,
  build16MilharesForGrupo,
  build20MilharesForGrupo,

  // Agenda e slots
  getScheduleForLottery,
  getPtRioScheduleForYmd,
  getNextSlotForLottery,
  isFederalDrawDay,
  isHourInSchedule,
  scheduleSet,

  // Normalização e leitura de resultados
  pickDrawHour,
  pickDrawYMD,
  pickPrize1GrupoFromDraw,
  guessPrizeGrupo,
  guessPrizePos,

  // Índices e utilitários públicos
  indexDrawsByYmdHour,
  computeLastSeenByGrupo,
  countAparicoesByGrupoInDraw,
} from "./top3.engine";

export {
  scoreRanking,
  scoreItem,
  calculateEvidenceStrength,
} from "./modules/scoreEngine/scoreEngineV2";

export {
  collectEvidence,
} from "./modules/scoreEngine/evidenceEngine";

export {
  buildContextEvidence,
} from "./modules/scoreEngine/contextEvidence";

export {
  buildFrequencyEvidence,
} from "./modules/scoreEngine/frequencyEvidence";
