from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Sentinel for the dev-only signing key. Production must override SECRET_KEY.
_DEV_SECRET_KEY = "dev-insecure-change-me-please-0123456789abcdef"


class Settings(BaseSettings):
    debug: bool = False
    app_env: str = "development"

    # ----- Auth / JWT -----
    # Override in production via env (SECRET_KEY). The default is dev-only.
    secret_key: str = _DEV_SECRET_KEY
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 8  # 8h working session

    # ----- CORS -----
    # Comma-separated list of allowed browser origins. Defaults to local dev.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # ----- Email (SMTP — Google/Gmail) -----
    # Set SMTP_USERNAME + SMTP_PASSWORD (a Google App Password) and
    # SMTP_FROM_EMAIL in the env to enable payslip email.
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587  # 587 = STARTTLS (default), 465 = SSL (set smtp_use_ssl)
    smtp_use_ssl: bool = False
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Croar Payroll"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        """Parsed, de-blanked list of allowed CORS origins."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @model_validator(mode="after")
    def _guard_production_secret(self) -> "Settings":
        """Refuse to boot in production with the insecure default signing key.

        In development/test the dev key is allowed so the app runs out of the
        box; in production a real SECRET_KEY must be supplied via the env.
        """
        if self.app_env.lower() == "production" and self.secret_key == _DEV_SECRET_KEY:
            raise ValueError(
                "SECRET_KEY must be set to a secure value when APP_ENV=production "
                "(the built-in development key is not allowed in production)."
            )
        return self


settings = Settings()
