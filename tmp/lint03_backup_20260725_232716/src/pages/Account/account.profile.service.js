// src/pages/Account/account.profile.service.js

/**
 * Firestore profile + access plan
 * Collection: users/{uid}
 *
 * Campos:
 * - name: string
 * - phone: string (apenas dígitos)
 * - phoneDigits: string (apenas dígitos; compat/login)
 * - photoURL: string
 * - createdAt: ISO
 * - createdAtMs: number
 * - updatedAt: ISO
 * - updatedAtMs: number
 * - lastActiveAt: ISO
 * - email: string
 *
 * Plano:
 * - plan: "FREE" | "PREMIUM" | "VIP"
 * - planStartAt: ISO
 * - planEndAt: ISO
 * - isLifetime: boolean
 *
 * Regras:
 * - usuário novo nasce como FREE
 * - PREMIUM vencido volta para FREE
 * - VIP vencido volta para FREE
 * - VIP com isLifetime=true não vence
 * - FREE não precisa de validade
 *
 * Compat legado:
 * - trialStartAt / trialEndAt / trialActive
 *   -> migra para PREMIUM quando ainda válido
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { safeISO } from "./account.formatters";

const PLAN_FREE = "FREE";
const PLAN_PREMIUM = "PREMIUM";
const PLAN_VIP = "VIP";

function nowIso() {
  return new Date().toISOString();
}

function normalizePlan(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s === PLAN_PREMIUM) return PLAN_PREMIUM;
  if (s === PLAN_VIP) return PLAN_VIP;
  return PLAN_FREE;
}

function normalizeIsoString(v) {
  return String(v || "").trim();
}

function isFutureIso(iso, refIso) {
  return !!safeISO(iso) && safeISO(refIso) < safeISO(iso);
}

function isPlanCurrentlyActive({ plan, planEndAt, isLifetime, refIso }) {
  const p = normalizePlan(plan);

  if (p === PLAN_FREE) return true;
  if (isLifetime === true) return true;
  if (!safeISO(planEndAt)) return false;

  return isFutureIso(planEndAt, refIso);
}

function buildExpiredToFreePatch() {
  return {
    plan: PLAN_FREE,
    planStartAt: "",
    planEndAt: "",
    isLifetime: false,
    updatedAt: nowIso(),
    updatedAtMs: Date.now(),
  };
}

function buildLegacyTrialMigration(data, refIso) {
  const trialStartAt = normalizeIsoString(data?.trialStartAt);
  const trialEndAt = normalizeIsoString(data?.trialEndAt);
  const trialActiveStored = data?.trialActive === true;

  const hasLegacyTrial = !!trialStartAt || !!trialEndAt || trialActiveStored;
  if (!hasLegacyTrial) return null;

  const activeByDate = safeISO(trialEndAt) ? isFutureIso(trialEndAt, refIso) : false;
  const shouldBePremium = trialActiveStored || activeByDate;

  if (shouldBePremium && safeISO(trialEndAt) && activeByDate) {
    return {
      plan: PLAN_PREMIUM,
      planStartAt: trialStartAt || refIso,
      planEndAt: trialEndAt,
      isLifetime: false,
      updatedAt: nowIso(),
      updatedAtMs: Date.now(),
    };
  }

  return buildExpiredToFreePatch();
}

/**
 * Garante o doc users/{uid}.
 * Usuário novo nasce como FREE.
 * Retorna { ok, created }.
 */
export async function ensureUserDoc(db, uid, user) {
  const u = String(uid || "").trim();
  if (!u) return { ok: false, created: false };

  try {
    const r = doc(db, "users", u);
    const snap = await getDoc(r);

    const createdAtIso = user?.metadata?.creationTime
      ? new Date(user.metadata.creationTime).toISOString()
      : nowIso();

    const currentNowIso = nowIso();

    if (!snap.exists()) {
      await setDoc(
        r,
        {
          createdAt: createdAtIso,
          createdAtMs: Date.parse(createdAtIso) || Date.now(),
          updatedAt: currentNowIso,
          updatedAtMs: Date.now(),
          lastActiveAt: currentNowIso,

          email: String(user?.email || "").trim().toLowerCase(),
          name: String(user?.displayName || "").trim(),
          phone: "",
          phoneDigits: "",
          photoURL: "",

          plan: PLAN_FREE,
          planStartAt: "",
          planEndAt: "",
          isLifetime: false,
        },
        { merge: true }
      );

      return { ok: true, created: true };
    }

    const data = snap.data() || {};
    const patch = {};
    let needPatch = false;

    if (!String(data.createdAt || "").trim()) {
      patch.createdAt = createdAtIso;
      patch.createdAtMs = Date.parse(createdAtIso) || Date.now();
      needPatch = true;
    }

    if (!String(data.email || "").trim() && user?.email) {
      patch.email = String(user.email).trim().toLowerCase();
      needPatch = true;
    }

    if (!String(data.name || "").trim() && user?.displayName) {
      patch.name = String(user.displayName).trim();
      needPatch = true;
    }

    const phone = String(data.phone || "").trim();
    const phoneDigits = String(data.phoneDigits || "").trim();
    if (phone && !phoneDigits) {
      patch.phoneDigits = phone;
      needPatch = true;
    }

    const hasPlanField = String(data.plan || "").trim().length > 0;
    if (!hasPlanField) {
      const legacyPatch = buildLegacyTrialMigration(data, currentNowIso);

      if (legacyPatch) {
        Object.assign(patch, legacyPatch);
      } else {
        patch.plan = PLAN_FREE;
        patch.planStartAt = "";
        patch.planEndAt = "";
        patch.isLifetime = false;
      }
      needPatch = true;
    } else {
      const normalizedPlan = normalizePlan(data.plan);
      const normalizedLifetime = data.isLifetime === true;
      const normalizedPlanStartAt = normalizeIsoString(data.planStartAt);
      const normalizedPlanEndAt = normalizeIsoString(data.planEndAt);

      if (normalizedPlan !== String(data.plan || "").trim().toUpperCase()) {
        patch.plan = normalizedPlan;
        needPatch = true;
      }

      if (data.isLifetime == null) {
        patch.isLifetime = normalizedLifetime;
        needPatch = true;
      }

      if (data.planStartAt == null) {
        patch.planStartAt = normalizedPlanStartAt;
        needPatch = true;
      }

      if (data.planEndAt == null) {
        patch.planEndAt = normalizedPlanEndAt;
        needPatch = true;
      }
    }

    patch.lastActiveAt = currentNowIso;
    needPatch = true;

    if (needPatch) {
      patch.updatedAt = currentNowIso;
      patch.updatedAtMs = Date.now();
      await setDoc(r, patch, { merge: true });
    }

    return { ok: true, created: false };
  } catch {
    return { ok: false, created: false };
  }
}

