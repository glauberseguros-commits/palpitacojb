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

function dateToLocalYMD(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;

  const ymd = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}`;

  return isYMD(ymd) ? ymd : null;
}

export function normalizeToYMD(input) {
  if (input == null) return null;

  if (typeof input === "object" && typeof input.toDate === "function") {
    return dateToLocalYMD(input.toDate());
  }

  if (
    typeof input === "object" &&
    (Number.isFinite(Number(input.seconds)) ||
      Number.isFinite(Number(input._seconds)))
  ) {
    const sec = Number.isFinite(Number(input.seconds))
      ? Number(input.seconds)
      : Number(input._seconds);

    return dateToLocalYMD(new Date(sec * 1000));
  }

  if (input instanceof Date) {
    return dateToLocalYMD(input);
  }

  if (typeof input === "number" && Number.isFinite(input)) {
    const ms = input > 1e12 ? input : input * 1000;
    return dateToLocalYMD(new Date(ms));
  }

  const s = safeStr(input);
  if (!s) return null;

  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    const ms = s.length >= 13 ? n : n * 1000;
    return dateToLocalYMD(new Date(ms));
  }

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

  const isoSlash = s.match(/^(\d{4})\/(\d{2})\/(\d{2})(?:\D.*)?$/);
  if (isoSlash) {
    const ymd = `${isoSlash[1]}-${isoSlash[2]}-${isoSlash[3]}`;
    return isYMD(ymd) ? ymd : null;
  }

  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const ymd = `${compact[1]}-${compact[2]}-${compact[3]}`;
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
  const y = safeStr(ymd);
  if (!isYMD(y)) return y;

  const [Y, M, D] = y.split("-").map((x) => Number(x));
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
 * Normaliza diversos formatos para "HH:MM".
 */
export function normalizeHourLike(value) {
  const s0 = safeStr(value);
  if (!s0) return "";

  const s = s0
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-")
    .toLowerCase();

  const mhx = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (mhx) {
    const hh = Number(mhx[1]);
    return isValidHourMinute(hh, 0) ? `${pad2(hh)}:00` : "";
  }

  const mhm = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)(\d{1,2})$/i);
  if (mhm) {
    const hh = Number(mhm[1]);
    const mm = Number(mhm[2]);
    return isValidHourMinute(hh, mm) ? `${pad2(hh)}:${pad2(mm)}` : "";
  }

  const mISO = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (mISO) {
    const hh = Number(mISO[1]);
    const mm = Number(mISO[2]);
    return isValidHourMinute(hh, mm) ? `${pad2(hh)}:${pad2(mm)}` : "";
  }

  const mDot = s.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (mDot) {
    const hh = Number(mDot[1]);
    const mm = Number(mDot[2]);
    return isValidHourMinute(hh, mm) ? `${pad2(hh)}:${pad2(mm)}` : "";
  }

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) {
    const hh = Number(m2[1]);
    return isValidHourMinute(hh, 0) ? `${pad2(hh)}:00` : "";
  }

  return "";
}

/**
 * BUCKET CANÔNICO DO PROJETO: "HHh".
 */
export function toHourBucket(hhmm) {
  const s = normalizeHourLike(hhmm);
  if (!s) return "";

  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return "";

  const hh = Number(m[1]);
  const mm = Number(m[2]);

  if (!isValidHourMinute(hh, mm)) return "";

  return `${pad2(hh)}h`;
}

/**
 * Converte hora em minutos.
 */
export function hourToInt(hhmm) {
  const raw = safeStr(hhmm);
  if (!raw) return -1;

  const s = normalizeHourLike(raw);
  const m = safeStr(s).match(/^(\d{2}):(\d{2})$/);

  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);

    if (!isValidHourMinute(hh, mm)) return -1;

    return hh * 60 + mm;
  }

  const b = safeStr(raw).match(/^(\d{1,2})h$/i);
  if (b) {
    const hh = Number(b[1]);
    return isValidHourMinute(hh, 0) ? hh * 60 : -1;
  }

  return -1;
}

export function getDowKey(ymd) {
  const y = safeStr(ymd);
  if (!isYMD(y)) return NaN;

  const [Y, M, D] = y.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(Y, M - 1, D));

  return dt.getUTCDay(); // 0=dom ... 3=qua ... 6=sáb
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
 */
export function wrapToDezena2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;

  const d = ((x % 100) + 100) % 100;
  return pad2(d);
}

/**
 * Dezenas de um grupo (1..25) no padrão do bicho.
 */
export function dezenasFromGrupo(grupo) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g < 1 || g > 25) return [];

  const start = (g - 1) * 4 + 1;

  return [0, 1, 2, 3]
    .map((i) => wrapToDezena2(start + i))
    .filter(Boolean);
}