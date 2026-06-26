import { normalizeToYMD_SP } from "../../utils/ymd";

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

export function ymdToBR(ymd) {
  const m = String(ymd || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function normalizeToYMD(input) {
  return normalizeToYMD_SP(input);
}

export function utcTodayYmd() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  return `${y}-${m}-${dd}`;
}

export function ymdToUTCDate(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function ymdToUTCDateLocal(ymd) {
  return ymdToUTCDate(ymd);
}

export function addDaysUTC(ymd, days) {
  const dt = ymdToUTCDate(ymd);
  if (!dt) return ymd;
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(
    dt.getUTCDate()
  )}`;
}

export function addDaysUTCLocal(ymd, days) {
  return addDaysUTC(ymd, days);
}

export function daysBetweenInclusiveUTC(a, b) {
  const da = ymdToUTCDate(a);
  const db = ymdToUTCDate(b);
  if (!da || !db) return NaN;
  const ms = db.getTime() - da.getTime();
  return Math.floor(ms / 86400000) + 1;
}

export function daysDiffUTC(fromYmd, toYmd) {
  const da = ymdToUTCDate(fromYmd);
  const db = ymdToUTCDate(toYmd);
  if (!da || !db) return NaN;
  const ms = db.getTime() - da.getTime();
  return Math.floor(ms / 86400000);
}

export function shouldForceFreshServerRead(ymd) {
  const today = utcTodayYmd();
  const diffToToday = daysDiffUTC(ymd, today);
  return Number.isFinite(diffToToday) && diffToToday <= 1;
}
