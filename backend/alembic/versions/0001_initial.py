"""Initial migration

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-28 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="member"),
        sa.Column("team", sa.String(length=100), nullable=False, server_default="platform"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="todo"),
        sa.Column(
            "priority", sa.String(length=32), nullable=False, server_default="medium"
        ),
        sa.Column("assignee", sa.String(length=100), nullable=False, server_default="unassigned"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
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
        sa.CheckConstraint(
            "status IN ('todo', 'in_progress', 'done', 'blocked')",
            name="ck_tasks_status",
        ),
        sa.CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'critical')",
            name="ck_tasks_priority",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tasks")),
    )
    op.create_index(op.f("ix_tasks_status_created_at"), "tasks", ["status", "created_at"])
    op.create_index(op.f("ix_tasks_priority"), "tasks", ["priority"])
    op.create_index(op.f("ix_tasks_assignee"), "tasks", ["assignee"])
    op.create_index(op.f("ix_tasks_created_by"), "tasks", ["created_by"])
    op.create_index(op.f("ix_tasks_due_date"), "tasks", ["due_date"])
    op.create_foreign_key(
        op.f("fk_tasks_created_by_users"),
        "tasks",
        "users",
        ["created_by"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "activity",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_activity")),
    )
    op.create_index(op.f("ix_activity_created"), "activity", ["created_at"])
    op.create_index(op.f("ix_activity_task_id"), "activity", ["task_id"])
    op.create_index(op.f("ix_activity_actor_id"), "activity", ["actor_id"])
    op.create_foreign_key(
        op.f("fk_activity_task_id_tasks"),
        "activity",
        "tasks",
        ["task_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_activity_actor_id_users"),
        "activity",
        "users",
        ["actor_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_table("activity")
    op.drop_table("tasks")
    op.drop_table("users")
