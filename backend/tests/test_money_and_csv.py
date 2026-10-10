import pytest

from app import routes
from app.routes import aggregate_expenses, csv_safe_cell, iter_transactions, month_bounds


def test_month_bounds_crosses_year_boundary() -> None:
    assert month_bounds("2026-12") == ("2026-12-01", "2027-01-01")


def test_ai_aggregate_includes_only_expense_totals_by_category() -> None:
    transactions = [
        {
            "id": "private-row-id",
            "type": "expense",
            "amount_minor": 1250,
            "note": "PRIVATE_TRANSACTION_NOTE",
            "merchant": "PRIVATE_MERCHANT",
            "categories": {"name": "Food"},
        },
        {
            "type": "expense",
            "amount_minor": 750,
            "note": None,
            "categories": {"name": "Food"},
        },
        {
            "type": "income",
            "amount_minor": 50000,
            "note": "Salary",
            "categories": {"name": "Income"},
        },
    ]

    totals = aggregate_expenses(transactions)

    assert totals == {"Food": 2000}
    assert "PRIVATE_TRANSACTION_NOTE" not in str(totals)
    assert "PRIVATE_MERCHANT" not in str(totals)
    assert "private-row-id" not in str(totals)


def test_csv_cell_quotes_and_escapes_quotes() -> None:
    assert csv_safe_cell('Lunch, "team"') == 'Lunch, "team"'


def test_csv_cell_neutralizes_formula_after_whitespace() -> None:
    assert csv_safe_cell("  =HYPERLINK(\"https://example.test\")") == (
        "'  =HYPERLINK(\"https://example.test\")"
    )


def test_csv_cell_neutralizes_negative_formula_prefix() -> None:
    assert csv_safe_cell("-1+1") == "'-1+1"


@pytest.mark.asyncio
async def test_transaction_iterator_reads_past_the_first_page(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(routes, "TRANSACTION_PAGE_SIZE", 2)
    offsets: list[str] = []

    async def fake_supabase_request(
        method: str,
        path: str,
        access_token: str,
        *,
        params: dict[str, str] | None = None,
        **kwargs: object,
    ) -> list[dict[str, object]]:
        assert method == "GET"
        assert path == "transactions"
        assert access_token == "test-token"
        assert params is not None
        offsets.append(params["offset"])
        if params["offset"] == "0":
            return [{"note": "one", "categories": {}}, {"note": "two", "categories": {}}]
        return [{"note": "three", "categories": {}}]

    monkeypatch.setattr(routes, "supabase_request", fake_supabase_request)
    result = [
        row async for row in iter_transactions("test-token")
    ]

    assert len(result) == 3
    assert offsets == ["0", "2"]
