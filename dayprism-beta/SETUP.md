# Setting up the DayPrism backend

DayPrism uses **Supabase** for accounts and the central database. Everything below happens in web
dashboards with your own accounts. It takes about 20 minutes, and you only do it once.

## 1. Create the Supabase project (5 min)

1. Sign up at <https://supabase.com> and create a project. Pick the region closest to most of your
   users, and save the database password in your password manager (the app never needs it).
2. **Project Settings → API**: copy the **Project URL** and the **publishable (anon) key** into
   `dayprism-beta/.env` (copy `.env.example` first). These are public by design; the **service_role** key
   is not, so never put it in the app, in git, or in a chat.

## 2. Create the database schema (2 min)

**SQL Editor → New query**, paste the whole of `../supabase/migrations/20261001000000_init.sql`, then **Run**.
It creates the tables, row-level security policies, triggers and the account/admin functions.

Then run every later file in `../supabase/migrations/` the same way, in name order (each is safe to
re-run). Newer app versions skip syncing a table whose migration hasn't been run yet, and catch up
once it has.

(Later, with the Supabase CLI: `npx supabase link` then `npx supabase db push` applies new migrations.)

## 3. Authentication settings (5 min)

**Authentication → Sign In / Providers → Email**
- Enable email provider: on
- **Confirm email: on** (users verify with a 6-digit code)
- Minimum password length: **8**; password requirements: **letters and digits**
- Secure password change: on

**Authentication → Emails → Templates**
- *Confirm signup*: subject `Your DayPrism verification code`, body = `../supabase/email-templates/confirm-signup.html`
- *Reset password*: subject `Your DayPrism password reset code`, body = `../supabase/email-templates/reset-password.html`

The app uses the 6-digit `{{ .Token }}` from these emails, so users never need to open a link on
the same phone.

**Authentication → Emails → SMTP settings** (required before real users)
Supabase's built-in email is for testing only: it sends just a few emails per hour. Connect a real
provider (e.g. Resend, Postmark, Amazon SES or Brevo) with a sender like `no-reply@yourdomain.com`.

**Authentication → Rate limits**: keep the defaults (they slow down password-guessing).

## 4. Make yourself admin (1 min)

1. Install the app and register with your own email.
2. Edit `../supabase/make-admin.sql` with that email and run it in the SQL editor.
3. Sign out and back in. Settings now shows **Admin console**.

## 5. Google sign-in (10 min, optional)

1. <https://console.cloud.google.com> → create a project → **APIs & Services → OAuth consent screen**:
   app name *DayPrism*, support email, logo, links to your privacy policy and terms; scopes `email`, `profile`, `openid`.
2. **Credentials → Create credentials → OAuth client ID**:
   - **Web application**: copy its client ID → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env`, and
     paste ID + secret into Supabase **Authentication → Providers → Google**.
   - **Android**: package `app.dayprism` and the **SHA-1** of the signing certificate.
     Create one for each certificate that signs the app: your local/debug key
     (`cd android && ./gradlew signingReport`) and the Play App Signing key (Play Console →
     Test and release → App integrity).
3. In Supabase's Google provider, add the Android client ID to **Authorized Client IDs**, and turn
   on **Skip nonce check** (the native Google sign-in library doesn't send a nonce).

Rebuild the app after changing `.env`: values are compiled in.

**EAS cloud builds** don't upload `.env` (it's git-ignored). Add the same three values in the Expo
dashboard (Project → Environment variables, visibility "Plain text"), or run
`npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value ... --environment production`
for each one.

## 6. Before going live

- Supabase **Pro plan**: daily backups and no project pausing (free projects pause after a week of inactivity).
- Custom SMTP with your own domain (step 3).
- Replace `SUPPORT_EMAIL` in `src/features/legal.ts`, run `python scripts/legal-md.py`, and host
  `PRIVACY.md` and `TERMS.md` (GitHub Pages works) for the Play Store listing.
- Update the Play Console **Data safety** form (see `store/PLAY_STORE.md`).
