from datetime import date
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas import BudgetUpsert, MonthlySummaryRequest, TransactionCreate, TransactionUpdate


def test_transaction_amount_must_be_positive_integer_minor_units() -> None:
    with pytest.raises(ValidationError):
        TransactionCreate(
            type="expense",
            amount_minor=0,
            transaction_date=date(2026, 10, 1),
            category_id=uuid4(),
            note=None,
        )


def test_transaction_rejects_client_supplied_owner() -> None:
    with pytest.raises(ValidationError):
        TransactionCreate(
            type="expense",
            amount_minor=1200,
            transaction_date=date(2026, 10, 1),
            category_id=uuid4(),
            user_id=str(uuid4()),
        )


def test_transaction_update_requires_a_non_null_change() -> None:
    with pytest.raises(ValidationError):
        TransactionUpdate()
    with pytest.raises(ValidationError):
        TransactionUpdate(amount_minor=None)
    assert TransactionUpdate(note=None).note is None


def test_budget_month_must_be_first_day() -> None:
    with pytest.raises(ValidationError):
        BudgetUpsert(category_id=uuid4(), month=date(2026, 10, 2), amount_minor=10000)


def test_ai_summary_requires_consent_and_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        MonthlySummaryRequest(month=date(2026, 10, 1), consent=False)
    with pytest.raises(ValidationError):
        MonthlySummaryRequest(
            month=date(2026, 10, 1),
            consent=True,
            transactions=[{"note": "private note"}],
        )
