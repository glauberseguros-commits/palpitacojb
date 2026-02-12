// src/services/planService.js
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

/**
 * =====================================================
 * PLAN SERVICE — PALPITACO
 * =====================================================
 * Regras do produto:
 * - Usuário novo: entra FREE + ganha TRIAL 24h automaticamente
 * - Premium: 30 dias após confirmação de pagamento
 * - Ao expirar premium: volta a FREE automaticamente
 *
 * Estrutura sugerida:
 * users/{uid}:
 *  - createdAt, updatedAt
 *  - plan: {
 *      tier: "free" | "trial" | "premium",
 *      trialStartMs: number | null,
 *      premiumUntilMs: number | null,
 *      lastPayment: {
 *        amount: number,
 *        provider: "mercadopago" | "manual" | "other",
 *        paymentId: string,
 *        confirmedAtMs: number
 *      } | null
 *    }
 */

const ONE_HOUR_MS = 60 * 60 * 1000;
const TRIAL_MS = 24 * ONE_HOUR_MS;
const PREMIUM_30D_MS = 30 * 24 * ONE_HOUR_MS;

function nowMs() {
  return Date.now();
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeTier(tierRaw) {
  const t = String(tierRaw ?? "free").trim().toLowerCase();
  if (t === "premium" || t === "trial") return t;
  return "free";
}

function normalizePlan(plan) {
  const tier = normalizeTier(plan?.tier);
  const trialStartMs = safeNum(plan?.trialStartMs);
  const premiumUntilMs = safeNum(plan?.premiumUntilMs);

  return {
    tier,
    trialStartMs,
    premiumUntilMs,
    lastPayment: plan?.lastPayment || null,
  };
}

export function computeEntitlement(plan, atMs = nowMs()) {
  const p = normalizePlan(plan);

  const premiumActive =
    typeof p.premiumUntilMs === "number" && p.premiumUntilMs > atMs;

  const trialActive =
    typeof p.trialStartMs === "number" &&
    p.trialStartMs + TRIAL_MS > atMs &&
    !premiumActive;

  const tier = premiumActive ? "premium" : trialActive ? "trial" : "free";

  return {
    tier,
    premiumActive,
    trialActive,
    premiumUntilMs: p.premiumUntilMs,
    trialEndMs:
      typeof p.trialStartMs === "number" ? p.trialStartMs + TRIAL_MS : null,
  };
}

/**
 * Garante documento do usuário:
 * - Se não existir: cria com trialStartMs = agora (TRIAL 24h)
 * - Se existir: mantém, mas normaliza downgrade automático (premium expirado => free)
 */
export async function ensureUserPlan(uid) {
  if (!uid) throw new Error("ensureUserPlan(uid): uid ausente");

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  const t = nowMs();

  if (!snap.exists()) {
    const initialPlan = {
      tier: "trial",
      trialStartMs: t,
      premiumUntilMs: null,
      lastPayment: null,
    };

    await setDoc(ref, {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      plan: initialPlan,
    });

    return { uid, plan: initialPlan, entitlement: computeEntitlement(initialPlan, t) };
  }

  const data = snap.data() || {};
  const currentPlan = normalizePlan(data.plan);

  const ent = computeEntitlement(currentPlan, t);
  const desiredTier = ent.tier;

  // ✅ downgrade/normalização automática SEM inventar premium
  // - Se premium expirou => free (e limpa premiumUntilMs expirado)
  // - Se trial expirou => free (e limpa trialStartMs expirado)
  // - Se tier divergente (ex.: "FREE"/"Premium") => corrige
  let changed = false;
  const nextPlan = { ...currentPlan };

  if (nextPlan.tier !== desiredTier) {
    nextPlan.tier = desiredTier;
    changed = true;
  }

  // limpa premiumUntilMs expirado (mantém se ainda ativo)
  if (typeof nextPlan.premiumUntilMs === "number" && nextPlan.premiumUntilMs <= t) {
    if (desiredTier !== "premium") {
      nextPlan.premiumUntilMs = null;
      changed = true;
    }
  }

  // limpa trialStartMs expirado (mantém se ainda ativo)
  if (typeof nextPlan.trialStartMs === "number" && nextPlan.trialStartMs + TRIAL_MS <= t) {
    if (desiredTier !== "trial") {
      nextPlan.trialStartMs = null;
      changed = true;
    }
  }

  if (changed) {
    await updateDoc(ref, {
      updatedAt: serverTimestamp(),
      plan: nextPlan,
    });

    return { uid, plan: nextPlan, entitlement: computeEntitlement(nextPlan, t) };
  }

  return { uid, plan: currentPlan, entitlement: ent };
}

/**
 * Ativa/renova Premium por 30 dias.
 * Este método deve ser chamado APENAS após confirmação do pagamento.
 */
export async function activatePremium30d(uid, payload = {}) {
  if (!uid) throw new Error("activatePremium30d(uid): uid ausente");

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const t = nowMs();

  let basePlan = { tier: "free", trialStartMs: null, premiumUntilMs: null, lastPayment: null };
  if (snap.exists()) {
    basePlan = normalizePlan(snap.data()?.plan);
  }

  const currentUntil =
    typeof basePlan.premiumUntilMs === "number" ? basePlan.premiumUntilMs : 0;

  // ✅ Se ainda está premium, soma a partir do vencimento atual; senão soma a partir de agora
  const startFrom = currentUntil > t ? currentUntil : t;
  const newUntil = startFrom + PREMIUM_30D_MS;

  const nextPlan = {
    ...basePlan,
    tier: "premium",
    premiumUntilMs: newUntil,
    // trial pode existir historicamente, mas não interfere no entitlement (premium manda)
    lastPayment: {
      amount: safeNum(payload.amount) ?? 10,
      provider: String(payload.provider || "mercadopago"),
      paymentId: String(payload.paymentId || ""),
      confirmedAtMs: t,
    },
  };

  if (!snap.exists()) {
    await setDoc(ref, {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      plan: nextPlan,
    });
  } else {
    await updateDoc(ref, {
      updatedAt: serverTimestamp(),
      plan: nextPlan,
    });
  }

  return { uid, plan: nextPlan, entitlement: computeEntitlement(nextPlan, t) };
}

/**
 * Leitura simples do plano (sem criar)
 */
export async function getUserPlan(uid) {
  if (!uid) throw new Error("getUserPlan(uid): uid ausente");

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() || {};
  const plan = normalizePlan(data.plan);
  return { uid, plan, entitlement: computeEntitlement(plan, nowMs()) };
}
