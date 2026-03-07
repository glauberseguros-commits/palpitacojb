// src/pages/Top3/top3.constants.js

export const LOOKBACK_ALL = "ALL";

export const LOOKBACK_OPTIONS = [
  { value: LOOKBACK_ALL, label: "Todos" },
  { value: 180, label: "180 dias" },
  { value: 150, label: "150 dias" },
  { value: 120, label: "120 dias" },
  { value: 90, label: "90 dias" },
  { value: 60, label: "60 dias" },
  { value: 30, label: "30 dias" },
  { value: 21, label: "21 dias" },
  { value: 14, label: "14 dias" },
  { value: 7, label: "7 dias" },
];

/**
 * LOTTERY_OPTIONS (compat)
 * - Alguns UIs esperam { value, label }
 * - Outros esperam { key, label }
 * => entregamos os dois campos para evitar "sumir aba"
 */
export const LOTTERY_OPTIONS = [
  { key: "PT_RIO", value: "PT_RIO", label: "RJ (PT_RIO)" },
  { key: "FEDERAL", value: "FEDERAL", label: "Federal" },
];

// Grades
export const PT_RIO_SCHEDULE_NORMAL = [
  "09:00",
  "11:00",
  "14:00",
  "16:00",
  "18:00",
  "21:00",
];

/**
 * PT_RIO em QUA/SÁB (RJ)
 * ATENÇÃO:
 * - aqui o 18:00 foi removido por regra operacional atual do projeto
 * - se a análise histórica incluir períodos em que houve 18h em qua/sáb,
 *   essa constante pode distorcer o motor e deve ser revista
 */
export const PT_RIO_SCHEDULE_WED_SAT = [
  "09:00",
  "11:00",
  "14:00",
  "16:00",
  "21:00",
];

// Federal: travado em 20h
export const FEDERAL_SCHEDULE = ["20:00"];

/* =========================
   Parâmetros do motor TOP3
========================= */

/**
 * OBS:
 * Estes parâmetros só têm efeito se forem realmente usados no motor.
 * Se o engine não aplicar smoothing/shrinkage, eles são apenas declarativos.
 */

// Suavização Laplace/Dirichlet
export const TOP3_SMOOTH_ALPHA = 1;

// Mistura Condicional vs Base do horário
export const TOP3_SHRINK_M = 40;

// Busca do "próximo sorteio real" quando o slot da grade não existe na base
export const TOP3_NEXTDRAW_SCAN_MAX_STEPS = 18;
export const TOP3_NEXTDRAW_SCAN_MAX_DAYS = 7;

// Quantos grupos existem (Jogo do Bicho = 25)
export const TOP3_GROUPS_K = 25;