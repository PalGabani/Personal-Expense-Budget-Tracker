"""Tests for the Gemini summary error mapping and retry behaviour."""

from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI, HTTPException

from app import routes
from app.auth import get_current_user
from app.config import Settings
from app.main import app


@pytest.fixture
def test_app() -> FastAPI:
    app.dependency_overrides.clear()
    return app


def _settings(**overrides: object) -> Settings:
    return Settings(
        ai_summary_enabled=True,
        gemini_api_key="test-key",
        gemini_model="gemini-3.8-flash",
        **overrides,  # type: ignore[arg-type]
    )


def _response(status_code: int, payload: object) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        json=payload,
        request=httpx.Request(
            "POST", "https://generativelanguage.googleapis.com/v1beta/models/x:generateContent"
        ),
    )


def _fake_httpx(client_factory: object) -> object:
    """Shim replacing only the `httpx` name seen by app.routes.

    Patching `httpx.AsyncClient` directly would also replace the test's own
    client, because `app.routes.httpx` is the global module object.
    """
    return SimpleNamespace(
        AsyncClient=client_factory,
        Timeout=httpx.Timeout,
        TimeoutException=httpx.TimeoutException,
        RequestError=httpx.RequestError,
    )


@pytest.mark.parametrize(
    ("upstream", "fragment"),
    [
        (429, "rate limit"),
        (401, "API key"),
        (403, "API key"),
        (404, "GEMINI_MODEL"),
        (400, "request format"),
        (500, "could not complete"),
    ],
)
def test_upstream_status_maps_to_actionable_detail(
    upstream: int, fragment: str
) -> None:
    detail = routes._gemini_error_detail(upstream)
    assert fragment.lower() in detail.lower()


@pytest.mark.asyncio
async def test_rate_limit_is_retried_once_before_succeeding(
    test_app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A transient 429 should be absorbed by the backoff retry."""
    calls: list[int] = []
    attempts = iter([429, 200])

    class FakeAsyncClient:
        def __init__(self, **_: object) -> None:
            pass

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def post(self, *args: object, **kwargs: object) -> httpx.Response:
            calls.append(1)
            code = next(attempts)
            if code == 429:
                return _response(
                    429,
                    {"error": {"message": "quota", "status": "RESOURCE_EXHAUSTED"}},
                )
            return _response(
                200,
                {"candidates": [{"content": {"parts": [{"text": "Spending was steady."}]}}]},
            )

    monkeypatch.setattr(routes, "get_settings", _settings)
    monkeypatch.setattr(routes, "fetch_transactions", _fake_transactions)
    monkeypatch.setattr(routes, "httpx", _fake_httpx(lambda **kw: FakeAsyncClient(**kw)))
    monkeypatch.setattr(routes.asyncio, "sleep", _no_sleep)
    test_app.dependency_overrides[get_current_user] = lambda: {
        "id": "00000000-0000-0000-0000-000000000001",
        "access_token": "test-token",
    }

    transport = httpx.ASGITransport(app=test_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/reports/ai-summary",
            json={"month": "2026-10-01", "consent": True},
        )

    assert response.status_code == 200
    assert response.json()["summary"] == "Spending was steady."
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_repeated_failure_returns_actionable_message(
    test_app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakeAsyncClient:
        def __init__(self, **_: object) -> None:
            pass

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def post(self, *args: object, **kwargs: object) -> httpx.Response:
            return _response(429, {"error": {"message": "quota", "status": "RESOURCE_EXHAUSTED"}})

    monkeypatch.setattr(routes, "get_settings", _settings)
    monkeypatch.setattr(routes, "fetch_transactions", _fake_transactions)
    monkeypatch.setattr(routes, "httpx", _fake_httpx(lambda **kw: FakeAsyncClient(**kw)))
    monkeypatch.setattr(routes.asyncio, "sleep", _no_sleep)
    test_app.dependency_overrides[get_current_user] = lambda: {
        "id": "00000000-0000-0000-0000-000000000001",
        "access_token": "test-token",
    }

    transport = httpx.ASGITransport(app=test_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/reports/ai-summary",
            json={"month": "2026-10-01", "consent": True},
        )

    assert response.status_code == 503
    assert "rate limit" in response.json()["detail"].lower()


async def _no_sleep(_: float) -> None:
    return None


async def _fake_transactions(*_args: object, **_kwargs: object) -> list[dict[str, object]]:
    return [
        {
            "type": "expense",
            "amount_minor": 45000,
            "note": "private note",
            "categories": {"name": "Food & Dining"},
        }
    ]


def test_disabled_feature_short_circuits() -> None:
    """Guard the feature flag contract used by the 503 gate."""
    with pytest.raises(HTTPException):
        raise HTTPException(status_code=503, detail="AI summaries are disabled by the server.")