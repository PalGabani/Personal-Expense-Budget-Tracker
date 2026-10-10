import asyncio
import csv
import io
import logging
from collections.abc import AsyncIterator
from datetime import date
from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse

from app.auth import CurrentUser
from app.config import get_settings
from app.schemas import (
    BudgetUpsert,
    CategoryCreate,
    CategoryRename,
    MonthlySummaryRequest,
    TransactionCreate,
    TransactionUpdate,
)
from app.services.supabase import supabase_request

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)
MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"
TRANSACTION_PAGE_SIZE = 500

# Free-tier Gemini quotas are per-minute; retry once on throttling or a
# transient upstream failure instead of surfacing a 503 immediately.
_RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})
_RETRY_DELAY_SECONDS = 2.0


def month_bounds(month: str) -> tuple[str, str]:
    year, month_number = (int(part) for part in month.split("-"))
    start = date(year, month_number, 1)
    if month_number == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month_number + 1, 1)
    return start.isoformat(), end.isoformat()


def aggregate_expenses(transactions: list[dict[str, Any]]) -> dict[str, int]:
    totals: dict[str, int] = {}
    for row in transactions:
        if row["type"] != "expense":
            continue
        category = (row.get("categories") or {}).get("name") or "Uncategorized"
        totals[category] = totals.get(category, 0) + row["amount_minor"]
    return totals


async def iter_transactions(
    access_token: str,
    *,
    month: str | None = None,
    transaction_type: str | None = None,
    category_id: str | None = None,
    search: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    offset = 0
    needle = search.strip().casefold() if search else ""
    while True:
        params = {
            "select": "*,categories(name)",
            "order": "transaction_date.desc,created_at.desc,id.asc",
            "limit": str(TRANSACTION_PAGE_SIZE),
            "offset": str(offset),
        }
        if month:
            start, end = month_bounds(month)
            params["transaction_date"] = f"gte.{start}"
            params["and"] = f"(transaction_date.lt.{end})"
        if transaction_type:
            params["type"] = f"eq.{transaction_type}"
        if category_id:
            params["category_id"] = f"eq.{category_id}"

        page = await supabase_request("GET", "transactions", access_token, params=params)
        if not isinstance(page, list):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The data service returned an invalid transaction list.",
            )
        for row in page:
            if not needle or needle in (row.get("note") or "").casefold() or needle in (
                (row.get("categories") or {}).get("name") or ""
            ).casefold():
                yield row
        if len(page) < TRANSACTION_PAGE_SIZE:
            return
        offset += TRANSACTION_PAGE_SIZE


async def fetch_transactions(
    access_token: str,
    *,
    month: str | None = None,
    transaction_type: str | None = None,
    category_id: str | None = None,
    search: str | None = None,
) -> list[dict[str, Any]]:
    return [
        row
        async for row in iter_transactions(
            access_token,
            month=month,
            transaction_type=transaction_type,
            category_id=category_id,
            search=search,
        )
    ]


@router.get("/categories")
async def list_categories(
    user: CurrentUser,
    category_type: str | None = Query(default=None, alias="type", pattern="^(income|expense)$"),
) -> Any:
    params = {"select": "*", "order": "type.asc,name.asc"}
    if category_type:
        params["type"] = f"eq.{category_type}"
    return await supabase_request("GET", "categories", user["access_token"], params=params)


@router.post("/categories", status_code=status.HTTP_201_CREATED)
async def create_category(payload: CategoryCreate, user: CurrentUser) -> Any:
    row = payload.model_dump()
    row["name"] = row["name"].strip()
    if not row["name"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Category name cannot be blank.",
        )
    row["user_id"] = user["id"]
    result = await supabase_request(
        "POST",
        "categories",
        user["access_token"],
        payload=row,
        prefer="return=representation",
    )
    return result[0] if isinstance(result, list) and result else result


@router.patch("/categories/{category_id}")
async def rename_category(
    category_id: UUID,
    payload: CategoryRename,
    user: CurrentUser,
) -> Any:
    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Provide a non-empty category name only.",
        )
    result = await supabase_request(
        "PATCH",
        "categories",
        user["access_token"],
        params={"id": f"eq.{category_id}", "select": "*"},
        payload={"name": name},
        prefer="return=representation",
    )
    if not isinstance(result, list) or not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
    return result[0]


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: UUID, user: CurrentUser) -> Response:
    result = await supabase_request(
        "DELETE",
        "categories",
        user["access_token"],
        params={"id": f"eq.{category_id}", "select": "id"},
        prefer="return=representation",
    )
    if not isinstance(result, list) or not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found or still referenced by a transaction or budget.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/transactions")
