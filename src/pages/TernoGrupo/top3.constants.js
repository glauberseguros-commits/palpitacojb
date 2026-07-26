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

export const LOTTERY_OPTIONS = [
  { key: "PT_RIO", value: "PT_RIO", label: "RJ (PT_RIO)" },
  { key: "FEDERAL", value: "FEDERAL", label: "Federal" },
  { key: "LOOK", value: "LOOK", label: "LOOK" },
  { key: "NACIONAL", value: "NACIONAL", label: "Nacional" },
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

export const PT_RIO_SCHEDULE_SUNDAY = [
  "09:00",
  "11:00",
  "14:00",
  "16:00",
];

/**
 * PT_RIO em QUA/SÁB (RJ)
 * Mantém 18:00 porque existem ocorrências históricas nesse horário.
 * A ausência eventual do sorteio deve ser tratada pelo motor/dados reais,
 * não pela exclusão rígida da grade.
 */
export const PT_RIO_SCHEDULE_WED_SAT = [
  "09:00",
  "11:00",
  "14:00",
  "16:00",
  "18:00",
  "21:00",
];

// Federal: travado em 20h
export const FEDERAL_SCHEDULE = ["20:00"];

export const LOOK_SCHEDULE = [
  "07:00",
  "09:00",
  "11:00",
  "14:00",
  "16:00",
  "18:00",
  "21:00",
  "23:00",
];

export const NACIONAL_SCHEDULE = [
  "02:00",
  "08:00",
  "10:00",
  "12:00",
  "15:00",
  "17:00",
  "21:00",
  "23:00",
];

/* =========================
   Parâmetros do motor TOP3
========================= */

export const TOP3_SMOOTH_ALPHA = 1;
export const TOP3_SHRINK_M = 40;

export const TOP3_NEXTDRAW_SCAN_MAX_STEPS = 18;
export const TOP3_NEXTDRAW_SCAN_MAX_DAYS = 7;

export const TOP3_GROUPS_K = 25;

/* =========================
   Calibração Estatística
========================= */

export const TOP3_SCENE_WEIGHT = 0.06;
export const TOP3_SCENE_SAMPLE_TARGET = 60;
export const TOP3_SCENE_BLEND_SCENE = 0.55;
export const TOP3_SCENE_BLEND_UNIFORM = 0.45;
