"""Tests for the Supabase request wrapper's error mapping."""

import httpx
import pytest
from fastapi import HTTPException

from app.services.supabase import MIGRATION_HINT, _error_code, supabase_request


def make_response(status_code: int, payload: object) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        json=payload,
        request=httpx.Request("GET", "https://example.supabase.co/rest/v1/categories"),
    )


def test_error_code_reads_postgrest_code() -> None:
    response = make_response(404, {"code": "PGRST205", "message": "missing table"})
    assert _error_code(response) == "PGRST205"


def test_error_code_ignores_non_json_body() -> None:
    response = httpx.Response(
        status_code=500,
        text="<html>gateway error</html>",
        request=httpx.Request("GET", "https://example.supabase.co/rest/v1/categories"),
    )
    assert _error_code(response) == ""


@pytest.mark.asyncio
async def test_missing_table_reports_migration_hint_not_bad_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A schema that was never applied must point at the migration, not a 502."""
    response = make_response(404, {"code": "PGRST205", "message": "table not found"})

    class FakeAsyncClient:
        def __init__(self, **_: object) -> None:
            pass

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def request(self, *args: object, **kwargs: object) -> httpx.Response:
            return response

    monkeypatch.setattr(
        "app.services.supabase.httpx.AsyncClient",
        lambda **kwargs: FakeAsyncClient(**kwargs),
    )

    with pytest.raises(HTTPException) as excinfo:
        await supabase_request("GET", "categories", "test-token")

    assert excinfo.value.status_code == 503
    assert excinfo.value.detail == MIGRATION_HINT


@pytest.mark.asyncio
async def test_unmapped_upstream_error_stays_a_bad_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = make_response(500, {"message": "internal error"})

    class FakeAsyncClient:
        def __init__(self, **_: object) -> None:
            pass

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def request(self, *args: object, **kwargs: object) -> httpx.Response:
            return response

    monkeypatch.setattr(
        "app.services.supabase.httpx.AsyncClient",
        lambda **kwargs: FakeAsyncClient(**kwargs),
    )

    with pytest.raises(HTTPException) as excinfo:
        await supabase_request("GET", "categories", "test-token")

    assert excinfo.value.status_code == 502


@pytest.mark.asyncio
async def test_auth_error_keeps_its_specific_status(monkeypatch: pytest.MonkeyPatch) -> None:
    """An expired token must stay a 401 so the client can re-authenticate."""
    response = make_response(401, {"message": "invalid token"})

    class FakeAsyncClient:
        def __init__(self, **_: object) -> None:
            pass

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def request(self, *args: object, **kwargs: object) -> httpx.Response:
            return response

    monkeypatch.setattr(
        "app.services.supabase.httpx.AsyncClient",
        lambda **kwargs: FakeAsyncClient(**kwargs),
    )

    with pytest.raises(HTTPException) as excinfo:
        await supabase_request("GET", "categories", "expired-token")

    assert excinfo.value.status_code == 401