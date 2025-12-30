// src/services/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBnbxbwpI8XSMVah7ekxAo1Wy0jIC0qUiU",
  authDomain: "palpitacojb-app.firebaseapp.com",
  projectId: "palpitacojb-app",
  storageBucket: "palpitacojb-app.firebasestorage.app",
  messagingSenderId: "884770900140",
  appId: "1:884770900140:web:dd7834c1a1fa635ce5f709",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
