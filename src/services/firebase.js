// src/services/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

function envOrFallback(envKey, fallback, label) {
  const v = String(process.env[envKey] || "").trim();
  if (v) return v;

  // ⚠️ Mantém compatibilidade, mas deixa explícito o risco
  if (typeof window !== "undefined") {
    // evita poluir testes/SSR
    console.warn(
      `[firebase] Variável ${envKey} ausente. Usando fallback embutido para ${label}.`
    );
  }
  return fallback;
}

const firebaseConfig = {
  apiKey: envOrFallback(
    "REACT_APP_FIREBASE_API_KEY",
    "AIzaSyBnbxbwpI8XSMVah7ekxAo1Wy0j1C0qUiU",
    "apiKey"
  ),
  authDomain: envOrFallback(
    "REACT_APP_FIREBASE_AUTH_DOMAIN",
    "palpitacojb-app.firebaseapp.com",
    "authDomain"
  ),
  projectId: envOrFallback(
    "REACT_APP_FIREBASE_PROJECT_ID",
    "palpitacojb-app",
    "projectId"
  ),
  storageBucket: envOrFallback(
    "REACT_APP_FIREBASE_STORAGE_BUCKET",
    "palpitacojb-app.appspot.com",
    "storageBucket"
  ),
  messagingSenderId: envOrFallback(
    "REACT_APP_FIREBASE_MESSAGING_SENDER_ID",
    "884770900140",
    "messagingSenderId"
  ),
  appId: envOrFallback(
    "REACT_APP_FIREBASE_APP_ID",
    "1:884770900140:web:dd7834c1a1fa635ce5f709",
    "appId"
  ),
};

function getOrInitApp() {
  const apps = getApps();

  // ✅ Se já existe qualquer app, usa ele (evita duplicar default + named)
  if (apps.length) {
    try {
      return getApp(); // default, se existir
    } catch {
      return apps[0]; // fallback seguro
    }
  }

  // ✅ Inicializa apenas quando não há nenhum app
  return initializeApp(firebaseConfig);
}

export const app = getOrInitApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ✅ Promise única: garante persistência antes de login (usada no auth.js)
export const authReady = (async () => {
  try {
    if (typeof window === "undefined") return true;
    await setPersistence(auth, browserLocalPersistence);
    return true;
  } catch (err) {
    console.warn("[firebase] setPersistence falhou; seguindo sem persistência.", err);
    return false;
  }
})();

export default app;