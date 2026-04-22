import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";

/**
 * Long polling avoids Firestore’s default WebChannel transport, which some browser extensions
 * (ad blockers, “privacy” tools) block — they show as net::ERR_BLOCKED_BY_CLIENT on …/Listen/channel.
 */
function getOrInitFirestore(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
  } catch {
    return getFirestore(app);
  }
}

type FirebaseInit =
  | { configured: true; app: FirebaseApp; auth: Auth; db: Firestore }
  | { configured: false; app: null; auth: null; db: null };

function readConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };
}

function initFirebase(): FirebaseInit {
  const cfg = readConfig();
  if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId) {
    if (import.meta.env.DEV) {
      console.warn(
        "[firebase] Missing VITE_FIREBASE_* env vars. Copy .env.example to .env and add your web app config from the Firebase console.",
      );
    }
    return { configured: false, app: null, auth: null, db: null };
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(cfg);
  return {
    configured: true,
    app,
    auth: getAuth(app),
    db: getOrInitFirestore(app),
  };
}

/** Call once at startup; safe under Vite HMR (reuses existing app). */
export const firebase = initFirebase();
