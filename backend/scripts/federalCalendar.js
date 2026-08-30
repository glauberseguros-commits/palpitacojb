"use strict";

const FEDERAL_20H_START_YMD =
  "2025-11-05";

const FEDERAL_SUNDAY_START_YMD =
  "2026-07-19";

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(value || "").trim()
  );
}

function dowFromYmd(ymd) {
  if (!isYmd(ymd)) {
    return null;
  }

  const [year, month, day] =
    ymd.split("-").map(Number);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  ).getUTCDay();
}

function getFederalScheduleForDate(date) {
  const ymd =
    String(date || "").trim();

  const dow =
    dowFromYmd(ymd);

  if (dow === null) {
    return [];
  }

  /*
   * Regra vigente:
   * domingo 11:30 + quarta 20:00.
   */
  if (
    ymd >=
    FEDERAL_SUNDAY_START_YMD
  ) {
    if (dow === 0) {
      return ["11:30"];
    }

    if (dow === 3) {
      return ["20:00"];
    }

    return [];
  }

  /*
   * Segunda fase histórica:
   * quarta e sábado às 20:00.
   */
  if (
    ymd >=
    FEDERAL_20H_START_YMD
  ) {
    if (
      dow === 3 ||
      dow === 6
    ) {
      return ["20:00"];
    }

    return [];
  }

  /*
   * Primeira fase histórica:
   * quarta e sábado às 19:00.
   */
  if (
    dow === 3 ||
    dow === 6
  ) {
    return ["19:00"];
  }

  return [];
}

function normalizeFederalRequestedSlot(value) {
  const raw =
    String(value || "").trim();

  /*
   * Alias legado do domingo atual.
   */
  if (
    raw === "11:00" ||
    raw === "11:30"
  ) {
    return "11:30";
  }

  /*
   * 19h e 20h são horários históricos distintos.
   * Nunca colapsar um no outro sem a data.
   */
  if (raw === "19:00") {
    return "19:00";
  }

  if (raw === "20:00") {
    return "20:00";
  }

  return raw;
}

function normalizeFederalSourceSlot({
  date,
  rawSlot,
} = {}) {
  const official =
    getFederalScheduleForDate(date);

  if (official.length === 1) {
    return official[0];
  }

  return normalizeFederalRequestedSlot(
    rawSlot
  );
}

module.exports = {
  FEDERAL_20H_START_YMD,
  FEDERAL_SUNDAY_START_YMD,
  getFederalScheduleForDate,
  normalizeFederalRequestedSlot,
  normalizeFederalSourceSlot,
};
