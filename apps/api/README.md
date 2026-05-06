# etracker-api

FastAPI backend for SVE Expenses.

## Requirements

- Python 3.11+
- [uv](https://github.com/astral-sh/uv) for dependency management

## Setup

```bash
cd apps/api
uv sync
cp .env.example .env  # edit JWT_SECRET, DATABASE_URL
uv run uvicorn app.main:app --reload --port 8000
```

API docs at <http://localhost:8000/docs>.

## Auth — phone + 6-digit PIN

- `POST /v1/auth/signup` — `{phone, pin, name?, email?}` → JWT. PIN must be exactly 6 digits.
- `POST /v1/auth/login` — `{phone, pin}` → JWT.
- `POST /v1/me/pin` — `{current_pin, new_pin}` (authenticated).
- `GET /v1/me` — current user (requires `Authorization: Bearer <token>`).

Invited members claim their account by signing up with the same phone they
were invited with — the pre-created (unverified) row is upgraded to use
their chosen PIN.

## Tests / lint

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest
```
