// src/pages/Account/account.formatters.js

/**
 * Formatters e helpers puros do módulo Account
 * (sem dependência de React ou Firebase)
 */

import { DEFAULT_INITIALS } from "./account.constants";

/* =========================
   Datas
========================= */

export function safeISO(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function formatBRDateTime(iso) {
  const d = safeISO(iso);
  if (!d) return "—";
  try {
    return d.toLocaleString("pt-BR");
  } catch {
    return String(iso || "—");
  }
}

export function isoPlusDays(iso, days) {
  const d = safeISO(iso) || new Date();
  const out = new Date(d.getTime() + Number(days || 0) * 86400000);
  return out.toISOString();
}

export function diffDaysCeil(fromIso, toIso) {
  const a = safeISO(fromIso);
  const b = safeISO(toIso);
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  return Math.ceil(ms / 86400000);
}

/* =========================
   Telefone (BR)
========================= */

export function digitsOnly(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

export function normalizePhoneDigits(v) {
  return digitsOnly(v).slice(0, 11);
}

export function isPhoneBRValidDigits(digits) {
  const s = String(digits || "");
  return s.length === 10 || s.length === 11;
}

// (xx) xxxx-xxxx (10) | (xx) 9 xxxx-xxxx (11)
export function formatPhoneBR(digits) {
  const d = normalizePhoneDigits(digits);
  if (!d) return "";

  if (d.length <= 2) return `(${d}`;
  const dd = d.slice(0, 2);

  // 10 dígitos
  if (d.length <= 10) {
    const a = d.slice(2, 6);
    const b = d.slice(6, 10);
    if (d.length <= 6) return `(${dd}) ${a}`;
    return `(${dd}) ${a}${b ? `-${b}` : ""}`;
  }

  // 11 dígitos
  const ninth = d.slice(2, 3);
  const a = d.slice(3, 7);
  const b = d.slice(7, 11);
  if (d.length <= 3) return `(${dd}) ${ninth}`;
  if (d.length <= 7) return `(${dd}) ${ninth} ${a}`;
  return `(${dd}) ${ninth} ${a}${b ? `-${b}` : ""}`;
}

/* =========================
   Texto / Perfil
========================= */

export function computeInitials(name) {
  const nm = String(name || "").trim();
  if (!nm) return DEFAULT_INITIALS;

  const parts = nm.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || DEFAULT_INITIALS[0];
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (a + b).toUpperCase();
}

/* =========================
   Boolean helpers
========================= */

export function safeBool(v) {
  return v === true;
}
