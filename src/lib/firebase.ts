import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

function webConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  };
}

export function isFirebaseAuthConfigured(): boolean {
  const c = webConfig();
  return Boolean(c.apiKey && c.authDomain && c.projectId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/** Retorna null se VITE_FIREBASE_* não estiver completo. */
export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseAuthConfigured()) return null;
  if (auth) return auth;
  const c = webConfig();
  app = getApps().length ? getApps()[0]! : initializeApp({
    apiKey: c.apiKey!,
    authDomain: c.authDomain!,
    projectId: c.projectId!,
    storageBucket: c.storageBucket,
    messagingSenderId: c.messagingSenderId,
    appId: c.appId,
  });
  auth = getAuth(app);
  return auth;
}
