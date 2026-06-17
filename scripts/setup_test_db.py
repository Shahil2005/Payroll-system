"""Create and migrate the dedicated test database (`payroll_scratch`).

The test suite TRUNCATEs tables, so it must NEVER run against the dev database
(`payroll_test`). This script provisions a separate scratch DB and brings it to
the latest Alembic revision. Safe to re-run (idempotent).

Run:
    python scripts/setup_test_db.py

Then run the suite against it (the test default DSN already points here):
    PAYROLL_ALLOW_DB_WIPE=1 python -m pytest tests/
"""
import os
import subprocess
import sys

import psycopg2

HOST = os.getenv("PGHOST", "localhost")
PORT = os.getenv("PGPORT", "5432")
USER = os.getenv("PGUSER", "postgres")
PASSWORD = os.getenv("PGPASSWORD", "mysql")
SCRATCH_DB = os.getenv("PAYROLL_SCRATCH_DB", "payroll_scratch")
DEV_DB = "payroll_test"

if SCRATCH_DB == DEV_DB:
    sys.exit(f"Refusing to use the dev database '{DEV_DB}' as the test DB.")


def _create_database() -> None:
    conn = psycopg2.connect(
        host=HOST, port=PORT, dbname="postgres", user=USER, password=PASSWORD
    )
    conn.autocommit = True
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s;", (SCRATCH_DB,))
        if cur.fetchone():
            print(f"Database '{SCRATCH_DB}' already exists.")
        else:
            cur.execute(f'CREATE DATABASE "{SCRATCH_DB}";')
            print(f"Created database '{SCRATCH_DB}'.")
        cur.close()
    finally:
        conn.close()


def _migrate() -> None:
    """Bring the scratch DB to head. Override DB_NAME so Alembic targets it."""
    env = {**os.environ, "DB_NAME": SCRATCH_DB, "DB_HOST": HOST, "DB_PORT": PORT,
           "DB_USER": USER, "DB_PASSWORD": PASSWORD}
    print(f"Migrating '{SCRATCH_DB}' to head…")
    subprocess.run(["alembic", "upgrade", "head"], env=env, check=True)


if __name__ == "__main__":
    _create_database()
    _migrate()
    print(f"\nDone. Test DB '{SCRATCH_DB}' is ready and isolated from '{DEV_DB}'.")
