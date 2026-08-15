/* eslint-disable no-unused-vars */
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

import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { safeISO } from "./account.formatters";

const PLAN_FREE = "FREE";
const PLAN_STANDARD = "STANDARD";
const PLAN_PLUS = "PLUS";
const PLAN_PREMIUM = "PREMIUM";
const PLAN_VIP = "VIP";

function nowIso() {
  return new Date().toISOString();
}

function normalizePlan(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s === PLAN_STANDARD) return PLAN_STANDARD;
  if (s === PLAN_PLUS) return PLAN_PLUS;
  if (s === PLAN_PREMIUM) return PLAN_PREMIUM;
  if (s === PLAN_VIP) return PLAN_VIP;
  return PLAN_FREE;
}

function normalizeIsoString(v) {
  return String(v || "").trim();
}

function normalizeTimestampIso(v) {
  try {
    if (v && typeof v.toDate === "function") {
      const d = v.toDate();
      if (d instanceof Date && Number.isFinite(d.getTime())) {
        return d.toISOString();
      }
    }
  } catch {
    // fallback abaixo
  }

  return "";
}

const SIGNUP_TRIAL_DAYS = 7;

function addUtcDaysIso(startIso, days) {
  const startMs = Date.parse(String(startIso || "").trim());

  if (!Number.isFinite(startMs)) return "";

  return new Date(
    startMs + Number(days || 0) * 24 * 60 * 60 * 1000
  ).toISOString();
}

function isTrialCurrentlyActive({ trialActive, trialEndAt, refIso }) {
  if (trialActive !== true) return false;
  if (!safeISO(trialEndAt)) return false;

  return isFutureIso(trialEndAt, refIso);
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

          trialStartAt: createdAtIso,
          trialEndAt: addUtcDaysIso(createdAtIso, SIGNUP_TRIAL_DAYS),
          trialActive: true,

          // Segurança temporal: início ancorado no servidor.
          // O fim proposto pelo client só será aceito pelas Rules
          // dentro de uma janela de ±2 minutos em torno de 7 dias.
          trialStartAtTs: serverTimestamp(),
          trialEndAtTs: Timestamp.fromMillis(
            Date.now() + SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000
          ),
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
      // Documento legado sem plano:
      // preserva o Trial independente e inicializa somente o plano como FREE.
      patch.plan = PLAN_FREE;
      patch.planStartAt = "";
      patch.planEndAt = "";
      patch.isLifetime = false;
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

    let trialStartAt =
      normalizeTimestampIso(data.trialStartAtTs) ||
      normalizeIsoString(data.trialStartAt);
    let trialEndAt =
      normalizeTimestampIso(data.trialEndAtTs) ||
      normalizeIsoString(data.trialEndAt);
    let trialActive = isTrialCurrentlyActive({
      trialActive: data.trialActive === true,
      trialEndAt,
      refIso: currentNowIso,
    });

    const hasPlanField = String(data.plan || "").trim().length > 0;

    // Documento legado sem plano:
    // Trial permanece independente; ausência de plano comercial significa FREE.
    if (!hasPlanField) {
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

    // Trial é independente do plano comercial.
    // Ao vencer, preservamos as datas e apenas desativamos o entitlement.
    if (
      data.trialActive === true &&
      safeISO(trialEndAt) &&
      !isFutureIso(trialEndAt, currentNowIso)
    ) {
      // A expiração é derivada localmente de trialEndAt.
      // Não persistimos trialActive=false pelo cliente porque
      // o estado do Trial é protegido pelas Firestore Rules.
      trialActive = false;
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

      trialStartAt,
      trialEndAt,
      trialActive,

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