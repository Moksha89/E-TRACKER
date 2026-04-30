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

    telegram_gateway_token: str | None = None
    telegram_gateway_base: str = "https://gatewayapi.telegram.org"
    telegram_bot_token: str | None = None

    cors_origins: str = "*"

    attachments_dir: str = Field(default="./var/attachments")
    max_attachment_mb: int = 20

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
