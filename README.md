# Cashbook Clone

A clone of the CashBook ledger app (cashbook.in) — multi-business, multi-book cash in/out tracking with members, reports, attachments, and offline-first sync.

## Architecture

- **`apps/mobile`** — Expo + React Native + TypeScript. Redux Toolkit, React Navigation 6, React Native Paper. Mirrors the screens/UX of the original.
- **`apps/api`** — FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL. JWT auth, Telegram Gateway OTP for signup / forgot-password / sensitive actions. Deployed to Fly.io.

## Auth model

- Phone number + password (bcrypt) is the primary credential.
- Telegram-based OTP verifies the phone at signup and gates password reset / sensitive actions.
- No Google / Apple sign-in. No UPI / wallet / fintech surface.

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
