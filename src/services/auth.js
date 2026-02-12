import {
  signInAnonymously,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

import { auth, authReady } from "./firebase";

/**
 * =====================================================
 * AUTH SERVICE — PALPITACO
 * =====================================================
 * Regras:
 * - Login inicial: anônimo (free + trial)
 * - Controle de sessão será feito no Firestore (próximo passo)
 * - Aqui apenas identidade + listener
 */

/**
 * Garante que o Auth está pronto (persistência aplicada quando possível)
 */
async function ensureAuthReady() {
  try {
    await authReady;
  } catch {}
}

/**
 * Login anônimo
 * Usado para:
 * - usuário free
 * - trial automático (24h)
 */
export async function loginAnonymous() {
  await ensureAuthReady();
  const cred = await signInAnonymously(auth);
  return cred.user;
}

/**
 * Logout completo
 */
export async function logoutAuth() {
  await ensureAuthReady();
  await signOut(auth);
}

/**
 * Listener de estado de autenticação
 * Retorna unsubscribe()
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
