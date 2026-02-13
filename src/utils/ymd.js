// src/utils/ymd.js
// ✅ Normalização CANÔNICA de datas (YMD) no frontend
// - Converte Date/Timestamp para YMD em America/Sao_Paulo (não depende do timezone do usuário)
// - Aceita ISO "YYYY-MM-DD..." e BR "DD/MM/YYYY"

const TZ_SP = "America/Sao_Paulo";

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function isYMD(s) {
  return /^(\d{4})-(\d{2})-(\d{2})$/.test(String(s || "").trim());
}

export function dateToYMD_SP(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;

  try {
    // en-CA => YYYY-MM-DD
    const ymd = d.toLocaleDateString("en-CA", { timeZone: TZ_SP });
    return isYMD(ymd) ? ymd : null;
  } catch {
    // fallback (não ideal, mas evita quebra total)
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const ymd = `${y}-${m}-${dd}`;
    return isYMD(ymd) ? ymd : null;
  }
}

export function normalizeToYMD_SP(input) {
  if (!input) return null;

  // Firestore Timestamp com toDate()
  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    const ymd = dateToYMD_SP(d);
    if (ymd) return ymd;
  }

  // Timestamp-like { seconds } / { _seconds }
  if (
    typeof input === "object" &&
    (Number.isFinite(Number(input.seconds)) || Number.isFinite(Number(input._seconds)))
  ) {
    const sec = Number.isFinite(Number(input.seconds)) ? Number(input.seconds) : Number(input._seconds);
    const d = new Date(sec * 1000);
    const ymd = dateToYMD_SP(d);
    if (ymd) return ymd;
  }

  // Date
  if (input instanceof Date) {
    const ymd = dateToYMD_SP(input);
    if (ymd) return ymd;
  }

  // String
  const s = String(input).trim();
  if (!s) return null;

  // ISO prefix YYYY-MM-DD...
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // BR DD/MM/YYYY
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

// alias (se você preferir chamar sem sufixo depois)
export const normalizeToYMD = normalizeToYMD_SP;
