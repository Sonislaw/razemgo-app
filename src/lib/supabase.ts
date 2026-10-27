import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { sessionStorage } from './session-storage';
import { installAuthCrypto } from './auth-crypto';
import { monitorAuthRefresh, reportFailure } from './monitoring-core';
import { signOutStoredSession, withAuthRequestTimeout } from '@/features/auth/auth-network';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
export const isSupabaseConfigured = /^https?:\/\//.test(url) && key.length > 20;
const storageKey =
  'razemgo.' + url.replace(/[^a-zA-Z0-9._-]/g, '_') + '.session';

// Lazy initialization keeps the welcome screen usable before environment setup.
let client: SupabaseClient<Database> | undefined;
export function getSupabase() {
  if (!isSupabaseConfigured)
    throw new Error('Logowanie jest chwilowo niedostępne. Spróbuj później.');
  if (!client) {
    installAuthCrypto();
    client = createClient<Database>(url, key, {
      global: { fetch: monitorAuthRefresh(withAuthRequestTimeout((input,init)=>fetch(input,init))) },
      auth: {
        storageKey,
        storage: sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
  }
  return client;
}

export async function signOutSupabase(accessToken?: string) {
  await signOutStoredSession(getSupabase().auth, sessionStorage, storageKey, accessToken,
    error => reportFailure(error, 'auth.sign_out'));
}

export async function resetPersistedAuth() {
  // Also permits recovery when the stored session manifest is damaged. Keep
  // auto-refresh enabled for the next login in the same foreground app session.
  if (client) await signOutStoredSession(client.auth, sessionStorage, storageKey);
  else await sessionStorage.removeItem(storageKey);
}
