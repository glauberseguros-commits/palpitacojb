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

// (mantendo como você tinha)
export const PT_RIO_SCHEDULE_WED_SAT = PT_RIO_SCHEDULE_NORMAL;

// Federal: qua/sáb 20h
export const FEDERAL_SCHEDULE = ["20:00"];

