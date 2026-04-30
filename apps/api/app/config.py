from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "cashbook-api"
    environment: str = Field(default="development")
    database_url: str = Field(default="sqlite:///./cashbook.db")

    jwt_secret: str = Field(default="dev-insecure-secret-change-me")
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60 * 24 * 7  # 7 days
    refresh_token_ttl_days: int = 60

    otp_ttl_seconds: int = 300
    otp_resend_cooldown_seconds: int = 30
    otp_max_attempts: int = 5
    otp_max_requests_per_hour: int = 5
    # If set, every requested OTP uses this fixed code and Telegram delivery is
    # skipped. Intended for dev / staging only — DO NOT set in production once
    # the app is publicly distributed.
    otp_dev_fixed_code: str | None = None

    telegram_gateway_token: str | None = None
    telegram_gateway_base: str = "https://gatewayapi.telegram.org"
    telegram_bot_token: str | None = None

    cors_origins: str = "*"

    attachments_dir: str = Field(default="./var/attachments")
    max_attachment_mb: int = 20

    # Phase E — production scale
    redis_url: str | None = None
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.0
    log_format: str = Field(default="text")  # "text" or "json"
    rate_limit_default: str = "120/minute"
    rate_limit_auth: str = "20/minute"
    rate_limit_writes: str = "60/minute"
    rate_limit_enabled: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
