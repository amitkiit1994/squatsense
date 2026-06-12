"""add gym_inquiries pipeline fields (stage, next_action, stage_updated_at)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-12 00:00:00.000000

MIGRATION NOTE
--------------
This migration runs automatically in production: the Dockerfile CMD executes
``alembic upgrade head`` before gunicorn starts. ``init_db()``'s
``create_all`` only creates MISSING tables, so it will NOT add these columns
to the existing ``gym_inquiries`` table — this migration (or the manual
ALTER below) is required for existing databases.

Manual equivalent (PostgreSQL), if applying outside Alembic:

    ALTER TABLE gym_inquiries
        ADD COLUMN IF NOT EXISTS stage VARCHAR(20) NOT NULL DEFAULT 'new',
        ADD COLUMN IF NOT EXISTS next_action VARCHAR(255),
        ADD COLUMN IF NOT EXISTS stage_updated_at TIMESTAMPTZ;

Purely additive: ``stage`` has a server default of 'new' so existing rows
backfill to the start of the pipeline with no lock-heavy rewrite; the other
two columns are nullable. Stage values (new|contacted|demo|trial|won|lost)
are validated at the schema layer, not as a DB enum.

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'gym_inquiries',
        sa.Column('stage', sa.String(length=20), server_default='new', nullable=False),
    )
    op.add_column(
        'gym_inquiries',
        sa.Column('next_action', sa.String(length=255), nullable=True),
    )
    op.add_column(
        'gym_inquiries',
        sa.Column('stage_updated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('gym_inquiries', 'stage_updated_at')
    op.drop_column('gym_inquiries', 'next_action')
    op.drop_column('gym_inquiries', 'stage')
