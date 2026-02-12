// src/pages/Account/account.profile.service.js

/**
 * Firestore profile + Trial (schema definitivo)
 * Collection: users/{uid}
 *
 * Campos:
 * - name: string
 * - phone: string (apenas dígitos)
 * - photoURL: string
 * - createdAt: ISO
 * - updatedAt: ISO
 * - email: string
 * - trialStartAt: ISO
 * - trialEndAt: ISO
 * - trialActive: boolean
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { TRIAL_DAYS } from "./account.constants";
import { isoPlusDays, safeISO, safeBool } from "./account.formatters";

/**
 * Garante o doc users/{uid} e garante trialStartAt/trialEndAt/trialActive.
 * Retorna { ok, created }.
 */
export async function ensureUserDoc(db, uid, user) {
  const u = String(uid || "").trim();
  if (!u) return { ok: false, created: false };

  try {
    const r = doc(db, "users", u);
    const snap = await getDoc(r);

    const createdAtIso =
      user?.metadata?.creationTime
        ? new Date(user.metadata.creationTime).toISOString()
        : new Date().toISOString();

    // Se não existe, cria doc inicial com trial
    if (!snap.exists()) {
    const trialStartAt = createdAtIso;
      const trialEndAt = isoPlusDays(trialStartAt, TRIAL_DAYS);

      await setDoc(
        r,
        {
          createdAt: createdAtIso,
          
          createdAtMs: Date.parse(createdAtIso) || Date.now(),
          updatedAt: new Date().toISOString(),
          updatedAtMs: Date.now(),
          email: String(user?.email || "").trim().toLowerCase(),

          name: String(user?.displayName || "").trim(),
          phone: "",
          photoURL: "",

          trialStartAt,
          trialEndAt,
          trialActive: true,
        },
        { merge: true }
      );

      return { ok: true, created: true };
    }

    // Existe: normaliza/patcheia campos ausentes
    const data = snap.data() || {};
    const trialStartAt = String(data.trialStartAt || "").trim() || createdAtIso;
    const trialEndAt =
      String(data.trialEndAt || "").trim() || isoPlusDays(trialStartAt, TRIAL_DAYS);

    const nowIso = new Date().toISOString();
    const active = safeISO(trialEndAt) ? safeISO(nowIso) < safeISO(trialEndAt) : false;

    const patch = {};
    let needPatch = false;

    if (!String(data.createdAt || "").trim()) {
      patch.createdAt = createdAtIso;
      needPatch = true;
    }
    if (!String(data.email || "").trim() && user?.email) {
      patch.email = String(user.email).trim().toLowerCase();
      needPatch = true;
    }
    if (!String(data.trialStartAt || "").trim()) {
      patch.trialStartAt = trialStartAt;
      needPatch = true;
    }
    if (!String(data.trialEndAt || "").trim()) {
      patch.trialEndAt = trialEndAt;
      needPatch = true;
    }

    if (data.trialActive == null) {
      patch.trialActive = active;
      needPatch = true;
    } else {
      const cur = safeBool(data.trialActive);
      if (cur !== active) {
        patch.trialActive = active;
        needPatch = true;
      }
    }

    if (needPatch) {
      patch.updatedAt = new Date().toISOString();
      patch.updatedAtMs = Date.now();
      await setDoc(r, patch, { merge: true });
    }

    return { ok: true, created: false };
  } catch {
    return { ok: false, created: false };
  }
}

/**
 * Carrega perfil do Firestore e faz compat de campos antigos.
 * Retorna { name, phone, photoURL, trialStartAt, trialEndAt, trialActive } ou null.
 */
export async function loadUserProfile(db, uid) {
  const u = String(uid || "").trim();
  if (!u) return null;

  try {
    const r = doc(db, "users", u);
    const snap = await getDoc(r);
    if (!snap.exists()) return null;

    const data = snap.data() || {};

    const name = String(data.name || "").trim();

    const phone =
      String(data.phone || "").trim() ||
      String(data.phoneDigits || "").trim(); // compat

    const photoURL =
      String(data.photoURL || "").trim() ||
      String(data.photoUrl || "").trim(); // compat
    const trialStartAt = String(data.trialStartAt || "").trim();
    const trialEndAt = String(data.trialEndAt || "").trim();

    // garante consistência: se passou do prazo, trialActive não pode ficar true
    const nowIso = new Date().toISOString();
    const computedActive = safeISO(trialEndAt) ? safeISO(nowIso) < safeISO(trialEndAt) : false;

    const storedActive = data.trialActive === true;
    const trialActive = safeISO(trialEndAt) ? computedActive : storedActive;

    return {
      name,
      phone,
      photoURL,

      trialStartAt,
      trialEndAt,
      trialActive,
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
    const r = doc(db, "users", u);
    await setDoc(
      r,
      {
        name: String(payload?.name || "").trim(),
        phone: String(payload?.phone || "").trim(),
        photoURL: String(payload?.photoURL || "").trim(),
        updatedAt: new Date().toISOString(),
        updatedAtMs: Date.now(),
      },
      { merge: true }
    );
    return true;
  } catch {
    return false;
  }
}










