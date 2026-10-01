import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import { SCHEME } from '../lib/channel';

// The Supabase client. The URL and publishable key are public by design (they ship inside every
// copy of the app); what protects the data is row-level security on the server.
//
// The session (access + refresh token) is stored in the Android Keystore via expo-secure-store,
// not in plain app storage. Values are split into chunks because the secure store isn't meant
// for large values.

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** False until the project's URL and key are filled in (see .env.example). */
export const isConfigured = url.startsWith('https://') && key.length > 20;

const CHUNK = 1800;

const secureStorage = {
  async getItem(name: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${name}.n`);
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${name}.${i}`);
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(name: string, value: string): Promise<void> {
    await this.removeItem(name);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${name}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${name}.n`, String(n));
  },
  async removeItem(name: string): Promise<void> {
    const count = await SecureStore.getItemAsync(`${name}.n`);
    for (let i = 0; i < Number(count ?? 0); i++) await SecureStore.deleteItemAsync(`${name}.${i}`);
    await SecureStore.deleteItemAsync(`${name}.n`);
  },
};

export const supabase = createClient(isConfigured ? url : 'https://not-configured.invalid', isConfigured ? key : 'not-configured', {
  auth: {
    storage: secureStorage,
    storageKey: 'dayprism.auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE: email links come back to the app with a one-time code (see app/auth-callback.tsx),
    // which only this install can exchange for a session.
    flowType: 'pkce',
  },
});

/** Where links in verification and password-reset emails send the user (must be allowed in Supabase). */
export const AUTH_CALLBACK = `${SCHEME}://auth-callback`;

// Only refresh tokens while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
