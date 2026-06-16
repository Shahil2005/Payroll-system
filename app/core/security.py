"""Password hashing and JWT helpers (spec §7).

Password hashing uses the stdlib PBKDF2-HMAC-SHA256 (no native build deps —
portable on Windows). Hashes are stored as ``pbkdf2_sha256$iterations$salt$hash``.
JWTs are signed with the app secret (HS256).
"""
import base64
import hashlib
import hmac
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from app.core.settings import Settings

_settings = Settings()

_PBKDF2_ITERATIONS = 240_000
_ALGO_TAG = "pbkdf2_sha256"


# ----- Password hashing -----------------------------------------------------
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return "{}${}${}${}".format(
        _ALGO_TAG,
        _PBKDF2_ITERATIONS,
        base64.b64encode(salt).decode(),
        base64.b64encode(dk).decode(),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_b64, hash_b64 = stored.split("$")
        if algo != _ALGO_TAG:
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(iterations))
        return hmac.compare_digest(dk, expected)
    except (ValueError, TypeError):
        return False


# ----- JWT ------------------------------------------------------------------
def create_access_token(*, user_id: uuid.UUID, company_id: uuid.UUID, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "company_id": str(company_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=_settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, _settings.secret_key, algorithm=_settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT. Raises jwt.PyJWTError on any problem."""
    return jwt.decode(token, _settings.secret_key, algorithms=[_settings.jwt_algorithm])
