import uuid
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import setup_logger
from app.core.manager import lifespan
from app.core.security import decode_access_token
from app.core.settings import Settings
from app.router.audit import router as audit_router
from app.router.auth import router as auth_router
from app.router.base import router as base_router
from app.router.employee import router as employee_router
from app.router.payroll import router as payroll_router
from app.router.reports import router as reports_router
from app.router.settings import router as settings_router
from app.router.taxes import router as taxes_router
from app.services import audit_service

_settings = Settings()

app = FastAPI(lifespan=lifespan, debug=_settings.debug, docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Browsers hide non-safelisted response headers from JS unless exposed.
    # The frontend reads Content-Disposition to name downloaded files (reports,
    # payslip PDFs); without this it can't, and falls back to a wrong filename.
    expose_headers=["Content-Disposition"],
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


_AUDIT_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Paths excluded from the activity trail:
#  - login/logout: high-volume and the actor is only known post-auth.
#  - structures/preview: a read-only live calculation (POST only because it
#    takes a body) fired on every keystroke in the salary-structure form — it
#    is not a real mutation and would flood the trail.
_AUDIT_SKIP_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/logout",
    "/api/v1/enterprise/payroll/structures/preview",
}


@app.middleware("http")
async def audit_requests(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Record an audit row for every authenticated mutating API request — the
    'who did what, when' activity trail. Best-effort: never breaks the response.
    """
    response = await call_next(request)
    try:
        method = request.method
        path = request.url.path
        if (
            method in _AUDIT_METHODS
            and path.startswith("/api/v1")
            and path not in _AUDIT_SKIP_PATHS
        ):
            actor_id: uuid.UUID | None = None
            company_id: uuid.UUID | None = None
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                try:
                    payload = decode_access_token(auth[7:])
                    actor_id = uuid.UUID(payload["sub"])
                    cid = payload.get("company_id")
                    company_id = uuid.UUID(cid) if cid else None
                except Exception:
                    actor_id = None
            # Log successful actions, plus authorized-but-failed ones (actor
            # known). Anonymous failures (e.g. 401 with no token) are dropped.
            if response.status_code < 400 or actor_id is not None:
                await audit_service.record(
                    company_id=company_id,
                    actor_id=actor_id,
                    method=method,
                    path=path,
                    status_code=response.status_code,
                )
    except Exception:  # pragma: no cover - audit must never break a request
        pass
    return response


app.include_router(base_router)
app.include_router(auth_router)
app.include_router(payroll_router)
app.include_router(employee_router)
app.include_router(reports_router)
app.include_router(settings_router)
app.include_router(taxes_router)
app.include_router(audit_router)
