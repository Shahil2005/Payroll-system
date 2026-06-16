from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    debug: bool = False
    app_env: str = "development"

    # ----- Auth / JWT -----
    # Override in production via env (SECRET_KEY). The default is dev-only.
    secret_key: str = "dev-insecure-change-me-please-0123456789abcdef"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 8  # 8h working session

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()
