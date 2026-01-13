// src/services/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

/**
 * Firebase Web SDK config
 * Projeto: palpitacojb-app
 * Origem: Firebase Console > Configurações do projeto > SDK Web
 *
 * Observações:
 * - Configuração direta (sem .env)
 * - Evita reinicialização em StrictMode / HMR
 * - Mantém exports consistentes: db / auth
 */

const firebaseConfig = {
  apiKey: "AIzaSyBnbxbwpI8XSMvah7ekxA0lW0jIC0qUiU",
  authDomain: "palpitacojb-app.firebaseapp.com",
  projectId: "palpitacojb-app",
  storageBucket: "palpitacojb-app.appspot.com", // ✅ correção: bucket padrão do Firebase Storage
  messagingSenderId: "884770900140",
  appId: "1:884770900140:web:dd7834c1a1fa635ce5f709",
};

// ✅ Evita reinicialização em Hot Reload / React.StrictMode
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// ✅ Firestore
export const db = getFirestore(app);

// ✅ Auth
export const auth = getAuth(app);

export default app;
