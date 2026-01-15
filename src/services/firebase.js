// src/services/firebase.js
import { initializeApp, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * Firebase Web App — configuração OFICIAL
 * Projeto: palpitacojb-app
 */

const firebaseConfig = {
  apiKey: "AIzaSyBnbxbwpI8XSMVah7ekxAo1Wy0j1C0qUiU",
  authDomain: "palpitacojb-app.firebaseapp.com",
  projectId: "palpitacojb-app",
  storageBucket: "palpitacojb-app.appspot.com", // ✅ OBRIGATÓRIO
  messagingSenderId: "884770900140",
  appId: "1:884770900140:web:dd7834c1a1fa635ce5f709",
};

// 🔒 App nomeado (evita colisão e bug de API key)
const APP_NAME = "palpitaco-web";

function getOrInitApp() {
  try {
    return getApp(APP_NAME);
  } catch {
    return initializeApp(firebaseConfig, APP_NAME);
  }
}

export const app = getOrInitApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
