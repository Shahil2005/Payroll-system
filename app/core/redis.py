import json
import os
from typing import Any

from fastapi import FastAPI
from redis.asyncio import Redis

from app import logger


class RedisHelper:
    """Helper class for Redis operations."""

    def __init__(self, host: str | None = None, port: int | None = None, db: int = 0) -> None:
        """Initialize Redis connection.

        Host/port fall back to REDIS_HOST/REDIS_PORT env vars (then sensible
        local defaults), so the same code works in containers and locally.

        Args:
        ----
            host: Redis host address (defaults to REDIS_HOST or localhost)
            port: Redis port number (defaults to REDIS_PORT or 6379)
            db: Redis database number

        """
        resolved_host: str = host or os.getenv("REDIS_HOST") or "localhost"
        resolved_port: int = port or int(os.getenv("REDIS_PORT") or "6379")
        self.redis_client = Redis(
            host=resolved_host,
            port=resolved_port,
            db=db,
            decode_responses=True,
            password=os.getenv("REDIS_PASSWORD"),
        )

    async def set(self, key: str, value: Any, *, expire: int | None = None, to_json: bool = False) -> bool:
        """To Set key-value pair in Redis.

        Args:
        ----
            key: Redis key
            value: Value to store
            expire: Optional expiry time in seconds
            to_json: To return JSON object

        Returns:
        -------
            bool: True if successful, False otherwise

        """
        try:
            if to_json:
                try:
                    value = json.dumps(value)
                except Exception as e:
                    logger.exception(f"Error Json Dumps in Redis Set: {e!r}", e)
            await self.redis_client.set(key, value, ex=expire)
            return True
        except Exception as e:
            logger.exception(f"Error setting Redis key: {e!r}", e)
            return False

    async def get(self, key: str, *, to_json: bool = False) -> Any | None:
        """Get value for key from Redis."""
        try:
            val: str | bytes | bytearray = await self.redis_client.get(key)

            if isinstance(val, bytearray | bytes):
                val = val.decode("utf-8")

            if val and to_json:
                try:
                    return json.loads(val)
                except Exception as e:
                    logger.exception(f"Error decoding JSON from Redis: {e!r}", e)
                    return val

        except Exception as e:
            logger.exception(f"Error getting Redis key: {e!r}", e)
            return None
        else:
            return val

    async def delete(self, key: str) -> bool:
        """Delete key from Redis.

        Args:
        ----
            key: Redis key

        Returns:
        -------
            bool: True if successful, False otherwise

        """
        try:
            return bool(await self.redis_client.delete(key))
        except Exception as e:
            logger.exception(f"Error deleting Redis key: {e!r}", e)
            return False

    async def exists(self, key: str) -> bool:
        """Check if key exists in Redis.

        Args:
        ----
            key: Redis key

        Returns:
        -------
            bool: True if key exists, False otherwise

        """
        try:
            return bool(await self.redis_client.exists(key))
        except Exception as e:
            logger.exception(f"Error checking Redis key: {e!r}", e)
            return False

    async def flush(self) -> bool:
        """Clear all keys from current database.

        Returns
        -------
            bool: True if successful, False otherwise

        """
        try:
            await self.redis_client.flushdb()
            return True
        except Exception as e:
            logger.exception(f"Error flushing Redis db: {e!r}", e)
            return False


def add_cache_layer(app: FastAPI) -> None:
    try:
        app.state.cache = RedisHelper()
    except Exception as e:
        logger.error(e)
