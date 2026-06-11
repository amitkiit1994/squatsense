"""add users.email_verified and email_otps table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-11 00:00:00.000000

MIGRATION NOTE
--------------
This migration runs automatically in production: the Dockerfile CMD executes
``alembic upgrade head`` before gunicorn starts. ``init_db()``'s
``create_all`` only creates MISSING tables, so it will create ``email_otps``
on fresh databases but will NOT add the ``email_verified`` column to the
existing ``users`` table — this migration (or the manual ALTER below) is
required for existing databases.

Manual equivalent (PostgreSQL), if applying outside Alembic:

    ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

The column is intentionally nullable with a server default of false so it is
purely additive: no backfill, no lock-heavy rewrite, existing rows are
unaffected.

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('email_verified', sa.Boolean(), server_default='false', nullable=True),
    )
    op.create_table(
        'email_otps',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('code_hash', sa.String(length=64), nullable=False),
        sa.Column('purpose', sa.String(length=20), server_default='verify', nullable=False),
        sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_email_otps_email', 'email_otps', ['email'])


def downgrade() -> None:
    op.drop_index('ix_email_otps_email', table_name='email_otps')
    op.drop_table('email_otps')
    op.drop_column('users', 'email_verified')
