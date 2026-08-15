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
   Plan helpers
========================= */

function normalizePlan(plan) {
  const raw = String(plan ?? "").trim().toUpperCase();

  if (raw === "STANDARD") return "STANDARD";
  if (raw === "PLUS") return "PLUS";
  if (raw === "VIP") return "VIP";
  if (raw === "PREMIUM") return "PREMIUM";
  if (raw === "FREE") return "FREE";
  return "";
}

function normalizeIsoString(value) {
  return String(value || "").trim();
}

function isFutureIso(value, refMs = Date.now()) {
  const ms = Date.parse(normalizeIsoString(value));
  return Number.isFinite(ms) && ms > refMs;
}

function resolveUserEntitlement(user, plan) {
  const trialActive = user?.trialActive === true;
  const trialEndAt = normalizeIsoString(user?.trialEndAt);

  if (trialActive && isFutureIso(trialEndAt)) {
    return "TRIAL";
  }

  if (plan === "STANDARD") return "STANDARD";
  if (plan === "PLUS") return "PLUS";
  if (plan === "PREMIUM") return "PREMIUM";
  if (plan === "VIP") return "VIP";

  return "FREE";
}

function resolveUserPlan(user) {
  const candidates = [
    user?.plan,
    user?.profile?.plan,
    user?.subscription?.plan,
    user?.account?.plan,
    user?.customClaims?.plan,
    user?.claims?.plan,
    user?.appData?.plan,
    user?.metadata?.plan,
  ];

  for (const candidate of candidates) {
    const normalized = normalizePlan(candidate);
    if (normalized) return normalized;
  }

  // fallback seguro:
  // ausência de plano confirmado NUNCA deve escalar para PREMIUM
  return "FREE";
}

/* =========================
   Markers
========================= */

export function markSessionAuth(user) {
  const uid = String(user?.uid || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  if (!uid) return;

  const plan = resolveUserPlan(user);

  const trialStartAt = normalizeIsoString(user?.trialStartAt);
  const trialEndAt = normalizeIsoString(user?.trialEndAt);
  const trialActive =
    user?.trialActive === true &&
    isFutureIso(trialEndAt);

  const entitlement = resolveUserEntitlement(
    {
      ...user,
      trialActive,
      trialEndAt,
    },
    plan
  );

  safeWriteSession({
    ok: true,
    type: "user",

    plan,
    entitlement,

    trialStartAt,
    trialEndAt,
    trialActive,

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