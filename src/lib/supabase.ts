import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { sessionStorage } from './session-storage';
import { installAuthCrypto } from './auth-crypto';
import { monitorAuthRefresh } from './monitoring-core';

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
      global: { fetch: monitorAuthRefresh((input,init)=>fetch(input,init)) },
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

export async function resetPersistedAuth() {
  client?.auth.stopAutoRefresh();
  // Also permits recovery when the stored session manifest is damaged.
  await sessionStorage.removeItem(storageKey).catch(() => undefined);
  if (client) await client.auth.signOut({ scope: 'local' });
}
