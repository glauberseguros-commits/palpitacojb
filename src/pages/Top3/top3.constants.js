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
  { value: "PT_RIO", label: "PT_RIO (RJ)" },
  { value: "FEDERAL", label: "FEDERAL" },
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

// ✅ Se no seu projeto PT_RIO tiver horários diferentes em qua/sáb,
// substitua aqui. Por ora, mantém igual ao normal (blindado contra mutação).
export const PT_RIO_SCHEDULE_WED_SAT = [...PT_RIO_SCHEDULE_NORMAL];

// Federal: travado em 20h (consistente com UX e regra do app)
export const FEDERAL_SCHEDULE = ["20:00"];

/* =========================
   ✅ Parâmetros do motor TOP3
   (controle central)
========================= */

// Suavização Laplace/Dirichlet: evita 0.00% e estabiliza
export const TOP3_SMOOTH_ALPHA = 1; // 0.5 ou 1 é ótimo

// Mistura (shrinkage) Condicional vs Base do horário
// w = samples / (samples + M)
export const TOP3_SHRINK_M = 40;

// Busca do "próximo sorteio real" quando o slot da grade não existe na base
// varre próximos slots/dias até achar um draw existente
export const TOP3_NEXTDRAW_SCAN_MAX_STEPS = 18; // ✅ mais robusto contra buracos/slots "quebrados"
export const TOP3_NEXTDRAW_SCAN_MAX_DAYS = 7; // limite de segurança

// Quantos grupos existem (Jogo do Bicho = 25)
export const TOP3_GROUPS_K = 25;