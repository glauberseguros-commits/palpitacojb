import {
  LS_GUEST_PROFILE_KEY,
  LS_GUEST_ACTIVE_KEY,
} from "./account.constants";
import { normalizePhoneDigits } from "./account.formatters";
import { dispatchSessionChanged } from "./account.session";

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

export function setGuestActive(v, opts = {}) {
  const silent = opts?.silent === true;

  try {
    localStorage.setItem(LS_GUEST_ACTIVE_KEY, v ? "1" : "0");
  } catch {}

  if (!silent) {
    dispatchSessionChanged();
  }
}

export function isGuestActive() {
  try {
    return localStorage.getItem(LS_GUEST_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}