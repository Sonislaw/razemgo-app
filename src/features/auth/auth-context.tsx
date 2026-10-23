import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import {
  getSupabase,
  isSupabaseConfigured,
  resetPersistedAuth,
} from '@/lib/supabase';
import { USE_DEMO_DATA } from '@/constants/app';
import {
  authErrorMessage,
  normalizeEmail,
  parseAuthCallback,
} from './auth-data';

export function getAuthRedirectUrl(recovery = false) {
  const base =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback`
      : 'razemgo://auth/callback';
  return base + (recovery ? '?flow=recovery' : '');
}
interface AuthState {
  session: Session | null;
  isLoading: boolean;
  isRecovering: boolean;
  error: string | null;
  retry: () => void;
  resetSession: () => Promise<void>;
  signOut: () => Promise<void>;
  completeCallback: (
    url: string,
  ) => Promise<{ error: string | null; recovery: boolean }>;
  signInGoogle: () => Promise<string | null>;
  requestPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  deleteAccount: () => Promise<string | null>;
}
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setLoading] = useState(
    !USE_DEMO_DATA && isSupabaseConfigured,
  );
  const [isRecovering, setRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, retry] = useState(0);
  const authRevision = useRef(0);
  const callbacks = useRef(
    new Map<string, Promise<{ error: string | null; recovery: boolean }>>(),
  );
  useEffect(() => {
    if (USE_DEMO_DATA || !isSupabaseConfigured) return;
    let alive = true;
    const client = getSupabase();
    const appStateSubscription =
      Platform.OS !== 'web'
        ? AppState.addEventListener('change', (state) => {
            if (state === 'active') client.auth.startAutoRefresh();
            else client.auth.stopAutoRefresh();
          })
        : null;
    if (Platform.OS !== 'web') {
      if (AppState.currentState === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    }
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, current) => {
      if (!alive) return;
      authRevision.current++;
      setSession(current);
      if (event === 'SIGNED_IN') setError(null);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') {
        setRecovering(false);
        callbacks.current.clear();
      }
    });
    void (async () => {
      try {
        const initialUrl =
          Platform.OS === 'web' && typeof window !== 'undefined'
            ? window.location.href
            : await Linking.getInitialURL();
        if (
          alive &&
          initialUrl?.includes('/callback') &&
          new URL(initialUrl).searchParams.get('flow') === 'recovery'
        )
          setRecovering(true);
        const result = await client.auth.getSession();
        if (result.error) throw result.error;
        const revision = authRevision.current;
        if (result.data.session) {
          const checked = await client.auth.getUser(
            result.data.session.access_token,
          );
          if (!alive || revision !== authRevision.current) return;
          if (checked.error) {
            if ([401, 403, 404].includes(checked.error.status ?? 0)) {
              await client.auth.signOut({ scope: 'local' });
              if (alive) setSession(null);
              return;
            }
            throw checked.error;
          }
        }
        if (alive) setSession(result.data.session);
      } catch (cause) {
        if (alive) setError(authErrorMessage(cause));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      subscription.unsubscribe();
      appStateSubscription?.remove();
      if (Platform.OS !== 'web') client.auth.stopAutoRefresh();
    };
  }, [attempt]);
  const completeCallback = useCallback((url: string) => {
    let parsed: ReturnType<typeof parseAuthCallback>;
    try {
      parsed = parseAuthCallback(url, getAuthRedirectUrl());
    } catch {
      return Promise.resolve({
        error: 'Nieprawidłowy link. Wróć do logowania.',
        recovery: false,
      });
    }
    // Router and the native browser may deliver the same code with reordered query parameters.
    const callbackKey = JSON.stringify(parsed);
    const existing = callbacks.current.get(callbackKey);
    if (existing) return existing;
    if (parsed.recovery) setRecovering(true);
    const promise = (async () => {
      try {
        if (parsed.error) {
          setRecovering(false);
          return {
            error: authErrorMessage({ code: parsed.error }),
            recovery: parsed.recovery,
          };
        }
        if (!parsed.code) {
          setRecovering(false);
          return {
            error: 'W linku brakuje potwierdzenia. Poproś o nowy link.',
            recovery: parsed.recovery,
          };
        }
        const result = await getSupabase().auth.exchangeCodeForSession(
          parsed.code,
          parsed.flowId ? { flowId: parsed.flowId } : undefined,
        );
        if (result.error) throw result.error;
        setSession(result.data.session);
        return { error: null, recovery: parsed.recovery };
      } catch (cause) {
        setRecovering(false);
        return { error: authErrorMessage(cause), recovery: parsed.recovery };
      }
    })();
    if (callbacks.current.size >= 10) callbacks.current.clear();
    callbacks.current.set(callbackKey, promise);
    return promise;
  }, []);
  const signOut = async () => {
    if (USE_DEMO_DATA) return;
    const result = await getSupabase().auth.signOut({ scope: 'local' });
    const current = await getSupabase().auth.getSession();
    if (result.error && current.data.session) throw result.error;
    setSession(null);
    setRecovering(false);
    callbacks.current.clear();
  };
  const resetSession = async () => {
    try {
      await resetPersistedAuth();
      setSession(null);
      setRecovering(false);
      setError(null);
      callbacks.current.clear();
    } catch (cause) {
      setError(authErrorMessage(cause));
    }
  };
  const signInGoogle = async () => {
    if (!isSupabaseConfigured)
      return 'Logowanie jest chwilowo niedostępne. Spróbuj później.';
    if (
      Platform.OS !== 'web' &&
      Constants.executionEnvironment === 'storeClient'
    )
      return 'Logowanie Google jest dostępne w zainstalowanej aplikacji. W Expo Go skorzystaj z e-maila.';
    try {
      const redirectTo = getAuthRedirectUrl();
      const { data, error: cause } = await getSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: Platform.OS !== 'web',
          scopes: 'openid email profile',
        },
      });
      if (cause) throw cause;
      if (Platform.OS === 'web') return null;
      if (!data.url) return 'Nie udało się rozpocząć logowania Google.';
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo,
      );
      if (result.type !== 'success') return null;
      return (await completeCallback(result.url)).error;
    } catch (cause) {
      return authErrorMessage(cause);
    }
  };
  const requestPasswordReset = async (email: string) => {
    try {
      const result = await getSupabase().auth.resetPasswordForEmail(
        normalizeEmail(email),
        { redirectTo: getAuthRedirectUrl(true) },
      );
      return result.error ? authErrorMessage(result.error) : null;
    } catch (cause) {
      return authErrorMessage(cause);
    }
  };
  const updatePassword = async (password: string) => {
    try {
      const { error: cause } = await getSupabase().auth.updateUser({
        password,
      });
      if (cause) return authErrorMessage(cause);
      setRecovering(false);
      callbacks.current.clear();
      return null;
    } catch (cause) {
      return authErrorMessage(cause);
    }
  };
  const deleteAccount = async () => {
    try {
      const { data, error: cause } = await getSupabase().functions.invoke(
        'delete-account',
        { method: 'POST' },
      );
      if (cause || !data?.deleted)
        return 'Nie udało się usunąć konta. Sprawdź połączenie i spróbuj ponownie.';
      await signOut();
      return null;
    } catch (cause) {
      return authErrorMessage(cause);
    }
  };
  return (
    <AuthContext
      value={{
        session,
        isLoading,
        isRecovering,
        error,
        retry: () => {
          setLoading(true);
          setError(null);
          retry((n) => n + 1);
        },
        signOut,
        resetSession,
        completeCallback,
        signInGoogle,
        requestPasswordReset,
        updatePassword,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}
