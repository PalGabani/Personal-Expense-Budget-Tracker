from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

TransactionType = Literal["income", "expense"]


class TransactionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: TransactionType
    amount_minor: int = Field(strict=True, gt=0, le=100_000_000_000)
    currency: Literal["INR"] = "INR"
    transaction_date: date
    category_id: UUID
    note: str | None = Field(default=None, max_length=300)


class CategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=60)
    type: TransactionType


class CategoryRename(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=60)


class TransactionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: TransactionType | None = None
    amount_minor: int | None = Field(default=None, strict=True, gt=0, le=100_000_000_000)
    transaction_date: date | None = None
    category_id: UUID | None = None
    note: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def require_at_least_one_change(self) -> "TransactionUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one transaction field must be provided.")
        if any(
            getattr(self, field_name) is None
            for field_name in self.model_fields_set - {"note"}
        ):
            raise ValueError("Only the note field may be cleared to null.")
        return self


class BudgetUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category_id: UUID
    month: date
    amount_minor: int = Field(strict=True, gt=0, le=100_000_000_000)

    @model_validator(mode="after")
    def require_first_day_of_month(self) -> "BudgetUpsert":
        if self.month.day != 1:
            raise ValueError("Budget month must be the first day of a calendar month.")
        return self


class MonthlySummaryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    month: date
    consent: bool

    @model_validator(mode="after")
    def validate_consent_and_month(self) -> "MonthlySummaryRequest":
        if not self.consent:
            raise ValueError("Explicit consent is required before requesting an AI summary.")
        if self.month.day != 1:
            raise ValueError("Month must be the first day of a calendar month.")
        return self
