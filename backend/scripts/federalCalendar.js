"use strict";

const FEDERAL_SUNDAY_START_YMD = "2026-07-19";

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
    Date.UTC(year, month - 1, day)
  ).getUTCDay();
}

function getFederalScheduleForDate(date) {
  const ymd = String(date || "").trim();
  const dow = dowFromYmd(ymd);

  if (dow === null) {
    return [];
  }

  if (ymd >= FEDERAL_SUNDAY_START_YMD) {
    if (dow === 0) {
      return ["11:00"];
    }

    if (dow === 3) {
      return ["20:00"];
    }

    return [];
  }

  if (dow === 3 || dow === 6) {
    return ["20:00"];
  }

  return [];
}

function normalizeFederalRequestedSlot(value) {
  const raw = String(value || "").trim();

  if (raw === "11:00") {
    return "11:00";
  }

  if (raw === "19:00" || raw === "20:00") {
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

  return normalizeFederalRequestedSlot(rawSlot);
}

module.exports = {
  FEDERAL_SUNDAY_START_YMD,
  getFederalScheduleForDate,
  normalizeFederalRequestedSlot,
  normalizeFederalSourceSlot,
};
