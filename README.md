# SVE Expenses

A cash-book / ledger app — multi-business, multi-book cash in/out tracking with members, reports, attachments, and offline-first sync.

## Architecture

- **`apps/mobile`** — Expo + React Native + TypeScript. Redux Toolkit, React Navigation 6, React Native Paper. Mirrors the screens/UX of the original.
- **`apps/api`** — FastAPI + SQLAlchemy 2 + SQLite (Postgres-ready). JWT auth.

## Auth model

- Phone number + 6-digit numeric PIN. PIN is bcrypt-hashed.
- No OTP, no Telegram, no email, no 2FA.
- Invited members claim their account by signing up with the same phone.

## Roadmap

- **Phase 1** — auth, books, entries (Cash In / Cash Out), categories, payment modes, filters, balances.
- **Phase 2** — members + role permissions, reports + Excel / PDF / CSV export.
- **Phase 3** — backup / sync, attachments, contacts / WhatsApp share, biometric lock, notifications, i18n.

## Local dev

```bash
# Backend
cd apps/api
uv sync
uv run uvicorn app.main:app --reload --port 8000

# Mobile
cd apps/mobile
npm install
npx expo start
```

See `apps/api/README.md` and `apps/mobile/README.md` for details.
