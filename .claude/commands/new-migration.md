Create a new Alembic database migration. Pass the migration description as $ARGUMENTS.

1. Run: `alembic revision --autogenerate -m "$ARGUMENTS"`
2. Read the generated migration file
3. Review it for correctness — check that:
   - PostgreSQL-specific types (UUID, JSONB) are imported properly
   - Index changes are captured
   - Column types match the model definitions
4. Report the migration file path and a summary of changes
