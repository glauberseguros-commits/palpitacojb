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
 */

/**
 * Aguarda inicialização do Firebase Auth
 */
async function ensureAuthReady() {
  try {
    await authReady;
  } catch {}
}

/**
 * Login anônimo seguro
 */
export async function loginAnonymous() {
  await ensureAuthReady();

  // se já estiver logado, não cria outro usuário
  if (auth.currentUser) {
    return auth.currentUser;
  }

  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (err) {
    console.error("Auth anonymous login error:", err);
    throw err;
  }
}

/**
 * Logout completo
 */
export async function logoutAuth() {
  await ensureAuthReady();

  try {
    await signOut(auth);
  } catch (err) {
    console.error("Auth logout error:", err);
  }
}

/**
 * Listener de estado de autenticação
 */
export function onAuthChange(callback) {
  if (typeof callback !== "function") {
    throw new Error("onAuthChange requires a callback function");
  }

  return onAuthStateChanged(auth, (user) => {
    callback(user ?? null);
  });
}