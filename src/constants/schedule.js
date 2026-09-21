/**
 * Schedule oficial do PalPitaco (FRONT)
 * Fonte única de horários por loteria
 * ⚠️ NÃO deixar este arquivo vazio
 */

/*
 * SCHEDULE_16_OPERATIONAL_V1
 *
 * Normalização compartilhada do calendário operacional.
 *
 * CAPITAL permanece fora até a fonte atual ser validada.
 */
function normalizeLotteryKey(v) {
  const raw =
    String(v || "")
      .trim()
      .toUpperCase();

  if (!raw) {
    return "";
  }

  const normalized =
    raw
      .replace(/\s+/g, " ")
      .replace(/[\s-]+/g, "_");

  if (
    [
      "RJ",
      "RIO",
      "PT_RIO",
    ].includes(normalized)
  ) {
    return "PT_RIO";
  }

  if (
    [
      "FED",
      "FEDERAL",
      "BR",
    ].includes(normalized)
  ) {
    return "FEDERAL";
  }

  if (
    [
      "SP",
      "PT_SP",
    ].includes(normalized)
  ) {
    return "PT_SP";
  }

  if (
    [
      "LOOK",
      "GO",
    ].includes(normalized)
  ) {
    return "LOOK";
  }

  if (
    [
      "NACIONAL",
      "LT_NACIONAL",
    ].includes(normalized)
  ) {
    return "NACIONAL";
  }

  if (
    [
      "MALUCA_FEDERAL",
      "MALUQUINHA_FEDERAL",
    ].includes(normalized)
  ) {
    return "MALUCA_FEDERAL";
  }

  if (
    [
      "MALUQUINHA_RIO",
      "MALUCA_RIO",
    ].includes(normalized)
  ) {
    return "MALUQUINHA_RIO";
  }

  if (
    [
      "BOA_SORTE",
      "BOASORTE",
    ].includes(normalized)
  ) {
    return "BOA_SORTE";
  }

  if (
    normalized ===
    "LOTEP"
  ) {
    return "LOTEP";
  }

  if (
    normalized ===
    "LOTECE"
  ) {
    return "LOTECE";
  }

  if (
    normalized ===
    "BAHIA"
  ) {
    return "BAHIA";
  }

  if (
    [
      "BA_MALUCA",
      "BAHIA_MALUCA",
    ].includes(normalized)
  ) {
    return "BA_MALUCA";
  }

  if (
    normalized ===
    "MINAS"
  ) {
    return "MINAS";
  }

  if (
    normalized ===
    "SORTE"
  ) {
    return "SORTE";
  }

  if (
    normalized ===
    "POPULAR"
  ) {
    return "POPULAR";
  }

  if (
    normalized ===
    "LBR"
  ) {
    return "LBR";
  }

  /*
   * CAPITAL deliberadamente bloqueada.
   */
  return "";
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
  /*
   * =========================
   * 5 LOTERIAS ORIGINAIS
   * =========================
   *
   * Preservadas nesta etapa.
   */
  PT_SP: Object.freeze([
    "08:00",
    "10:00",
    "12:00",
    "13:00",
    "15:00",
    "17:00",
    "19:00",
    "20:00",
  ]),

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

  /*
   * =========================
   * 9 NOVAS LOTERIAS KING
   * =========================
   */

  MALUCA_FEDERAL: Object.freeze([
    "11:00",
    "20:00",
  ]),

  MALUQUINHA_RIO: Object.freeze([
    "09:00",
    "11:00",
    "14:00",
    "16:00",
    "18:00",
    "21:00",
  ]),

  BOA_SORTE: Object.freeze([
    "09:00",
    "11:00",
    "14:00",
    "16:00",
    "18:00",
    "21:00",
  ]),

  LOTEP: Object.freeze([
    "09:00",
    "10:00",
    "12:00",
    "15:00",
    "18:00",
    "20:00",
  ]),

  LOTECE: Object.freeze([
    "10:00",
    "14:00",
    "16:00",
    "19:00",
  ]),

  BAHIA: Object.freeze([
    "10:00",
    "11:00",
    "12:00",
    "15:00",
    "19:00",
    "20:00",
    "21:00",
  ]),

  BA_MALUCA: Object.freeze([
    "10:00",
    "11:00",
    "12:00",
    "15:00",
    "19:00",
    "21:00",
  ]),

  MINAS: Object.freeze([
    "12:00",
    "13:00",
    "15:00",
    "19:00",
    "21:00",
  ]),

  SORTE: Object.freeze([
    "14:00",
    "18:00",
  ]),

  /*
   * =========================
   * FONTES EXTERNAS
   * =========================
   *
   * Somente horários com resultado
   * atualmente confirmado/persistido.
   *
   * POPULAR 18:30 permanece fora.
   *
   * LBR permanece sem:
   * 10:40, 12:40, 15:40 e 17:40.
   */

  POPULAR: Object.freeze([
    "09:30",
    "11:00",
    "12:40",
    "14:00",
    "15:40",
    "17:00",
  ]),

  LBR: Object.freeze([
    "00:40",
    "01:40",
    "02:40",
    "07:40",
    "08:40",
    "09:40",
    "11:40",
    "13:40",
    "14:40",
    "16:40",
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