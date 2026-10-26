# The Persona Index: iPhone, Android and Mac app

One React Native + Expo app for iPhone and Android. On a Mac with Apple Silicon it runs the iPhone build; browsers keep using the web app in `frontend/`.

It reuses the web app's TypeScript directly: anything imported as `@shared/<file>` comes from `frontend/src/<file>` (see `metro.config.js`), and it talks to the same Go API.

## Run it

```bash
cd backend && go run .          # API on :8080 (or set EXPO_PUBLIC_API_URL)
cd mobile && npm install
npx expo start                  # i = iPhone simulator, a = Android emulator
npx expo run:ios                # a full native build in Xcode
```

Checks: `npx tsc --noEmit -p .` and `npx expo export --platform ios`.

The SwiftUI app in `apple/` stays until this app matches it.
