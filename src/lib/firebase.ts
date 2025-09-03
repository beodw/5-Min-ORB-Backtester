// @ts-nocheck
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  "projectId": "algo-insights-tpn97",
  "appId": "1:563602777406:web:7ab225de99b6bdd7bbf86f",
  "storageBucket": "algo-insights-tpn97.firebasestorage.app",
  "apiKey": "AIzaSyCPLL-1kMjirNHeg0gnEXD4omZJ8Dt1348",
  "authDomain": "algo-insights-tpn97.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "563602777406"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { app, db };