/**
 * Carrega perfil do Firestore.
 * Faz migração de legado trial -> plan.
 * Faz downgrade automático PREMIUM/VIP vencidos -> FREE.
 *
 * Retorna:
 * {
 *   name, phone, photoURL,
 *   plan, planStartAt, planEndAt, isLifetime, isActivePlan,
 *   lastActiveAt
 * }
 */
export async function loadUserProfile(db, uid) {
  const u = String(uid || "").trim();
  if (!u) return null;

  try {
    const r = doc(db, "users", u);
    const snap = await getDoc(r);
    if (!snap.exists()) return null;

    const data = snap.data() || {};
    const currentNowIso = nowIso();

    let patch = null;

    let plan = normalizePlan(data.plan);
    let planStartAt = normalizeIsoString(data.planStartAt);
    let planEndAt = normalizeIsoString(data.planEndAt);
    let isLifetime = data.isLifetime === true;

    const hasPlanField = String(data.plan || "").trim().length > 0;

    // Compat legado: trial -> PREMIUM/FREE
    if (!hasPlanField) {
      const legacyPatch = buildLegacyTrialMigration(data, currentNowIso);

      if (legacyPatch) {
        patch = { ...(patch || {}), ...legacyPatch };
        plan = normalizePlan(legacyPatch.plan);
        planStartAt = normalizeIsoString(legacyPatch.planStartAt);
        planEndAt = normalizeIsoString(legacyPatch.planEndAt);
        isLifetime = legacyPatch.isLifetime === true;
      } else {
        patch = {
          ...(patch || {}),
          plan: PLAN_FREE,
          planStartAt: "",
          planEndAt: "",
          isLifetime: false,
        };
        plan = PLAN_FREE;
        planStartAt = "";
        planEndAt = "";
        isLifetime = false;
      }
    }

    // Downgrade automático se PREMIUM/VIP expirou
    const activePlan = isPlanCurrentlyActive({
      plan,
      planEndAt,
      isLifetime,
      refIso: currentNowIso,
    });

    if ((plan === PLAN_PREMIUM || plan === PLAN_VIP) && !activePlan) {
      const freePatch = buildExpiredToFreePatch();
      patch = { ...(patch || {}), ...freePatch };

      plan = PLAN_FREE;
      planStartAt = "";
      planEndAt = "";
      isLifetime = false;
    }

    const phone =
      String(data.phone || "").trim() ||
      String(data.phoneDigits || "").trim();

    const photoURL =
      String(data.photoURL || "").trim() ||
      String(data.photoUrl || "").trim();

    const name = String(data.name || "").trim();
    const lastActiveAt = normalizeIsoString(data.lastActiveAt) || currentNowIso;

    // Compat: se existir phone mas não existir phoneDigits
    if (String(data.phone || "").trim() && !String(data.phoneDigits || "").trim()) {
      patch = {
        ...(patch || {}),
        phoneDigits: String(data.phone || "").trim(),
      };
    }

    // Atualiza lastActiveAt em toda leitura autenticada
    patch = {
      ...(patch || {}),
      lastActiveAt: currentNowIso,
      updatedAt: currentNowIso,
      updatedAtMs: Date.now(),
    };

    await setDoc(r, patch, { merge: true });

    return {
      name,
      phone,
      photoURL,

      plan,
      planStartAt,
      planEndAt,
      isLifetime,
      isActivePlan: activePlan || plan === PLAN_FREE,

      lastActiveAt: currentNowIso,
    };
  } catch {
    return null;
  }
}

/**
 * Salva perfil básico no Firestore.
 * payload: { name, phone, photoURL }
 * Retorna boolean ok.
 */
export async function saveUserProfile(db, uid, payload) {
  const u = String(uid || "").trim();
  if (!u) return false;

  try {
    const phoneDigits = String(payload?.phone || "").trim();
    const now = nowIso();

    const r = doc(db, "users", u);
    await setDoc(
      r,
      {
        name: String(payload?.name || "").trim(),
        phone: phoneDigits,
        phoneDigits,
        photoURL: String(payload?.photoURL || "").trim(),
        updatedAt: now,
        updatedAtMs: Date.now(),
        lastActiveAt: now,
      },
      { merge: true }
    );
    return true;
  } catch {
    return false;
  }
}