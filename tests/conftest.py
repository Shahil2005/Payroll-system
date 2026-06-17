"""Pytest bootstrap — runs before any test module (and therefore before
``app.main`` and its SQLAlchemy engine) is imported.

Its one critical job: force BOTH the app-under-test AND the psycopg2 fixtures
onto a DEDICATED scratch database, so a test run can NEVER touch the dev DB
(`payroll_test`). The fixtures TRUNCATE tables; if the app pointed at the dev DB
during tests, real data would be destroyed. Provision the scratch DB with
``python scripts/setup_test_db.py``.
"""
import os
import re

from dotenv import load_dotenv

# Load non-DB settings from the env file without clobbering real env vars.
_env_file = ".env.test" if os.getenv("ENV_MODE") == "test" else ".env"
load_dotenv(_env_file, override=False)

# The single source of truth for the test database. Keep in sync with
# tests/test_payroll.py::_DSN (both default to the scratch DB).
_TEST_DSN = os.getenv(
    "PAYROLL_TEST_DSN",
    "host=localhost port=5432 dbname=payroll_scratch user=postgres password=mysql",
)


def _dsn_field(name: str, default: str = "") -> str:
    match = re.search(rf"\b{name}=(\S+)", _TEST_DSN)
    return match.group(1) if match else default


_db_name = _dsn_field("dbname", "payroll_scratch")

# Hard stop: refuse to bind the app to the dev database during tests.
if _db_name == "payroll_test":
    raise RuntimeError(
        "Refusing to run tests against the dev database 'payroll_test'. "
        "Point PAYROLL_TEST_DSN at the scratch DB ('payroll_scratch')."
    )

# Set DB_* BEFORE app import so DBSettings (and the engine) bind to the scratch
# DB. Explicit assignment wins over the .env file values loaded above.
os.environ["DB_NAME"] = _db_name
os.environ["DB_HOST"] = _dsn_field("host", "localhost")
os.environ["DB_PORT"] = _dsn_field("port", "5432")
os.environ["DB_USER"] = _dsn_field("user", "postgres")
os.environ["DB_PASSWORD"] = _dsn_field("password", "mysql")
