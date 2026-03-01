"""Initial schema: users, sessions, sets, reps, refresh_tokens.

Revision ID: 001
Revises: None
Create Date: 2026-02-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("password_hash", sa.Text, nullable=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("avatar_url", sa.Text, nullable=True),
        sa.Column("experience_level", sa.String(20), nullable=True),
        sa.Column("goal", sa.String(20), nullable=True),
        sa.Column("injury_history", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("training_max", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("baseline_metrics", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("onboarding_completed", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("auth_provider", sa.String(20), nullable=False, server_default="email"),
        sa.Column("auth_provider_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # --- sessions ---
    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exercise_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("total_reps", sa.Integer, nullable=True),
        sa.Column("total_sets", sa.Integer, nullable=True),
        sa.Column("avg_form_score", sa.Float, nullable=True),
        sa.Column("fatigue_index", sa.Float, nullable=True),
        sa.Column("fatigue_risk", sa.String(20), nullable=True),
        sa.Column("strongest_set_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("weakest_set_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("load_used", sa.Float, nullable=True),
        sa.Column("load_recommendation", sa.Float, nullable=True),
        sa.Column("ai_coaching", sa.Text, nullable=True),
        sa.Column("source", sa.String(20), nullable=False, server_default="live"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])

    # --- sets ---
    op.create_table(
        "sets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("set_number", sa.Integer, nullable=False),
        sa.Column("target_reps", sa.Integer, nullable=True),
        sa.Column("actual_reps", sa.Integer, nullable=True),
        sa.Column("avg_form_score", sa.Float, nullable=True),
        sa.Column("fatigue_index", sa.Float, nullable=True),
        sa.Column("fatigue_risk", sa.String(20), nullable=True),
        sa.Column("depth_ok", sa.Boolean, nullable=True),
        sa.Column("stability_ok", sa.Boolean, nullable=True),
        sa.Column("tempo_ok", sa.Boolean, nullable=True),
        sa.Column("overall_ok", sa.Boolean, nullable=True),
        sa.Column("load_used", sa.Float, nullable=True),
        sa.Column("rest_duration_sec", sa.Float, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_sets_session_id", "sets", ["session_id"])

    # --- reps ---
    op.create_table(
        "reps",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("set_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rep_number", sa.Integer, nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("composite_score", sa.Float, nullable=True),
        sa.Column("depth_score", sa.Float, nullable=True),
        sa.Column("stability_score", sa.Float, nullable=True),
        sa.Column("symmetry_score", sa.Float, nullable=True),
        sa.Column("tempo_score", sa.Float, nullable=True),
        sa.Column("rom_score", sa.Float, nullable=True),
        sa.Column("primary_angle_deg", sa.Float, nullable=True),
        sa.Column("secondary_angle_deg", sa.Float, nullable=True),
        sa.Column("trunk_angle_deg", sa.Float, nullable=True),
        sa.Column("ankle_angle_deg", sa.Float, nullable=True),
        sa.Column("com_offset_norm", sa.Float, nullable=True),
        sa.Column("speed_proxy", sa.Float, nullable=True),
        sa.Column("depth_ok", sa.Boolean, nullable=True),
        sa.Column("form_ok", sa.Boolean, nullable=True),
        sa.Column("balance_ok", sa.Boolean, nullable=True),
        sa.Column("trunk_ok", sa.Boolean, nullable=True),
        sa.Column("joint_angles", postgresql.JSONB, nullable=True),
        sa.Column("flags", postgresql.JSONB, nullable=True),
        sa.Column("risk_markers", postgresql.JSONB, nullable=True),
        sa.Column("pose_confidence", sa.Float, nullable=True),
        sa.Column("needs_review", sa.Boolean, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_reps_set_id", "reps", ["set_id"])
    op.create_index("ix_reps_session_id", "reps", ["session_id"])

    # --- refresh_tokens ---
    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_table("refresh_tokens")
    op.drop_table("reps")
    op.drop_table("sets")
    op.drop_table("sessions")
    op.drop_table("users")
