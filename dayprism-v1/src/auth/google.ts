import {
  GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes,
} from '@react-native-google-signin/google-signin';

import { supabase } from './supabase';

// "Continue with Google": the native Google account picker returns an ID token, which Supabase
// verifies and exchanges for a session. Needs a Web OAuth client id (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)
// and an Android OAuth client registered with the app's signing certificate; see SETUP.md.

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

/** The Google button only shows once a client id is configured. */
export const googleEnabled = webClientId.endsWith('.apps.googleusercontent.com');

let configured = false;
function configure() {
  if (configured || !googleEnabled) return;
  GoogleSignin.configure({ webClientId });
  configured = true;
}

/** Returns true when signed in, false when the user cancelled. Throws with a readable message on failure. */
export async function signInWithGoogle(): Promise<boolean> {
  configure();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return false;
    const idToken = response.data.idToken;
    if (!idToken) throw new Error('Google didn\'t return an identity token. Please try again.');

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) return false;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Google Play services are not available on this device.');
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export async function signOutOfGoogle(): Promise<void> {
  if (!googleEnabled) return;
  configure();
  await GoogleSignin.signOut().catch(() => {});
}
