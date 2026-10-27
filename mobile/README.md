# The Persona Index app: iPhone, Android, Mac and web

One React Native + Expo app for every platform: iPhone and Android, the Mac (the iPhone/iPad build runs on Apple Silicon), and the website, built with React Native for Web (`npm run build:web`, see `scripts/build-web.mjs`). From 900px wide it shows the midnight sidebar instead of the tab bar.

It is built on the shared TypeScript: anything imported as `@shared/<file>` comes from `frontend/src/<file>` (see `metro.config.js`), and it talks to the same Go API.

## Run it

```bash
cd backend && go run .          # API on :8080 (or set EXPO_PUBLIC_API_URL)
cd mobile && npm install
npx expo start                  # i = iPhone simulator, a = Android emulator
npx expo run:ios                # a full native build in Xcode
```

Checks: `npx tsc --noEmit -p .` and `npm run build:web`.

## Sign in with Apple and Google

The buttons show only when the server accepts the app's tokens and the build knows its own IDs. On the website, "Continue with Google" uses the server's web client (`GOOGLE_CLIENT_ID`, see `docs/operations.md`): the page goes to Google and comes back to the site's front page with an ID token (`src/platform/googleWeb.ts`). Apple is iPhone only.

- **Server** (see `docs/operations.md`): `APPLE_APP_IDS=com.personaindex.app` and `GOOGLE_APP_CLIENT_IDS=<iOS client ID>,<Android client ID>`.
- **Apple:** turn on "Sign in with Apple" for the `com.personaindex.app` App ID in the Apple Developer account. The app's entitlement comes from `ios.usesAppleSignIn` in `app.json`. iPhone only.
- **Google:** in Google Cloud, make an iOS OAuth client (bundle ID `com.personaindex.app`) and an Android one (package `com.personaindex.app` plus the signing SHA-1). Build with `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` set. Sign-in returns to the app on `com.personaindex.app:/oauthredirect`. Newer Android clients may need "custom URI scheme" turned on under the client's advanced settings.

## Reminders

Local notifications planned on the phone (`src/platform/reminders.ts`, plan in `frontend/src/reminders.ts`): morning three, evening three, Sunday Mirror, and Reflect check-ins. Turned on in Settings under More settings. No server, push key or account is needed. Nothing is sent.

## Download my book

In Notebook and in What I keep. The book is made on the phone (`frontend/src/book.ts`), turned into a PDF with `expo-print` and handed to the share sheet. The data file goes the same way as JSON.
