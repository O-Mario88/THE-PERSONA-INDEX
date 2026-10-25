# The Persona Index for iPhone, iPad and Mac

One SwiftUI app for iOS 18+ and macOS 15+, talking to the same Go API as the
web app, in the same lime and navy design (`frontend/DESIGN.md`).

```
apple/
  project.yml          XcodeGen spec; `xcodegen` writes PersonaIndex.xcodeproj
  PersonaKit/          Swift package: models, the API client, storage, the day's windows (+ tests)
  PersonaIndex/        the app: App/ (state), Design/ (tokens, parts), Screens/, Resources/Fonts
```

## Run it

```bash
cd backend && go run .                 # the API on :8080
cd apple && xcodegen && open PersonaIndex.xcodeproj
```

Pick the PersonaIndex scheme and an iPhone simulator or "My Mac", then Run.
A debug build can start at another moment, to see a weekday sitting on a
Sunday: add `-PINow 2026-10-24T08:10:00` under Scheme > Run > Arguments.

## Test it

```bash
cd apple/PersonaKit && swift test
```

## What is here so far

Phase 1: the welcome, the five tabs, Today (the day's ring, the open window,
"Today's ritual") and the morning and evening sittings: one tap answers,
the card shows the insight, the other side and a step, and the vote goes to
the server with an idempotency key (kept until accepted, so it is counted
once). The device pass lives in the Keychain. Intimate questions wait for
the 18+ setting, which comes with Settings. Reflect, Connect, Insights and
You say plainly that they arrive in later builds.

## Fonts

Figtree (SIL Open Font License, `PersonaIndex/Resources/Fonts/OFL.txt`),
the static weights made from the variable font the web app already ships.
