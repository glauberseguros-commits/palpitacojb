/**
 * Schedule oficial do PalPitaco (FRONT)
 * Fonte única de horários por loteria
 * ⚠️ NÃO deixar este arquivo vazio
 */

export const SCHEDULES = {
  PT_RIO: [
    "09:00",
    "11:00",
    "14:00",
    "16:00",
    "18:00",
    "21:00",
  ],
  FEDERAL: [
    "20:00",
  ],
};

/**
 * Retorna os horários da loteria
 */
export function getScheduleByLottery(lottery = "PT_RIO") {
  const key = String(lottery || "PT_RIO").toUpperCase();
  return Array.isArray(SCHEDULES[key]) ? [...SCHEDULES[key]] : [];
}

/**
 * Retorna todos os horários conhecidos (flat)
 */
export function getAllScheduleHours() {
  return Array.from(
    new Set(
      Object.values(SCHEDULES).flat()
    )
  ).sort();
}
