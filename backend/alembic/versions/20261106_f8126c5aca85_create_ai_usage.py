"""create ai usage

Revision ID: f8126c5aca85
Revises: 18365f55a9e8
Create Date: 2026-11-06 17:03:27.964113
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f8126c5aca85"
down_revision: str | None = "18365f55a9e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_usage",
        sa.Column("task", sa.String(length=100), nullable=False),
        sa.Column("operation", sa.String(length=20), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Numeric(precision=14, scale=8), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("first_token_ms", sa.Integer(), nullable=True),
        sa.Column("is_fallback", sa.Boolean(), nullable=False),
        sa.Column("prompt_name", sa.String(length=100), nullable=True),
        sa.Column("prompt_version", sa.Integer(), nullable=True),
        sa.Column("error_type", sa.String(length=100), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_usage")),
    )
    op.create_index(op.f("ix_ai_usage_tenant_id"), "ai_usage", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_usage_tenant_id"), table_name="ai_usage")
    op.drop_table("ai_usage")
