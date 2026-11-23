from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "your-ai"
    mistral_api_key: str | None = None
    mistral_base_url: str = "https://api.mistral.ai/v1"
    mistral_model: str = "mistral-small-latest"
    system_prompt: str = "You are your-ai, a helpful assistant. Answer in the language the user writes in."
    temperature: float = 0.7
    request_timeout: float = 120.0

    @property
    def api_key(self) -> str | None:
        return self.mistral_api_key or None

    @property
    def base_url(self) -> str:
        return self.mistral_base_url

    @property
    def model(self) -> str:
        return self.mistral_model


@lru_cache
def get_settings() -> Settings:
    return Settings()
