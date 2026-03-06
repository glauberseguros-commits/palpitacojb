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
  const str = String(s || "").trim();
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
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

  const ymd = `${m[3]}-${m[2]}-${m[1]}`;
  return isYMD(ymd) ? ymd : null;
}

export function normalizeToYMD(input) {
  if (!input) return null;

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    const ymd = `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(
      input.getDate()
    )}`;
    return isYMD(ymd) ? ymd : null;
  }

  const s = safeStr(input);
  if (!s) return null;

  const isoFull = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoFull) {
    const ymd = `${isoFull[1]}-${isoFull[2]}-${isoFull[3]}`;
    return isYMD(ymd) ? ymd : null;
  }

  const isoPrefix = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
  if (isoPrefix) {
    const ymd = `${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`;
    return isYMD(ymd) ? ymd : null;
  }

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
  const base = Date.UTC(Y, M - 1, D);
  const dt = new Date(base);
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(
    dt.getUTCDate()
  )}`;
}

function isValidHourMinute(hh, mm) {
  const h = Number(hh);
  const m = Number(mm);
  return (
    Number.isFinite(h) &&
    Number.isFinite(m) &&
    h >= 0 &&
    h <= 23 &&
    m >= 0 &&
    m <= 59
  );
}

/**
 * Normaliza diversos formatos para "HH:MM"
 * - "9" => "09:00"
 * - "9h" => "09:00"
 * - "09:0" => "09:00"
 * - "09:00" => "09:00"
 * Se inválido, retorna string original aparada.
 */
export function normalizeHourLike(value) {
  const s0 = safeStr(value);
  if (!s0) return "";

  const s = s0.replace(/\s+/g, "");

  const mhx = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (mhx) {
    const hh = Number(mhx[1]);
    if (isValidHourMinute(hh, 0)) return `${pad2(hh)}:00`;
    return s0;
  }

  const mISO = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (mISO) {
    const hh = Number(mISO[1]);
    const mm = Number(mISO[2]);
    if (isValidHourMinute(hh, mm)) return `${pad2(hh)}:${pad2(mm)}`;
    return s0;
  }

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) {
    const hh = Number(m2[1]);
    if (isValidHourMinute(hh, 0)) return `${pad2(hh)}:00`;
    return s0;
  }

  return s0;
}

/**
 * ✅ BUCKET CANÔNICO DO PROJETO: "HHh"
 * - "09:00" => "09h"
 * - "9h" => "09h"
 * - "09" => "09h"
 * Se não reconhecer hora válida, devolve string normalizada.
 */
export function toHourBucket(hhmm) {
  const s = normalizeHourLike(hhmm);

  const mh = safeStr(s).match(/^(\d{1,2})h$/i);
  if (mh) {
    const hh = Number(mh[1]);
    if (isValidHourMinute(hh, 0)) return `${pad2(hh)}h`;
    return safeStr(s);
  }

  const m = safeStr(s).match(/^(\d{2}):(\d{2})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (isValidHourMinute(hh, mm)) return `${pad2(hh)}h`;
    return safeStr(s);
  }

  const m2 = safeStr(s).match(/^(\d{1,2})$/);
  if (m2) {
    const hh = Number(m2[1]);
    if (isValidHourMinute(hh, 0)) return `${pad2(hh)}h`;
    return safeStr(s);
  }

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

  const b = toHourBucket(raw);
  const mh = safeStr(b).match(/^(\d{2})h$/i);
  if (mh) return Number(mh[1]) * 60;

  const s = normalizeHourLike(raw);
  const m = safeStr(s).match(/^(\d{2}):(\d{2})$/);
  if (!m) return -1;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!isValidHourMinute(hh, mm)) return -1;

  return hh * 60 + mm;
}

export function getDowKey(ymd) {
  const s = String(ymd || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  const dt = new Date(y, mo - 1, d);
  return dt.getDay(); // 0=dom ... 3=qua ... 6=sáb
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
  if (ca && cb && ca !== cb) {
    return String(ca).localeCompare(String(cb), "en", { numeric: true });
  }
  return milharCompareAsc(a, b);
}

/**
 * Wrap cíclico de 2 dígitos para montagem de grupos.
 * ATENÇÃO:
 * - isto NÃO transforma centena em dezena no domínio do jogo
 * - serve apenas para fechar sequências cíclicas, ex. grupo 25 => 97,98,99,00
 */
export function wrapToDezena2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const d = ((x % 100) + 100) % 100;
  return pad2(d);
}

/**
 * Dezenas de um grupo (1..25) no padrão do bicho
 * grupo 1  => 01,02,03,04
 * grupo 25 => 97,98,99,00
 */
export function dezenasFromGrupo(grupo) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g < 1 || g > 25) return [];

  const start = (g - 1) * 4 + 1; // 1..97

  return [0, 1, 2, 3]
    .map((i) => wrapToDezena2(start + i))
    .filter(Boolean);
}