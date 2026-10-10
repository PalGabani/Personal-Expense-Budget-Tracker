"""Guards for the transaction create/update payloads the dashboard sends."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas import TransactionCreate, TransactionUpdate


def create_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "type": "expense",
        "amount_minor": 12_500,
        "currency": "INR",
        "transaction_date": "2026-10-01",
        "category_id": str(uuid4()),
        "note": None,
    }
    payload.update(overrides)
    return payload


def update_payload(**overrides: object) -> dict[str, object]:
    """Mirrors the dashboard's PATCH body: same fields minus currency."""
    payload: dict[str, object] = {
        "type": "expense",
        "amount_minor": 12_500,
        "transaction_date": "2026-10-01",
        "category_id": str(uuid4()),
        "note": None,
    }
    payload.update(overrides)
    return payload


def test_create_accepts_currency() -> None:
    transaction = TransactionCreate.model_validate(create_payload())
    assert transaction.amount_minor == 12_500
    assert transaction.currency == "INR"


def test_update_accepts_dashboard_payload_without_currency() -> None:
    """Regression: the edit form must not send currency, which is immutable."""
    transaction = TransactionUpdate.model_validate(update_payload())
    assert transaction.amount_minor == 12_500
    assert not hasattr(transaction, "currency")


def test_update_rejects_currency_because_schema_forbids_extras() -> None:
    with pytest.raises(ValidationError):
        TransactionUpdate.model_validate(update_payload(currency="INR"))


def test_update_allows_clearing_only_the_note() -> None:
    transaction = TransactionUpdate.model_validate(update_payload(note=None))
    assert transaction.note is None


def test_update_rejects_blanking_a_required_field() -> None:
    with pytest.raises(ValidationError):
        TransactionUpdate.model_validate(update_payload(amount_minor=None))


def test_create_rejects_non_positive_amount() -> None:
    with pytest.raises(ValidationError):
        TransactionCreate.model_validate(create_payload(amount_minor=0))


def test_budget_month_must_be_first_of_month() -> None:
    from app.schemas import BudgetUpsert

    with pytest.raises(ValidationError):
        BudgetUpsert.model_validate(
            {
                "category_id": str(uuid4()),
                "month": "2026-10-02",
                "amount_minor": 1000,
            }
        )