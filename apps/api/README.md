# etracker-api

FastAPI backend for E-Tracker.

## Requirements

- Python 3.11+
- [uv](https://github.com/astral-sh/uv) for dependency management

## Setup

```bash
cd apps/api
uv sync
cp .env.example .env  # edit JWT_SECRET, DATABASE_URL, telegram tokens
uv run uvicorn app.main:app --reload --port 8000
```

API docs at <http://localhost:8000/docs>.

## Auth

- `POST /v1/auth/otp/request` — request a Telegram OTP for `signup` / `login` / `reset_password`.
- `POST /v1/auth/signup` — create an account with phone + password + OTP.
- `POST /v1/auth/login` — phone + password → JWT access token.
- `POST /v1/auth/password/reset` — phone + OTP + new password.
- `GET /v1/me` — current user (requires `Authorization: Bearer <token>`).

In dev (no Telegram tokens configured), the OTP code is returned in the
`debug_code` field of the OTP request response and also logged to stderr.

## Tests / lint

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest
```
