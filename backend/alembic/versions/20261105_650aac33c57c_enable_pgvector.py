"""enable pgvector

Revision ID: 650aac33c57c
Revises:
Create Date: 2026-11-05 10:29:27.681945
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "650aac33c57c"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS vector")
