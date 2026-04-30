# cashbook-mobile

Expo + React Native + TypeScript app for the Cashbook clone.

## Setup

```bash
cd apps/mobile
npm install
npx expo start
```

Press `a` to open Android, `i` for iOS, or scan the QR with Expo Go.

The API base URL is read from `app.json` `expo.extra.apiBaseUrl` and defaults
to `http://localhost:8000`. Override per-environment by setting
`EXPO_PUBLIC_API_BASE_URL`.

## Layout

- `src/api/` — axios client + typed wrappers
- `src/state/` — Redux Toolkit slices (auth, session)
- `src/components/` — small reusable widgets
- `app/` — Expo Router routes (auth flow + main tabs)

## Lint / typecheck

```bash
npm run lint
npm run typecheck
```
