from __future__ import annotations

import logging

from fastapi import Header

from app.config import settings
from app.errors import AppError

logger = logging.getLogger("mira.auth")

_DEV_WARNING_EMITTED = False


def warn_if_auth_disabled() -> None:
    global _DEV_WARNING_EMITTED
    if not settings.MIRA_API_KEY and not _DEV_WARNING_EMITTED:
        logger.warning(
            "MIRA_API_KEY is empty; authentication is disabled (development mode). "
            "Set MIRA_API_KEY before exposing this service."
        )
        _DEV_WARNING_EMITTED = True


async def require_auth(authorization: str | None = Header(default=None)) -> None:
    """Require Authorization: Bearer <MIRA_API_KEY> when a key is configured."""
    key = settings.MIRA_API_KEY
    if not key:
        warn_if_auth_disabled()
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise AppError(
            "AUTH_FAILED",
            "Missing or invalid Authorization header. Use: Authorization: Bearer <MIRA_API_KEY>.",
            status_code=401,
        )
    token = authorization[7:].strip()
    if token != key:
        raise AppError("AUTH_FAILED", "Invalid API key.", status_code=401)
