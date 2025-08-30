# Citadel Guard (Firebase + Next.js)

Secure password/API key manager prototype using Next.js 15, Firebase, and client‑side AES‑GCM encryption.

## 1. Quick Start

* Install dependencies

```bash
npm install
```

* Copy environment template

```powershell
copy .env.example .env.local
```

* Fill in Firebase values in `.env.local` (see below)
* Run dev server

```bash
npm run dev
```

* Open <http://localhost:9002> (your browser)

If Firebase vars are missing in development the app will still boot with Firebase disabled (you'll see a warning). In production they are required and validation will fail if absent or malformed.

## 2. Required Environment Variables

Edit `.env.local` (never commit real secrets):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...            # From Firebase console
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
NEXT_PUBLIC_APP_ENV=development
```

Optional (security tuning – defaults applied if omitted):

```bash
NEXT_PUBLIC_ENCRYPTION_ITERATIONS=300000
NEXT_PUBLIC_MAX_LOGIN_ATTEMPTS=5
NEXT_PUBLIC_LOCKOUT_DURATION=900000
NEXT_PUBLIC_SESSION_TIMEOUT=3600000
NEXT_PUBLIC_IDLE_TIMEOUT=1800000
NEXT_PUBLIC_SECURITY_LEVEL=high
NEXT_PUBLIC_ENABLE_SECURITY_HEADERS=true
```

See `.env.example` for annotated guidance.

## 3. Project Layout

Key folders:

* `src/lib/crypto-advanced.ts` – PBKDF2 + AES-GCM implementation
* `src/lib/secure-storage.ts` / `SecureStorageService` – local encrypted vault
* `src/lib/config.ts` – robust config manager with dev fallbacks
* `src/lib/firebase-secure.ts` – Firebase initialization & auth helpers
* `src/services/*` – higher level domain services

## 4. Dev Fallback Behavior

In development any missing `NEXT_PUBLIC_` Firebase vars become empty strings. You can still work on UI without Firebase. Warnings list what you must add later. Production will throw to prevent deploying a misconfigured build.

## 5. Commands

```bash
npm run dev       # Start (port 9002)
npm run build     # Production build
npm run start     # Start production server
npm run typecheck # TypeScript check only
```

## 6. Troubleshooting

Issue: Missing environment variable errors during dev
Fix: Ensure `.env.local` exists; restart dev server after edits.

Issue: Firebase initialization error
Fix: Verify API key starts with AIza and auth domain ends with .firebaseapp.com.

Issue: Encryption feels slow
Fix: Lower `NEXT_PUBLIC_ENCRYPTION_ITERATIONS` (development only). Keep >=300000 in production.

Issue: Path alias '@/...' not resolving
Fix: `tsconfig.json` now includes `baseUrl: "./"`. Restart TypeScript server if editor still complains.

## 7. Next Steps (Suggested)

* Implement real Firebase auth flows inside `AuthContext` (replace placeholders)
* Add UI for unlocking/locking vault and setting master password
* Add automated tests for crypto + storage services
* Integrate proper error boundary around config initialization

---
Generated helper changes: added dev-safe config fallback, path alias baseUrl, firebase module shim, secure storage fixes, and a placeholder login page.
