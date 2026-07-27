/**
 * Schedule oficial do PalPitaco (FRONT)
 * Fonte única de horários por loteria
 * ⚠️ NÃO deixar este arquivo vazio
 */

function normalizeLotteryKey(v) {
  const s = String(v || "").trim().toUpperCase();

  if (s === "RJ") return "PT_RIO";
  if (s === "RIO") return "PT_RIO";
  if (s === "PT-RIO") return "PT_RIO";
  if (s === "PT_RIO") return "PT_RIO";

  if (s === "FED") return "FEDERAL";
  if (s === "BR") return "FEDERAL"; // compat defensiva
  if (s === "FEDERAL") return "FEDERAL";

  if (s === "LOOK") return "LOOK";
  if (s === "GO") return "LOOK";

  if (s === "NACIONAL") return "NACIONAL";
  if (s === "LT_NACIONAL") return "NACIONAL";
  if (s === "LT-NACIONAL") return "NACIONAL";

  return "PT_RIO"; // fallback seguro
}

function isValidHourFormat(h) {
  return /^\d{2}:\d{2}$/.test(String(h || "").trim());
}

function sortHoursAsc(arr) {
  return [...arr].sort((a, b) => {
    const [ha, ma] = a.split(":").map(Number);
    const [hb, mb] = b.split(":").map(Number);
    return ha * 60 + ma - (hb * 60 + mb);
  });
}

export const SCHEDULES = Object.freeze({
  PT_RIO: Object.freeze([
    "09:00",
    "11:00",
    "14:00",
    "16:00",
    "18:00",
    "21:00",
  ]),
  FEDERAL: Object.freeze([
    "20:00",
  ]),
  LOOK: Object.freeze([
    "07:00",
    "09:00",
    "11:00",
    "14:00",
    "16:00",
    "18:00",
    "21:00",
    "23:00",
  ]),
  NACIONAL: Object.freeze([
    "02:00",
    "08:00",
    "10:00",
    "12:00",
    "15:00",
    "17:00",
    "21:00",
    "23:00",
  ]),
});

/**
 * Retorna os horários da loteria (normalizado e seguro)
 */
export function getScheduleByLottery(lottery = "PT_RIO") {
  const key = normalizeLotteryKey(lottery);

  const list = SCHEDULES[key];
  if (!Array.isArray(list)) return [];

  // Filtra formato inválido por segurança
  return sortHoursAsc(list.filter(isValidHourFormat));
}

/**
 * Retorna todos os horários conhecidos (flat + únicos + ordenados corretamente)
 */
export function getAllScheduleHours() {
  const all = Object.values(SCHEDULES)
    .flat()
    .filter(isValidHourFormat);

  return sortHoursAsc(Array.from(new Set(all)));
}

/**
 * Helper opcional:
 * Verifica se horário pertence à loteria
 */
export function isValidLotteryHour(lottery, hour) {
  const list = getScheduleByLottery(lottery);
  return list.includes(String(hour || "").trim());
}