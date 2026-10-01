# DayPrism for Android

The DayPrism tracker as a native Android app, built with Expo (React Native, TypeScript): Today,
History, Insights, Review and Settings, with accounts, offline-first sync and an admin console.
It's the mobile rewrite of the ASP.NET web app in `../src/DayLog.Web`.

Backend setup (Supabase, email templates, Google sign-in, making yourself admin): **[SETUP.md](SETUP.md)**.
Play Store release checklist: **[store/PLAY_STORE.md](store/PLAY_STORE.md)**.

## Architecture

```
 phone                                              Supabase
 ┌─────────────────────────────┐   HTTPS (TLS)   ┌──────────────────────────────┐
 │ UI ─► SQLCipher DB (AES-256)│ ◄─────────────► │ Auth (email/password, Google)│
 │       per account, key in   │  push dirty rows│ Postgres + row-level security│
 │       Android Keystore      │  pull changes   │ admin_* RPCs (metadata only) │
 └─────────────────────────────┘                 └──────────────────────────────┘
```

- **Offline-first**: every screen reads and writes the local database, so the app is instant and
  works without a connection. `src/sync/engine.ts` pushes rows marked `dirty` and pulls rows
  changed on the server since a per-table cursor; last write to reach the server wins.
- **Accounts**: Supabase Auth. Email + password with 6-digit email verification and password
  reset codes, plus native Google sign-in. Sessions are stored in the Android Keystore.
- **Isolation**: each table has row-level security (`user_id = auth.uid()`), so one user can never
  read another's rows, whatever the app does. Disabled accounts lose access through the same policies.
- **Admin**: `profiles.role = 'admin'` (set with `../supabase/make-admin.sql`). Admins get user counts,
  sign-ups, a user list (email, name, dates) and can disable accounts, all through `security definer`
  functions that return metadata only. No policy lets an admin read entries. Demo data is an
  admin-only tool and only ever goes into the admin's own account.
- **Account deletion**: Settings → Delete account runs `delete_my_account()`, which cascades to
  all of the user's rows (a Google Play requirement).
- **On the phone**: one SQLCipher database per account (signing out erases it), optional app lock
  (biometric or PIN, with `FLAG_SECURE`), no Android cloud backup of the local database.

## Project layout

```
src/app/            screens (Expo Router): (auth)/welcome, sign-in, sign-up, verify, forgot;
                    (tabs)/index, history, insights, review, settings; day/[date]; admin; privacy; terms
src/auth/           Supabase client (Keystore session storage), session provider, Google sign-in
src/sync/           offline-first sync engine
src/features/       entry sheets (add/edit forms), day views, app lock, auth UI, legal texts
src/services/       business logic ported from the C# services: entries, day, calendar, insights, review, export, demo data
src/db/             encrypted database, schema migrations (PRAGMA user_version), queries
src/lib/            domain types and display names, local-time helpers
src/ui/             theme tokens, component kit, charts (react-native-svg), bottom sheet
../supabase/        server migrations, email templates, make-admin.sql (shared by every version)
store/              Play Store graphics and the release checklist (PLAY_STORE.md)
```

Times are stored the same way as in the web app: local wall-clock text (`2026-10-01T13:05:00`) plus
the UTC offset, following the phone's time zone.

## Develop

Requirements: Node 20+, JDK 17 and the Android SDK (`JAVA_HOME` and `ANDROID_HOME` set). On this
machine they are in `%USERPROFILE%\.jdks\jdk-17` and `%LOCALAPPDATA%\Android\Sdk`.

```bash
npm install
npm run typecheck
npm run lint
```

Copy `.env.example` to `.env` and fill in your Supabase URL and key (see SETUP.md). SQLCipher and
the other native modules don't run in Expo Go, so use a development build on an emulator or a
USB-connected phone:

```bash
npx expo run:android
```

## Release build

Test APK, signed with the debug key:

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

The APK is in `android/app/build/outputs/apk/release/`.

### This folder is DayPrism v1

It builds **DayPrism** (`app.dayprism`), the version for the Play Store. Only launch fixes go in
here. New features are built in `../dayprism-beta` and copied in once they're finished.

For the Play Store, build a signed `.aab` with EAS (`npx eas-cli@latest build -p android --profile production`).
`store/PLAY_STORE.md` walks through the listing, Data safety form, content rating and testing track.

`android/` is generated (Continuous Native Generation) and git-ignored. Change native settings in
`app.json` / `app.config.js`, never by editing `android/` by hand.
