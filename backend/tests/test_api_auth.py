import json
from collections.abc import AsyncIterator
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI

from app import routes
from app.auth import get_current_user
from app.config import Settings
from app.main import app


@pytest.fixture
def test_app() -> AsyncIterator[FastAPI]:
    app.dependency_overrides.clear()
    yield app
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_health_endpoint_is_public_and_reports_ready(test_app: FastAPI) -> None:
    transport = httpx.ASGITransport(app=test_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_private_transactions_reject_missing_bearer_token(
    test_app: FastAPI,
) -> None:
    transport = httpx.ASGITransport(app=test_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/transactions")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_transaction_uses_verified_user_identity(
    test_app: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner_id = str(uuid4())
    captured: dict[str, object] = {}
    test_app.dependency_overrides[get_current_user] = lambda: {
        "id": owner_id,
        "access_token": "verified-test-token",
    }

    async def fake_supabase_request(
        method: str,
        path: str,
        access_token: str,
        **kwargs: object,
    ) -> list[dict[str, str]]:
        captured.update({"method": method, "path": path, "token": access_token, **kwargs})
        return [{"id": "transaction-id", "user_id": owner_id}]

    monkeypatch.setattr(routes, "supabase_request", fake_supabase_request)
    transport = httpx.ASGITransport(app=test_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/transactions",
            json={
                "type": "expense",
                "amount_minor": 1200,
                "currency": "INR",
                "transaction_date": "2026-10-01",
                "category_id": str(uuid4()),
                "note": "test record",
            },
        )

    assert response.status_code == 201
    assert response.json()["user_id"] == owner_id
    assert captured["token"] == "verified-test-token"
    assert captured["payload"]["user_id"] == owner_id


@pytest.mark.asyncio
async def test_ai_summary_sends_only_aggregate_expenses_after_consent(
    test_app: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}
    test_app.dependency_overrides[get_current_user] = lambda: {
        "id": str(uuid4()),
        "access_token": "verified-test-token",
    }
    monkeypatch.setattr(
        routes,
        "get_settings",
        lambda: Settings(
            ai_summary_enabled=True,
            gemini_api_key="test-key",
            gemini_model="test-model",
        ),
    )

    async def fake_transactions(access_token: str, *, month: str) -> list[dict[str, object]]:
        assert access_token == "verified-test-token"
        assert month == "2026-10"
        return [
            {
                "type": "expense",
                "amount_minor": 1250,
                "note": "PRIVATE_TRANSACTION_NOTE",
                "id": "PRIVATE_ROW_ID",
                "categories": {"name": "Food"},
            },
            {"type": "income", "amount_minor": 50000, "categories": {"name": "Salary"}},
        ]

    async def gemini_response(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["api_key"] = request.headers.get("x-goog-api-key")
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": "Food spending was ₹12.50."}]}}]},
        )

    original_async_client = httpx.AsyncClient
    gemini_transport = httpx.MockTransport(gemini_response)

    def mocked_provider_client(*, timeout: float) -> httpx.AsyncClient:
        return original_async_client(transport=gemini_transport, timeout=timeout)

    monkeypatch.setattr(routes, "fetch_transactions", fake_transactions)
    monkeypatch.setattr(routes.httpx, "AsyncClient", mocked_provider_client)
    transport = original_async_client  # Keep the test client independent of provider mocking.
    async with transport(
        transport=httpx.ASGITransport(app=test_app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/reports/ai-summary",
            json={"month": "2026-10-01", "consent": True},
        )

    assert response.status_code == 200
    assert response.json()["summary"] == "Food spending was ₹12.50."
    body = captured["body"]
    serialized_body = json.dumps(body)
    assert "Food" in serialized_body
    assert "1250" in serialized_body
    assert "PRIVATE_TRANSACTION_NOTE" not in serialized_body
    assert "PRIVATE_ROW_ID" not in serialized_body
    assert "Salary" not in serialized_body
    assert captured["api_key"] == "test-key"
    assert "test-key" not in captured["url"]


@pytest.mark.asyncio
async def test_transaction_filters_combine_and_search_case_insensitively(
    test_app: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = str(uuid4())
    category_id = str(uuid4())
    captured: dict[str, object] = {}
    test_app.dependency_overrides[get_current_user] = lambda: {
        "id": user_id,
        "access_token": "verified-test-token",
    }

    async def fake_supabase_request(
        method: str,
        path: str,
        access_token: str,
        *,
        params: dict[str, str] | None = None,
        **kwargs: object,
    ) -> list[dict[str, object]]:
        captured.update({"method": method, "path": path, "token": access_token, "params": params})
        return [
            {"id": "match", "note": "Coffee with friends", "categories": {"name": "Food"}},
            {"id": "skip", "note": "Bus ticket", "categories": {"name": "Transport"}},
        ]

    monkeypatch.setattr(routes, "supabase_request", fake_supabase_request)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=test_app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            "/api/transactions",
            params={
                "month": "2026-10",
                "type": "expense",
                "category_id": category_id,
                "search": "FOOD",
            },
        )

    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == ["match"]
    params = captured["params"]
    assert params["transaction_date"] == "gte.2026-10-01"
    assert params["and"] == "(transaction_date.lt.2026-11-01)"
    assert params["type"] == "eq.expense"
    assert params["category_id"] == f"eq.{category_id}"


@pytest.mark.asyncio
async def test_monthly_report_sums_income_and_expenses_separately(
    test_app: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_app.dependency_overrides[get_current_user] = lambda: {
        "id": str(uuid4()),
        "access_token": "verified-test-token",
    }

    async def fake_transactions(access_token: str, *, month: str) -> list[dict[str, object]]:
        assert month == "2026-10"
        return [
            {"type": "income", "amount_minor": 50000, "categories": {"name": "Salary"}},
            {"type": "expense", "amount_minor": 1250, "categories": {"name": "Food"}},
            {"type": "expense", "amount_minor": 750, "categories": {"name": "Food"}},
        ]

    async def fake_budgets(user: dict[str, str], month: str) -> list[dict[str, object]]:
        assert user["access_token"] == "verified-test-token"
        assert month == "2026-10"
        return []

    monkeypatch.setattr(routes, "fetch_transactions", fake_transactions)
    monkeypatch.setattr(routes, "list_budgets", fake_budgets)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=test_app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/reports/monthly?month=2026-10")

    assert response.status_code == 200
    assert response.json() == {
        "month": "2026-10",
        "currency": "INR",
        "income_minor": 50000,
        "expenses_minor": 2000,
        "net_minor": 48000,
        "category_totals_minor": {"Food": 2000},
        "budgets": [],
    }


@pytest.mark.asyncio
async def test_budget_upsert_is_owner_scoped_and_monthly_unique(
    test_app: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = str(uuid4())
    category_id = str(uuid4())
    captured: dict[str, object] = {}
    test_app.dependency_overrides[get_current_user] = lambda: {
        "id": user_id,
        "access_token": "verified-test-token",
    }

    async def fake_supabase_request(
        method: str,
        path: str,
        access_token: str,
        **kwargs: object,
    ) -> list[dict[str, object]]:
        captured.update({"method": method, "path": path, "token": access_token, **kwargs})
        return [{"user_id": user_id, "category_id": category_id, "amount_minor": 20000}]

    monkeypatch.setattr(routes, "supabase_request", fake_supabase_request)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=test_app),
        base_url="http://test",
    ) as client:
        response = await client.put(
            "/api/budgets",
            json={
                "category_id": category_id,
                "month": "2026-10-01",
                "amount_minor": 20000,
            },
        )

    assert response.status_code == 200
    assert captured["method"] == "POST"
    assert captured["path"] == "budgets"
    assert captured["token"] == "verified-test-token"
    assert captured["params"] == {"on_conflict": "user_id,category_id,month"}
    assert captured["payload"]["user_id"] == user_id
    assert captured["payload"]["category_id"] == category_id
