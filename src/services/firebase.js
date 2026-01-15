// src/services/firebase.js
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

/**
 * Firebase Web App — configuração OFICIAL
 * Projeto: palpitacojb-app
 *
 * ✅ App nomeado (evita colisão em HMR)
 * ✅ NÃO usa apps[0] (pode ser outro projeto/instância)
 * ✅ Auth com persistência local
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
  const apps = getApps();
  const named = apps.find((a) => a?.name === APP_NAME);
  if (named) return named;

  // Mesmo que exista outro app default, podemos criar o nosso nomeado com segurança
  return initializeApp(firebaseConfig, APP_NAME);
}

export const app = getOrInitApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Persistência local (não quebra se falhar; só evita loop de sessão instável)
try {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
} catch {}

export default app;
