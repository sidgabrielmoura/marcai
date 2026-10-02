import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";

export const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyAUILwMtEmoo-Cw6Cv3dA5BDa5ytu3hs9I",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "marcai-a880a.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "marcai-a880a",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "marcai-a880a.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "476040130163",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:476040130163:web:5d3c45b61f47c582fe8406",
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-QGS249Z717",
};

// Initialize Firebase (evita inicialização duplicada durante Fast Refresh no Next.js)
export const app: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

let analyticsInstance: Analytics | null = null;

/**
 * Obtém a instância de Analytics de forma segura para Next.js (SSR safe).
 */
export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (analyticsInstance) {
    return analyticsInstance;
  }

  try {
    const supported = await isSupported();
    if (supported) {
      analyticsInstance = getAnalytics(app);
      return analyticsInstance;
    }
  } catch (error) {
    console.warn("[Firebase] Falha ao inicializar Analytics:", error);
  }

  return null;
}
