import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { firebase } from "@/lib/firebase";
import { emptyPreferences, emptyProfile } from "@/lib/userDefaults";
import { clearUserData, subscribeUserData } from "@/lib/store";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function defaultFirestoreUser(email: string) {
  const profile = emptyProfile(email);
  const preferences = emptyPreferences();
  return {
    profile,
    preferences,
    applications: [] as unknown[],
    dismissedJobIds: [] as string[],
    profileSetup: { completed: false, currentStep: 1 },
  };
}

async function ensureOAuthUserDoc(u: User) {
  if (!firebase.db) throw new Error("Firestore not available");
  const ref = doc(firebase.db, "users", u.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, defaultFirestoreUser(u.email || ""));
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = firebase.configured;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!configured || !firebase.auth) {
      setLoading(false);
      setUser(null);
      return;
    }
    return onAuthStateChanged(firebase.auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, [configured]);

  useEffect(() => {
    if (!configured || !firebase.db || !user) {
      clearUserData();
      return;
    }
    const unsub = subscribeUserData(user.uid);
    return () => {
      unsub();
      clearUserData();
    };
  }, [configured, user]);

  const signInWithGoogle = useCallback(async () => {
    if (!firebase.auth || !firebase.db) throw new Error("Firebase not available");
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(firebase.auth, provider);
    await ensureOAuthUserDoc(cred.user);
  }, []);

  const signInWithApple = useCallback(async () => {
    if (!firebase.auth || !firebase.db) throw new Error("Firebase not available");
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    const cred = await signInWithPopup(firebase.auth, provider);
    await ensureOAuthUserDoc(cred.user);
  }, []);

  const signOut = useCallback(async () => {
    if (!firebase.auth) return;
    await firebaseSignOut(firebase.auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configured,
      signInWithGoogle,
      signInWithApple,
      signOut,
    }),
    [user, loading, configured, signInWithGoogle, signInWithApple, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
