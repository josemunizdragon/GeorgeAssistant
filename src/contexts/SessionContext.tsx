import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as Keychain from 'react-native-keychain';

const SERVICE_NAME = 'com.georgeassistant.session';

export type SessionUser = {
  id: string;
  email?: string;
};

type SessionState = {
  token: string | null;
  user: SessionUser | null;
  isHydrated: boolean;
};

type SessionContextValue = SessionState & {
  signIn: (token: string, user: SessionUser) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const signIn = useCallback(async (newToken: string, newUser: SessionUser) => {
    try {
      await Keychain.setGenericPassword(
        JSON.stringify(newUser),
        newToken,
        { service: SERVICE_NAME }
      );
      setToken(newToken);
      setUser(newUser);
    } catch (e) {
      console.error('[SessionContext] signIn error:', e);
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await Keychain.resetGenericPassword({ service: SERVICE_NAME });
      setToken(null);
      setUser(null);
    } catch (e) {
      console.error('[SessionContext] signOut error:', e);
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const credentials = await Keychain.getGenericPassword({ service: SERVICE_NAME });
        if (cancelled) return;
        if (credentials) {
          try {
            const parsedUser = JSON.parse(credentials.username) as SessionUser;
            setUser(parsedUser);
            setToken(credentials.password);
          } catch {
            setToken(credentials.password);
            setUser({ id: 'user' });
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[SessionContext] hydrate error:', e);
        }
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const value: SessionContextValue = {
    token,
    user,
    isHydrated,
    signIn,
    signOut,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return ctx;
}
