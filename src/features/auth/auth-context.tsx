import { USE_DEMO_DATA } from '@/constants/app';
import {
  clearDeviceNotifications,
  unregisterPushDevice,
} from '@/features/notifications/push-platform';
import {
  resumeCurrentPresence,
  stopCurrentPresence,
} from '@/features/presence/presence-controller';
import { backendRequest } from '@/lib/backend-request';
import { monitoredOperation, reportFailure } from '@/lib/monitoring-core';
import { backendLifecycle } from '@/lib/request-lifecycle';
import {
  getSupabase,
  isSupabaseConfigured,
  resetPersistedAuth,
  signOutSupabase,
} from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import {
  authErrorMessage,
  authRedirectUrl,
  normalizeEmail,
  parseAuthCallback,
} from './auth-data';
import { cleanUpBeforeSignOut } from './auth-network';

export function getAuthRedirectUrl(recovery = false) {
  return authRedirectUrl(
    Constants.expoConfig?.extra?.authScheme ?? 'razemgo-dev',
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : undefined,
    recovery,
  );
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
      backendLifecycle.setAccount(current?.user.id ?? null);
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
        const result = await monitoredOperation('auth.restore', () =>
          client.auth.getSession(),
        );
        if (result.error) throw result.error;
        const revision = authRevision.current;
        if (result.data.session) {
          const accessToken = result.data.session.access_token;
          const checked = await monitoredOperation('auth.restore', () =>
            client.auth.getUser(accessToken),
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
        if (alive) {
          backendLifecycle.setAccount(result.data.session?.user.id ?? null);
          setSession(result.data.session);
        }
      } catch (cause) {
        reportFailure(cause, 'auth.restore');
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
        const code = parsed.code;
        const result = await monitoredOperation('auth.callback', () =>
          getSupabase().auth.exchangeCodeForSession(
            code,
            parsed.flowId ? { flowId: parsed.flowId } : undefined,
          ),
        );
        if (result.error) throw result.error;
        setSession(result.data.session);
        return { error: null, recovery: parsed.recovery };
      } catch (cause) {
        reportFailure(cause, 'auth.callback');
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
    try {
      await cleanUpBeforeSignOut([
        () => stopCurrentPresence(),
        (signal) => unregisterPushDevice(signal),
        () => clearDeviceNotifications(),
      ]);
      await monitoredOperation('auth.sign_out', () =>
        signOutSupabase(session?.access_token),
      );
      authRevision.current++;
      setSession(null);
      setRecovering(false);
      setError(null);
      callbacks.current.clear();
    } catch (cause) {
      resumeCurrentPresence();
      throw cause;
    }
  };
  const resetSession = async () => {
    try {
      await cleanUpBeforeSignOut([
        () => stopCurrentPresence(),
        (signal) =>
          isSupabaseConfigured
            ? unregisterPushDevice(signal)
            : Promise.resolve(),
        () => clearDeviceNotifications(),
      ]);
      await resetPersistedAuth();
      authRevision.current++;
      setSession(null);
      setRecovering(false);
      setError(null);
      callbacks.current.clear();
    } catch (cause) {
      resumeCurrentPresence();
      reportFailure(cause, 'auth.reset_session');
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
      const { data, error: cause } = await monitoredOperation(
        'auth.google',
        () =>
          getSupabase().auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo,
              skipBrowserRedirect: Platform.OS !== 'web',
              scopes: 'openid email profile',
            },
          }),
      );
      if (cause) throw cause;
      if (Platform.OS === 'web') return null;
      if (!data.url) {
        reportFailure(new Error(), 'auth.google');
        return 'Nie udało się rozpocząć logowania Google.';
      }
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo,
      );
      if (result.type !== 'success') return null;
      return (await completeCallback(result.url)).error;
    } catch (cause) {
      reportFailure(cause, 'auth.google');
      return authErrorMessage(cause);
    }
  };
  const requestPasswordReset = async (email: string) => {
    try {
      const result = await monitoredOperation('auth.reset_request', () =>
        getSupabase().auth.resetPasswordForEmail(normalizeEmail(email), {
          redirectTo: getAuthRedirectUrl(true),
        }),
      );
      return result.error ? authErrorMessage(result.error) : null;
    } catch (cause) {
      reportFailure(cause, 'auth.reset_request');
      return authErrorMessage(cause);
    }
  };
  const updatePassword = async (password: string) => {
    try {
      const { error: cause } = await monitoredOperation('auth.password', () =>
        getSupabase().auth.updateUser({
          password,
        }),
      );
      if (cause) return authErrorMessage(cause);
      setRecovering(false);
      callbacks.current.clear();
      return null;
    } catch (cause) {
      reportFailure(cause, 'auth.password');
      return authErrorMessage(cause);
    }
  };
  const deleteAccount = async () => {
    try {
      const { data, error: cause } = await backendRequest(
        (signal) =>
          getSupabase().functions.invoke('delete-account', {
            method: 'POST',
            signal,
          }),
        'account.delete',
      );
      if (cause || !data?.deleted)
        return 'Nie udało się usunąć konta. Sprawdź połączenie i spróbuj ponownie.';
      await signOut();
      return null;
    } catch (cause) {
      reportFailure(cause, 'account.delete');
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
