// src/pages/Account/account.session.js

/**
 * Sessão global do app (pp_session_v1)
 * - Fonte de verdade usada pelo App.jsx para decidir login vs dashboard
 * - Dispara evento "pp_session_changed" no mesmo tab
 */

import { ACCOUNT_SESSION_KEY, SESSION_CHANGED_EVENT } from "./account.constants";

function hasWindow() {
  return typeof window !== "undefined";
}

function canUseLocalStorage() {
  if (!hasWindow()) return false;
  try {
    const ls = window.localStorage;
    if (!ls) return false;

    // probe rápido para garantir que não é bloqueado (Safari private / políticas)
    const k = "__pp_ls_probe__";
    ls.setItem(k, "1");
    ls.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/* =========================
   Event
========================= */

export function dispatchSessionChanged() {
  try {
    if (!hasWindow()) return;
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  } catch {}
}

/* =========================
   Storage
========================= */

export function safeWriteSession(obj) {
  try {
    if (!canUseLocalStorage()) return;
    window.localStorage.setItem(ACCOUNT_SESSION_KEY, JSON.stringify(obj));
  } catch {}
  dispatchSessionChanged();
}

export function safeRemoveSession() {
  try {
    if (!canUseLocalStorage()) return;
    window.localStorage.removeItem(ACCOUNT_SESSION_KEY);
  } catch {}
  dispatchSessionChanged();
}

/* =========================
   Markers
========================= */

export function markSessionAuth(user) {
  const uid = String(user?.uid || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  if (!uid) return;

  safeWriteSession({
    ok: true,
    type: "user",
    plan: "FREE",
    uid,
    email,
    ts: Date.now(),
  });
}

export function markSessionGuest() {
  safeWriteSession({
    ok: true,
    type: "guest",
    plan: "FREE",
    ts: Date.now(),
  });
}
