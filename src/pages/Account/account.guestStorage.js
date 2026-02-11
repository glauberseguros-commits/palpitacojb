// src/pages/Account/account.guestStorage.js

/**
 * Guest profile (localStorage)
 * - Mantém dados locais (name/phone/photoURL)
 * - Mantém flag de "guest ativo" para o app (pp_guest_active_v1)
 */

import {
  LS_GUEST_PROFILE_KEY,
  LS_GUEST_ACTIVE_KEY,
} from "./account.constants";
import { normalizePhoneDigits } from "./account.formatters";
import { dispatchSessionChanged } from "./account.session";

/* =========================
   Guest profile
========================= */

export function loadGuestProfile() {
  try {
    const raw = localStorage.getItem(LS_GUEST_PROFILE_KEY);
    if (!raw) return { name: "", phone: "", photoURL: "" };

    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return { name: "", phone: "", photoURL: "" };

    return {
      name: String(obj.name || "").trim(),
      phone: String(obj.phone || obj.phoneDigits || "").trim(),
      photoURL: String(obj.photoURL || obj.photoUrl || "").trim(),
    };
  } catch {
    return { name: "", phone: "", photoURL: "" };
  }
}

export function saveGuestProfile(p) {
  try {
    localStorage.setItem(
      LS_GUEST_PROFILE_KEY,
      JSON.stringify({
        name: String(p?.name || "").trim(),
        phone: normalizePhoneDigits(p?.phone || ""),
        photoURL: String(p?.photoURL || "").trim(),
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {}
}

export function clearGuestProfile() {
  try {
    localStorage.removeItem(LS_GUEST_PROFILE_KEY);
  } catch {}
}

/* =========================
   Guest active flag
========================= */

export function setGuestActive(v) {
  try {
    localStorage.setItem(LS_GUEST_ACTIVE_KEY, v ? "1" : "0");
  } catch {}
  // 🔔 importante: App.jsx precisa reagir no mesmo tab
  dispatchSessionChanged();
}

export function isGuestActive() {
  try {
    return localStorage.getItem(LS_GUEST_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}
