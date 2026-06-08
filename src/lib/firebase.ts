import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCPoDZ0pSYIyUgeciVDbKkILhkUXZ8AJ4g",
  authDomain: "gestionteamnew.firebaseapp.com",
  projectId: "gestionteamnew",
  storageBucket: "gestionteamnew.firebasestorage.app",
  messagingSenderId: "682522030466",
  appId: "1:682522030466:web:c1c41cd3c024653332df9b",
  measurementId: "G-DDNN7CD4HT"
};

// Initialize Firebase only if it hasn't been initialized yet
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { app, db };
