from __future__ import annotations
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    BOT_TOKEN: str = Field(..., min_length=10)
    ADMIN_ID: int = Field(...)

    EXENTA_API_KEY: str = Field(..., min_length=5)
    EXENTA_API_SECRET: str = Field(..., min_length=5)
    EXENTA_BASE_URL: str = Field(default="https://exenta.pro/api/v1")

    USE_WEBHOOK: bool = Field(default=False)
    EXENTA_WEBHOOK_SECRET: str | None = Field(default=None)
    WEBHOOK_PORT: int = Field(default=8080, ge=1, le=65535)

    DB_PATH: str = Field(default="database.db")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_webhook_secret(self) -> "Settings":
        if self.USE_WEBHOOK and (
            not self.EXENTA_WEBHOOK_SECRET or not self.EXENTA_WEBHOOK_SECRET.strip()
        ):
            raise ValueError(
                "EXENTA_WEBHOOK_SECRET must be set when USE_WEBHOOK=true"
            )
        self.EXENTA_BASE_URL = self.EXENTA_BASE_URL.rstrip("/")
        return self


settings = Settings()