async def list_transactions(
    user: CurrentUser,
    month: str | None = Query(default=None, pattern=MONTH_PATTERN),
    transaction_type: str | None = Query(default=None, alias="type", pattern="^(income|expense)$"),
    category_id: UUID | None = None,
    search: str | None = Query(default=None, max_length=100),
) -> list[dict[str, Any]]:
    return await fetch_transactions(
        user["access_token"],
        month=month,
        transaction_type=transaction_type,
        category_id=str(category_id) if category_id else None,
        search=search,
    )


@router.post("/transactions", status_code=status.HTTP_201_CREATED)
async def create_transaction(payload: TransactionCreate, user: CurrentUser) -> Any:
    row = payload.model_dump(mode="json")
    row["user_id"] = user["id"]
    result = await supabase_request(
        "POST",
        "transactions",
        user["access_token"],
        payload=row,
        prefer="return=representation",
    )
    return result[0] if isinstance(result, list) and result else result


@router.patch("/transactions/{transaction_id}")
async def update_transaction(
    transaction_id: UUID,
    payload: TransactionUpdate,
    user: CurrentUser,
) -> Any:
    result = await supabase_request(
        "PATCH",
        "transactions",
        user["access_token"],
        params={"id": f"eq.{transaction_id}", "select": "*"},
        payload=payload.model_dump(mode="json", exclude_unset=True),
        prefer="return=representation",
    )
    if not isinstance(result, list) or not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")
    return result[0]


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(transaction_id: UUID, user: CurrentUser) -> Response:
    result = await supabase_request(
        "DELETE",
        "transactions",
        user["access_token"],
        params={"id": f"eq.{transaction_id}", "select": "id"},
        prefer="return=representation",
    )
    if not isinstance(result, list) or not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/budgets")
async def list_budgets(
    user: CurrentUser,
    month: str | None = Query(default=None, pattern=MONTH_PATTERN),
) -> Any:
    params: dict[str, str] = {"select": "*,categories(name)", "order": "month.desc"}
    if month:
        start, _ = month_bounds(month)
        params["month"] = f"eq.{start}"
    return await supabase_request("GET", "budgets", user["access_token"], params=params)


@router.put("/budgets")
async def upsert_budget(payload: BudgetUpsert, user: CurrentUser) -> Any:
    row = payload.model_dump(mode="json")
    row["user_id"] = user["id"]
    result = await supabase_request(
        "POST",
        "budgets",
        user["access_token"],
        params={"on_conflict": "user_id,category_id,month"},
        payload=row,
        prefer="resolution=merge-duplicates,return=representation",
    )
    return result[0] if isinstance(result, list) and result else result


@router.get("/reports/monthly")
async def monthly_report(
    user: CurrentUser,
    month: str = Query(pattern=MONTH_PATTERN),
) -> dict[str, Any]:
    transactions = await fetch_transactions(user["access_token"], month=month)
    income_minor = sum(row["amount_minor"] for row in transactions if row["type"] == "income")
    expenses_minor = sum(row["amount_minor"] for row in transactions if row["type"] == "expense")
    categories: dict[str, int] = {}
    for row in transactions:
        if row["type"] != "expense":
            continue
        category_name = (row.get("categories") or {}).get("name") or "Uncategorized"
        categories[category_name] = categories.get(category_name, 0) + row["amount_minor"]
    budgets = await list_budgets(user, month)
    return {
        "month": month,
        "currency": "INR",
        "income_minor": income_minor,
        "expenses_minor": expenses_minor,
        "net_minor": income_minor - expenses_minor,
        "category_totals_minor": categories,
        "budgets": budgets,
    }


def csv_safe_cell(value: Any) -> str:
    text = "" if value is None else str(value)
    if text.lstrip(" \t\r\n").startswith(("=", "+", "-", "@")):
        text = f"'{text}"
    return text


