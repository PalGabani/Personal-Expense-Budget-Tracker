import logging
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import get_settings

logger = logging.getLogger(__name__)

MIGRATION_PATH = "supabase/migrations/202610090001_initial_schema.sql"
MIGRATION_HINT = (
    "The database schema is missing. Apply "
    f"{MIGRATION_PATH} in the Supabase SQL editor, then retry."
)

# PostgREST error codes that mean the request never reached a usable table.
# Everything else falls back to a generic bad-gateway response.
ERROR_CODE_STATUS: dict[str, tuple[int, str]] = {
    "PGRST205": (status.HTTP_503_SERVICE_UNAVAILABLE, MIGRATION_HINT),
    "42P01": (status.HTTP_503_SERVICE_UNAVAILABLE, MIGRATION_HINT),
    "42883": (status.HTTP_503_SERVICE_UNAVAILABLE, MIGRATION_HINT),
}


def _error_code(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return ""
    code = body.get("code") if isinstance(body, dict) else None
    return code if isinstance(code, str) else ""


async def check_schema() -> bool:
    """Return True when the expected tables exist. Never raises.

    The publishable key is the ``anon`` role, which RLS deliberately blocks, so a
    healthy project answers 401/403 here. Only a 404 (table absent from the
    schema cache) means the migration has not been applied.
    """
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_publishable_key:
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/rest/v1/categories",
                headers={
                    "apikey": settings.supabase_publishable_key,
                    "Authorization": f"Bearer {settings.supabase_publishable_key}",
                },
                params={"select": "id", "limit": "1"},
            )
    except httpx.HTTPError:
        return False
    if _error_code(response) in ERROR_CODE_STATUS:
        return False
    # 200 (readable) and 401/403 (exists but RLS-denied) both mean "applied".
    return response.status_code != 404


async def supabase_request(
    method: str,
    path: str,
    access_token: str,
    *,
    params: dict[str, str] | None = None,
    payload: dict[str, Any] | list[dict[str, Any]] | None = None,
    prefer: str | None = None,
) -> Any:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase data access is not configured.",
        )

    headers = {
        "apikey": settings.supabase_publishable_key,
        "Authorization": f"Bearer {access_token}",
    }
    if prefer:
        headers["Prefer"] = prefer

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.request(
                method,
                f"{settings.supabase_url.rstrip('/')}/rest/v1/{path.lstrip('/')}",
                headers=headers,
                params=params,
                json=payload,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The data service timed out. Please try again.",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The data service is temporarily unavailable.",
        ) from exc

    if response.status_code >= 400:
        error_response = {
            status.HTTP_400_BAD_REQUEST: (
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "The data service rejected the supplied values.",
            ),
            status.HTTP_401_UNAUTHORIZED: (
                status.HTTP_401_UNAUTHORIZED,
                "The Supabase access token is invalid or expired.",
            ),
            status.HTTP_403_FORBIDDEN: (
                status.HTTP_403_FORBIDDEN,
                "You do not have permission to access this record.",
            ),
            status.HTTP_409_CONFLICT: (
                status.HTTP_409_CONFLICT,
                "This change conflicts with existing data or linked records.",
            ),
        }
        mapped_status, detail = error_response.get(
            response.status_code,
            (
                status.HTTP_502_BAD_GATEWAY,
                "The data service could not complete the request.",
            ),
        )
        code = _error_code(response)
        if code in ERROR_CODE_STATUS:
            mapped_status, detail = ERROR_CODE_STATUS[code]
            logger.warning(
                "Supabase rejected %s %s with %s; the schema is likely not applied",
                method,
                path,
                code,
            )
        raise HTTPException(
            status_code=mapped_status,
            detail=detail,
        )

    if not response.content:
        return None
    return response.json()
