// src/utils/userIdentity.js

export function normalizeDigitsOnly(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

export function normalizeCpfDigits(cpf) {
  return normalizeDigitsOnly(cpf).slice(0, 11);
}

/**
 * SHA-256 -> hex (robusto)
 * - tenta WebCrypto (window.crypto.subtle)
 * - fallback: CryptoJS (npm i crypto-js)
 */
async function sha256Hex(str) {
  const input = String(str || "");

  // 1) WebCrypto (preferido)
  try {
    const subtle = globalThis?.crypto?.subtle;
    if (subtle) {
      const enc = new TextEncoder().encode(input);
      const buf = await subtle.digest("SHA-256", enc);
      const arr = Array.from(new Uint8Array(buf));
      return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // cai pro fallback abaixo
  }

  // 2) Fallback via CryptoJS
  // Requer: npm i crypto-js
  const { default: CryptoJS } = await import("crypto-js");
  return CryptoJS.SHA256(input).toString(CryptoJS.enc.Hex);
}

/**
 * userId determinístico e não sensível
 * Ex: "cpf:ab12cd..."
 */
export async function userIdFromCpfDigits(cpfDigits11) {
  const cpf = String(cpfDigits11 || "").trim();
  if (cpf.length !== 11) return null;

  const h = await sha256Hex(cpf);
  return `cpf:${h}`;
}