@router.get("/reports/transactions.csv")
async def export_transactions(
    user: CurrentUser,
    month: str | None = Query(default=None, pattern=MONTH_PATTERN),
    transaction_type: str | None = Query(default=None, alias="type", pattern="^(income|expense)$"),
    category_id: UUID | None = None,
    search: str | None = Query(default=None, max_length=100),
) -> StreamingResponse:
    async def csv_content() -> AsyncIterator[str]:
        header = io.StringIO(newline="")
        csv.writer(header, lineterminator="\r\n", quoting=csv.QUOTE_ALL).writerow(
            ["date", "type", "amount_minor", "currency", "category", "note"]
        )
        yield header.getvalue()
        async for row in iter_transactions(
            user["access_token"],
            month=month,
            transaction_type=transaction_type,
            category_id=str(category_id) if category_id else None,
            search=search,
        ):
            category_name = (row.get("categories") or {}).get("name") or ""
            output = io.StringIO(newline="")
            csv.writer(output, lineterminator="\r\n", quoting=csv.QUOTE_ALL).writerow(
                [
                    csv_safe_cell(row.get("transaction_date")),
                    csv_safe_cell(row.get("type")),
                    csv_safe_cell(row.get("amount_minor")),
                    csv_safe_cell(row.get("currency")),
                    csv_safe_cell(category_name),
                    csv_safe_cell(row.get("note")),
                ]
            )
            yield output.getvalue()

    return StreamingResponse(
        csv_content(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="transactions.csv"'},
    )


def _gemini_error_detail(status_code: int) -> str:
    """Map an upstream Gemini failure to an actionable, non-technical message.

    These are Gemini's own HTTP codes, not ours, so plain integers are used
    rather than FastAPI's status constants.
    """
    if status_code == 429:
        return (
            "The AI provider's free-tier rate limit was reached. "
            "Wait a minute and try again."
        )
    if status_code in (401, 403):
        return "The AI provider rejected the configured API key."
    if status_code == 404:
        return (
            f"The configured AI model '{get_settings().gemini_model}' is unavailable "
            "for this key. Check GEMINI_MODEL."
        )
    if status_code == 400:
        return "The AI provider rejected the request format."
    return "The AI summary provider could not complete the request."


@router.post("/reports/ai-summary")
async def ai_monthly_summary(payload: MonthlySummaryRequest, user: CurrentUser) -> dict[str, str]:
    settings = get_settings()
    if not settings.ai_summary_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI summaries are disabled by the server.",
        )
    if not settings.gemini_api_key or not settings.gemini_model:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI summary provider is not configured.",
        )

    month = payload.month.strftime("%Y-%m")
    transactions = await fetch_transactions(user["access_token"], month=month)
    totals = aggregate_expenses(transactions)

    prompt = (
        "Write a neutral, concise monthly spending summary. Describe patterns in the provided "
        "category totals without giving financial, investment, or debt advice. Do not infer "
        "facts that are not present. Use short Markdown paragraphs and bullet points, and bold "
        "the category names. Keep it under 120 words. The figures are INR paise. "
        f"Month: {month}. Aggregate expense totals by category: {totals}"
    )
    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/{settings.gemini_model}:generateContent"
    )
    gemini_payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 220,
            "temperature": 0.2,
            # gemini-3.x is a thinking model and would otherwise spend nearly the
            # whole token budget on internal reasoning, returning an empty or
            # truncated summary.
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }

    try:
        # gemini-3.x can take well over 20s on a cold start even with thinking
        # disabled, so the read budget is generous enough to avoid spurious 503s.
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=15.0)) as client:
            # The free tier rate-limits aggressively; one bounded retry with
            # backoff absorbs a short burst without surfacing a 503.
            for attempt in range(2):
                response = await client.post(
                    endpoint,
                    headers={"x-goog-api-key": settings.gemini_api_key},
                    json=gemini_payload,
                )
                if response.status_code not in _RETRY_STATUSES or attempt == 1:
                    break
                logger.warning(
                    "Gemini returned %s; retrying once after backoff",
                    response.status_code,
                )
                await asyncio.sleep(_RETRY_DELAY_SECONDS)
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI summary took too long to generate. Please try again.",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI summary provider is temporarily unavailable.",
        ) from exc

    if response.status_code >= 400:
        # Log the upstream status and message so quota/rate-limit/auth problems
        # are diagnosable from the server log. No prompt or transaction data is
        # logged.
        try:
            upstream = response.json().get("error", {})
            logger.warning(
                "Gemini rejected the summary request: status=%s reason=%s message=%s",
                response.status_code,
                upstream.get("status"),
                upstream.get("message"),
            )
        except ValueError:
            logger.warning(
                "Gemini rejected the summary request: status=%s (non-JSON body)",
                response.status_code,
            )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_gemini_error_detail(response.status_code),
        )
    response_data = response.json()
    try:
        text = response_data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI provider returned an invalid summary response.",
        ) from exc
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI provider returned an empty summary.",
        )
    return {"month": month, "summary": text.strip()[:2000]}
