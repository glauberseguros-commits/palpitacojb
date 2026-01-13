// src/services/auth.js
import {
  signInAnonymously,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

import { auth } from "./firebase";

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
 * Login anônimo
 * Usado para:
 * - usuário free
 * - trial automático (24h)
 */
export async function loginAnonymous() {
  const cred = await signInAnonymously(auth);
  return cred.user;
}

/**
 * Logout completo
 */
export async function logoutAuth() {
  await signOut(auth);
}

/**
 * Listener de estado de autenticação
 * Retorna unsubscribe()
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
