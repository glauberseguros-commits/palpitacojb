// src/pages/Top3/top3.formatters.js

/* =========================
   Helpers puros (datas/horas/texto)
========================= */

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function safeStr(v) {
  return String(v ?? "").trim();
}

export function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

export function ymdToBR(ymd) {
  const m = String(ymd || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return safeStr(ymd);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function brToYMD(br) {
  const m = String(br || "")
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function normalizeToYMD(input) {
  if (!input) return null;

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(
      input.getDate()
    )}`;
  }

  const s = safeStr(input);
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const y = brToYMD(s);
  if (y) return y;

  return null;
}

export function todayYMDLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDaysYMD(ymd, deltaDays) {
  if (!isYMD(ymd)) return ymd;
  const [Y, M, D] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Y, M - 1, D);
  dt.setDate(dt.getDate() + Number(deltaDays || 0));
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/**
 * Normaliza diversos formatos para "HH:MM"
 * - "9" => "09:00"
 * - "9h" => "09:00"
 * - "09:0" => "09:00"
 * - "09:00" => "09:00"
 */
export function normalizeHourLike(value) {
  const s0 = safeStr(value);
  if (!s0) return "";

  const s = s0.replace(/\s+/g, "");

  const mhx = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (mhx) return `${pad2(mhx[1])}:00`;

  const mISO = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (mISO) return `${pad2(mISO[1])}:${pad2(mISO[2])}`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  return s0;
}

/**
 * ✅ BUCKET CANÔNICO DO PROJETO: "HHh"
 * - "09:00" => "09h"
 * - "9h" => "09h"
 * - "09" => "09h"
 * Se não reconhecer, devolve string normalizada.
 */
export function toHourBucket(hhmm) {
  const s = normalizeHourLike(hhmm);

  // caso já venha "09h"
  const mh = safeStr(s).match(/^(\d{1,2})h$/i);
  if (mh) return `${pad2(mh[1])}h`;

  // caso venha "HH:MM"
  const m = safeStr(s).match(/^(\d{2}):(\d{2})$/);
  if (m) return `${m[1]}h`;

  // caso venha só "HH"
  const m2 = safeStr(s).match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}h`;

  return safeStr(s);
}

/**
 * Converte hora em minutos (para sorting)
 * Aceita:
 * - "09h"
 * - "09:00"
 * - "9h"
 * - "9"
 */
export function hourToInt(hhmm) {
  const raw = safeStr(hhmm);
  if (!raw) return -1;

  const b = toHourBucket(raw); // "HHh" se possível
  const mh = safeStr(b).match(/^(\d{2})h$/i);
  if (mh) return Number(mh[1]) * 60;

  const s = normalizeHourLike(raw);
  const m = safeStr(s).match(/^(\d{2}):(\d{2})$/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function getDowKey(ymd) {
  if (!isYMD(ymd)) return null;
  const [Y, M, D] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Y, M - 1, D);
  return dt.getDay(); // 0 dom ... 6 sáb
}

/* =========================
   Milhar helpers (TOP3)
========================= */

export function pickPrizeMilhar4(p) {
  const raw =
    p?.milhar ??
    p?.milhar4 ??
    p?.numero ??
    p?.number ??
    p?.mil ??
    p?.num ??
    p?.valor ??
    "";
  const digits = safeStr(raw).replace(/\D+/g, "");
  if (!digits) return null;
  const last4 = digits.slice(-4).padStart(4, "0");
  return /^\d{4}$/.test(last4) ? last4 : null;
}

export function getDezena2(milhar4) {
  const s = safeStr(milhar4);
  if (!/^\d{4}$/.test(s)) return null;
  return s.slice(2, 4);
}

export function getCentena3(milhar4) {
  const s = safeStr(milhar4);
  if (!/^\d{4}$/.test(s)) return null;
  return s.slice(1, 4);
}

export function milharCompareAsc(a, b) {
  return String(a).localeCompare(String(b), "en", { numeric: true });
}

export function dezenaCompareAsc(a, b) {
  return String(a).localeCompare(String(b), "en", { numeric: true });
}

export function milharCompareByCentenaAsc(a, b) {
  const ca = getCentena3(a);
  const cb = getCentena3(b);
  if (ca && cb && ca !== cb)
    return String(ca).localeCompare(String(cb), "en", { numeric: true });
  return milharCompareAsc(a, b);
}
