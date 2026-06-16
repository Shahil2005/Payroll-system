from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app import logger
from app.core.config import setup_logger
from app.core.manager import lifespan
from app.core.redis import RedisHelper
from app.core.settings import Settings
from app.router.base import router as base_router
from app.router.payroll import router as payroll_router
from app.router.user import router as user_router

_settings = Settings()

app = FastAPI(lifespan=lifespan, debug=_settings.debug, docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

setup_logger(_settings.debug)

app.include_router(base_router)
app.include_router(payroll_router)
app.include_router(user_router)


client = TestClient(app)


def add_cache_layer(app: FastAPI) -> None:
    try:
        app.state.cache = RedisHelper()
    except Exception as e:
        logger.error(e)
