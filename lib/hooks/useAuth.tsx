'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { endClientSession } from '@/lib/security/logout';

type CachedProfile = { displayName: string | null; photoURL: string | null; email: string | null } | null;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  cachedProfile: CachedProfile;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  cachedProfile: null,
  refreshUser: async () => {},
  logout: async () => {},
});

const PROFILE_CACHE_KEY = 'nq_profile';

function saveProfileCache(user: User) {
  try {
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
      displayName: user.displayName,
      photoURL: user.photoURL,
      email: user.email,
    }));
  } catch {}
}

function clearProfileCache() {
  try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cachedProfile, setCachedProfile] = useState<CachedProfile>(() => {
    try {
      const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  // Guards against repeated rehydration attempts on a broken cookie.
  const rehydrateTriedRef = useRef(false);
  const authVersionRef = useRef(0);
  const signingOutRef = useRef(false);
  const recoveryRef = useRef<Promise<unknown> | null>(null);

  const clearLocalSession = useCallback(() => {
    setIsAdmin(false);
    setUser(null);
    setCachedProfile(null);
    clearProfileCache();
    setLoading(false);
  }, []);

  useEffect(() => {
    let firstAuthEvent = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const checkExistingSession = firstAuthEvent;
      firstAuthEvent = false;
      const version = ++authVersionRef.current;
      const isCurrent = () => version === authVersionRef.current && !signingOutRef.current;
      if (!isCurrent()) return;
      if (firebaseUser && !firebaseUser.isAnonymous) {
        // Recovery is for initial startup only, never a later sign-out event.
        rehydrateTriedRef.current = true;
        try {
          let currentIsAdmin: boolean | undefined;
          if (checkExistingSession && !firebaseUser.isAnonymous) {
            const response = await fetch('/api/auth/session', { cache: 'no-store' });
            if (!isCurrent()) return;
            if (response.status === 401) {
              await signOut(auth);
              clearLocalSession();
              return;
            }
            if (!response.ok) throw new Error('Session check unavailable');
            const session = await response.json();
            currentIsAdmin = session.isAdmin === true;
            if (session.uid !== firebaseUser.uid) { await signOut(auth); clearLocalSession(); return; }
          }
          const tokenResult = await firebaseUser.getIdTokenResult();
          if (!isCurrent()) return;
          setIsAdmin(currentIsAdmin ?? tokenResult.claims.admin === true);
          setUser(firebaseUser);
          saveProfileCache(firebaseUser);
          setCachedProfile({ displayName: firebaseUser.displayName, photoURL: firebaseUser.photoURL, email: firebaseUser.email });
          setLoading(false);
        } catch {
          if (isCurrent()) clearLocalSession();
        }
        return;
      }

      // No client-side Firebase session. IndexedDB may have been cleared
      // while the HTTP-only server cookie is still valid (private mode, new
      // browser, cross-device). Try to rehydrate once before giving up —
      // otherwise the user bounces through /sign-in even though the proxy
      // considers them logged in.
      if (!rehydrateTriedRef.current) {
        rehydrateTriedRef.current = true;
        try {
          const res = await fetch('/api/auth/rehydrate', { method: 'POST' });
          if (!isCurrent()) return;
          if (res.ok) {
            const { customToken } = await res.json();
            if (!isCurrent()) return;
            if (customToken) {
              recoveryRef.current = signInWithCustomToken(auth, customToken);
              await recoveryRef.current;
              // onAuthStateChanged will fire again with the rehydrated user —
              // let that branch handle setting state.
              return;
            }
          }
        } catch {
          // Fall through to signed-out state.
        }
      }

      if (isCurrent()) clearLocalSession();
    });

    return () => {
      ++authVersionRef.current;
      unsubscribe();
    };
  }, [clearLocalSession]);

  const logout = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    rehydrateTriedRef.current = true;
    ++authVersionRef.current;
    try {
      await endClientSession(
        () => fetch('/api/auth/session', { method: 'DELETE' }),
        async () => {
          // A custom-token sign-in already in flight must finish before sign-out.
          await recoveryRef.current?.catch(() => {});
          await signOut(auth);
        },
      );
      clearLocalSession();
      // Start a fresh document so cached authenticated routes cannot survive.
      window.location.replace('/sign-in');
    } catch (error) {
      signingOutRef.current = false;
      throw error;
    }
  }, [clearLocalSession]);

  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    saveProfileCache(auth.currentUser);
    setCachedProfile({ displayName: auth.currentUser.displayName, photoURL: auth.currentUser.photoURL, email: auth.currentUser.email });
    // Force React to see the updated user by setting a fresh reference
    setUser(null);
    setUser(auth.currentUser);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, cachedProfile, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
