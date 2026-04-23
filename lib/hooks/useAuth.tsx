'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  // Guards against repeated rehydration attempts on a broken cookie.
  const rehydrateTriedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const tokenResult = await firebaseUser.getIdTokenResult();
        setIsAdmin(!!tokenResult.claims.admin);
        setUser(firebaseUser);
        setLoading(false);
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
          if (res.ok) {
            const { customToken } = await res.json();
            if (customToken) {
              await signInWithCustomToken(auth, customToken);
              // onAuthStateChanged will fire again with the rehydrated user —
              // let that branch handle setting state.
              return;
            }
          }
        } catch {
          // Fall through to signed-out state.
        }
      }

      setIsAdmin(false);
      setUser(null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    // Force React to see the updated user by setting a fresh reference
    setUser(null);
    setUser(auth.currentUser);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
