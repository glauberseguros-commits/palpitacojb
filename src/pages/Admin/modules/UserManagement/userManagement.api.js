import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "../../../../services/firebase";

/**
 * Gestão administrativa de users/{uid}.
 *
 * Contrato V1:
 * - lista usuários existentes;
 * - altera somente:
 *   plan
 *   planStartAt
 *   planEndAt
 *   isLifetime
 *
 * Não altera:
 * - Trial;
 * - papel ADMIN;
 * - identidade/perfil;
 * - Firebase Authentication;
 * - exclusão de usuário.
 */

export const ADMIN_USER_PLAN_OPTIONS = Object.freeze([
  "FREE",
  "STANDARD",
  "PLUS",
  "PREMIUM",
  "VIP",
]);

const ADMIN_USER_PLAN_SET = new Set(ADMIN_USER_PLAN_OPTIONS);

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizePlan(value) {
  const plan = normalizeString(value).toUpperCase();

  if (!ADMIN_USER_PLAN_SET.has(plan)) {
    throw new Error(`Plano administrativo inválido: ${plan || "(vazio)"}`);
  }

  return plan;
}

function normalizeBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;

  throw new Error("isLifetime deve ser boolean.");
}

function normalizeDateValue(value) {
  if (value == null) return "";

  const raw = normalizeString(value);

  if (!raw) return "";

  const timestamp = Date.parse(raw);

  if (!Number.isFinite(timestamp)) {
    throw new Error(`Data inválida: ${raw}`);
  }

  return new Date(timestamp).toISOString();
}

function normalizeUserSnapshot(snapshot) {
  const data = snapshot.data() || {};

  return {
    uid: snapshot.id,

    email: normalizeString(data.email),
    name: normalizeString(data.name),
    phone: normalizeString(data.phone),
    photoURL: normalizeString(data.photoURL),

    plan: normalizeString(data.plan).toUpperCase() || "FREE",
    planStartAt: normalizeString(data.planStartAt),
    planEndAt: normalizeString(data.planEndAt),
    isLifetime: data.isLifetime === true,

    trialStartAt: normalizeString(data.trialStartAt),
    trialEndAt: normalizeString(data.trialEndAt),
    trialActive: data.trialActive === true,

    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    lastActiveAt: data.lastActiveAt ?? null,
  };
}

function sortUsers(users) {
  return [...users].sort((a, b) => {
    const aName =
      normalizeString(a.name) ||
      normalizeString(a.email) ||
      normalizeString(a.uid);

    const bName =
      normalizeString(b.name) ||
      normalizeString(b.email) ||
      normalizeString(b.uid);

    return aName.localeCompare(bName, "pt-BR", {
      sensitivity: "base",
    });
  });
}

export async function listUsers() {
  const snapshot = await getDocs(collection(db, "users"));

  return sortUsers(snapshot.docs.map(normalizeUserSnapshot));
}

export async function updateUserAccess(uid, payload = {}) {
  const safeUid = normalizeString(uid);

  if (!safeUid) {
    throw new Error("UID do usuário é obrigatório.");
  }

  const plan = normalizePlan(payload.plan);
  const isLifetime = normalizeBoolean(payload.isLifetime);

  let planStartAt = normalizeDateValue(payload.planStartAt);
  let planEndAt = normalizeDateValue(payload.planEndAt);

  /**
   * FREE não representa assinatura comercial.
   * Ao retornar para FREE, removemos a validade comercial.
   */
  if (plan === "FREE") {
    planStartAt = "";
    planEndAt = "";
  } else {
    if (!planStartAt) {
      throw new Error(
        "Plano com acesso exige data inicial."
      );
    }

    if (isLifetime) {
      planEndAt = "";
    } else {
      if (!planEndAt) {
        throw new Error(
          "Plano temporário exige data final."
        );
      }

      if (Date.parse(planEndAt) <= Date.parse(planStartAt)) {
        throw new Error(
          "A data final deve ser posterior à data inicial."
        );
      }
    }
  }

  const updatePayload = {
    plan,
    planStartAt,
    planEndAt,
    isLifetime: plan === "FREE" ? false : isLifetime,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(
    doc(db, "users", safeUid),
    updatePayload
  );

  return {
    uid: safeUid,
    ...updatePayload,
  };
}