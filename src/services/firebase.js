// src/services/firebase.js
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

/**
 * Firebase Web App — configuração OFICIAL
 * Projeto: palpitacojb-app
 *
 * - App nomeado para evitar colisão (HMR / múltiplos bundles)
 * - Seguro para React + Vercel
 */

const firebaseConfig = {
  apiKey: "AIzaSyBnbxbwpI8XSMVah7ekxAo1Wy0j1C0qUiU",
  authDomain: "palpitacojb-app.firebaseapp.com",
  projectId: "palpitacojb-app",
  storageBucket: "palpitacojb-app.appspot.com",
  messagingSenderId: "884770900140",
  appId: "1:884770900140:web:dd7834c1a1fa635ce5f709",
};

const APP_NAME = "palpitaco-web";

function getOrInitApp() {
  try {
    return getApp(APP_NAME);
  } catch {
    const apps = getApps();
    if (apps.length) return apps[0];
    return initializeApp(firebaseConfig, APP_NAME);
  }
}

export const app = getOrInitApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
