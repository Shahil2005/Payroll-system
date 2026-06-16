from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import setup_logger
from app.core.manager import lifespan
from app.core.settings import Settings
from app.router.auth import router as auth_router
from app.router.base import router as base_router
from app.router.employee import router as employee_router
from app.router.payroll import router as payroll_router

_settings = Settings()

app = FastAPI(lifespan=lifespan, debug=_settings.debug, docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

setup_logger(_settings.debug)


@app.middleware("http")
async def security_headers(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Attach conservative security headers to every response.

    Kept to non-breaking headers (no CSP/HSTS by default) so the JSON API and
    the frontend are unaffected; tighten per-environment as needed.
    """
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response


app.include_router(base_router)
app.include_router(auth_router)
app.include_router(payroll_router)
app.include_router(employee_router)
