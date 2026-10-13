"""Settings from the environment (infra/.env). Secrets never have defaults."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = Field(alias="AGENT_DATABASE_URL")
    redis_url: str = Field(default="redis://redis:6379/0", alias="REDIS_URL")
    api_url: str = Field(default="http://api:3000/api", alias="API_URL")
    agent_api_token: SecretStr = Field(alias="AGENT_API_TOKEN")

    openai_api_key: SecretStr | None = Field(default=None, alias="OPENAI_API_KEY")
    # Defaults from developers.openai.com/api/docs/models (checked 2026-10-13).
    openai_model: str = Field(default="gpt-6.1-sol", alias="OPENAI_MODEL")
    openai_model_fast: str = Field(default="gpt-6-luna", alias="OPENAI_MODEL_FAST")
    openai_embedding_model: str = Field(
        default="text-embedding-3-small", alias="OPENAI_EMBEDDING_MODEL"
    )

    auth_mode: Literal["access", "none"] = Field(alias="AUTH_MODE")
    cf_access_team_domain: str = Field(default="", alias="CF_ACCESS_TEAM_DOMAIN")
    cf_access_aud: str = Field(default="", alias="CF_ACCESS_AUD")
    allowed_emails: str = Field(default="", alias="ALLOWED_EMAILS")

    rates_watch_cron: str = Field(default="0 6 * * 1", alias="RATES_WATCH_CRON")
    timezone: str = Field(default="Europe/Paris", alias="TZ")

    @property
    def ai_enabled(self) -> bool:
        return self.openai_api_key is not None and self.openai_api_key.get_secret_value() != ""


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
