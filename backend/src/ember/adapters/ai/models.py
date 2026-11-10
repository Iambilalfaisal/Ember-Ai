"""The ``ai_usage`` table: one row per call attempt through the AI gateway.

Rows hold ids, counts, cost and timings only. Prompts, answers and document text never
go in this table (AGENTS.md section 9); they appear in Langfuse traces.
"""

from decimal import Decimal

from sqlalchemy import Boolean, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from ember.core.models import TenantModel


class AiUsage(TenantModel):
    __tablename__ = "ai_usage"

    task: Mapped[str] = mapped_column(String(100), nullable=False)
    operation: Mapped[str] = mapped_column(String(20), nullable=False)
    """``complete``, ``stream`` or ``embed``."""
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    """``ok``, ``error``, ``timeout`` or ``cancelled``."""
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(14, 8), nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    first_token_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_fallback: Mapped[bool] = mapped_column(Boolean, nullable=False)
    prompt_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prompt_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    """Exception class name only; the message may echo prompt content."""
