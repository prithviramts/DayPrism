// Text of the privacy policy and terms, shown in the app (src/app/privacy.tsx, terms.tsx) and
// mirrored in dayprism-beta/PRIVACY.md and dayprism-beta/TERMS.md for hosting. Keep all four in sync, and
// have a lawyer review them before publishing; they describe what the app does, but they are not
// legal advice.

export const LEGAL_UPDATED = '1 October 2026';
export const SUPPORT_EMAIL = 'support@dayprism.app'; // TODO: replace with your real support address before publishing

export const PRIVACY: [string, string][] = [
  ['Summary', 'DayPrism helps you track your days. Your entries belong to you: only you can read them, we never sell them, and there are no ads or third-party tracking in the app.'],
  ['What we store', 'Your account: email address, name, and a securely hashed password (or your Google account email and name if you sign in with Google). Your entries: sleep, meals, caffeine, water, energy and mood check-ins, activities, reflections and your settings. If you switch on cycle tracking, also your period and symptom logs. Some of this is health and wellness information, and we treat all of it as sensitive.'],
  ['Where it is stored', 'Your entries are kept in an encrypted database on your phone (AES-256), and backed up to your account on our servers, hosted by Supabase. Data is encrypted in transit (TLS) and at rest.'],
  ['Who can see it', 'Only you. Access to entries is enforced by the database itself (row-level security). DayPrism administrators can see basic account details (email, name, sign-up date, last active date) to provide support and prevent abuse, but they cannot read your entries.'],
  ['Service providers', 'Supabase (database and sign-in), Google (only if you choose "Continue with Google"), and our email provider (verification and password-reset emails). They process data only to provide these services.'],
  ['Health Connect', 'If you connect Health Connect, DayPrism reads only the data types you allow: steps, exercise sessions and sleep sessions. It uses them only to show your own days and insights, stores them like your other entries, never writes to Health Connect, and never shares or sells this data or uses it for advertising. DayPrism\'s use of information received from Health Connect adheres to the Health Connect Permissions policy, including the Limited Use requirements. You can stop importing in Settings and revoke access in Health Connect at any time.'],
  ['What we don\'t do', 'We don\'t sell or rent your data, show ads, use advertising identifiers, or include analytics or tracking SDKs.'],
  ['Exports', 'When you export, DayPrism creates a file and opens your phone\'s share sheet; you choose where it goes. Exported files are not encrypted.'],
  ['Keeping and deleting your data', 'We keep your data while your account exists. Settings → Delete account permanently deletes your account and all of your entries from our database straight away. Encrypted backups kept by our hosting provider are overwritten within 30 days. Signing out removes the copy on your phone.'],
  ['Your rights', 'You can access and export your data (Settings → Export all data), correct it in the app, and delete it (Settings → Delete account). For any other request, contact us.'],
  ['Security', 'Passwords are never stored in plain text. Optional app lock protects the app with your fingerprint, face or phone PIN. No system is perfectly secure, but we follow industry practice and will notify you if a breach affects your data.'],
  ['Not medical advice', 'DayPrism is a personal wellness journal. It is not a medical device and doesn\'t diagnose or treat any condition.'],
  ['Children', 'DayPrism is not directed at children under 16, and we don\'t knowingly collect their data.'],
  ['Changes', 'If this policy changes, we\'ll update the date below and tell you in the app before the change takes effect.'],
  ['Contact', `Questions or requests: ${SUPPORT_EMAIL}`],
];

export const TERMS: [string, string][] = [
  ['Agreement', 'By creating an account or using DayPrism you agree to these terms and to our Privacy Policy. If you don\'t agree, please don\'t use the app.'],
  ['Your account', 'You need to be at least 16. Keep your password safe and tell us if you think someone else has access to your account. You are responsible for activity under your account.'],
  ['Your content', 'Everything you log belongs to you. You give us permission to store, process and back it up only so we can run the service for you. You can export or delete it at any time.'],
  ['Acceptable use', 'Don\'t misuse the service: no attempts to access other people\'s data, disrupt or overload our systems, reverse-engineer security measures, or use DayPrism for anything unlawful. We may suspend accounts that do.'],
  ['Wellness, not medical advice', 'DayPrism shows patterns in your own data. Insights are correlations, not diagnoses, and are not a substitute for advice from a qualified professional. Seek medical help for any health concern.'],
  ['Availability', 'We work hard to keep DayPrism running and your data safe, but the service is provided "as is" and may occasionally be unavailable. Entries you make offline are saved on your phone and sync when you\'re back online.'],
  ['Ending your account', 'You can delete your account at any time in Settings. We may close accounts that break these terms, and will give notice where reasonable.'],
  ['Liability', 'To the extent the law allows, DayPrism is not liable for indirect or consequential losses, or for decisions you make based on the app. Nothing in these terms limits rights you have under consumer law.'],
  ['Changes', 'We may update these terms. We\'ll tell you in the app before significant changes take effect; continuing to use DayPrism means you accept them.'],
  ['Contact', `Questions: ${SUPPORT_EMAIL}`],
];
