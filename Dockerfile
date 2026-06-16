FROM python:3.12-slim

# Faster, cleaner container Python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps: psycopg2 (sync, used by tests/tooling) needs libpq + a compiler.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Run as an unprivileged user.
RUN addgroup --system app && adduser --system --ingroup app app
USER app

EXPOSE 8000

# Serve via gunicorn using the project config (uvicorn workers).
CMD ["gunicorn", "app.main:app", "-c", "gunicorn_config.py"]
