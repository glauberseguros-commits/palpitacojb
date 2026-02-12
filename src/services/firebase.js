import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyBnbxbwpI8XSMVah7ekxAo1Wy0j1C0qUiU",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "palpitacojb-app.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "palpitacojb-app",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "palpitacojb-app.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "884770900140",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:884770900140:web:dd7834c1a1fa635ce5f709",
};

const APP_NAME = "palpitaco-web";

function getOrInitApp() {
  const apps = getApps();
  const named = apps.find((a) => a?.name === APP_NAME);
  if (named) return named;
  return initializeApp(firebaseConfig, APP_NAME);
}

export const app = getOrInitApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const authReady = (async () => {
  try {
    if (typeof window === "undefined") return true;
    await setPersistence(auth, browserLocalPersistence);
    return true;
  } catch {
    return false;
  }
})();

export default app;
