Review recent code changes for quality, correctness, and adherence to project conventions.

If $ARGUMENTS is provided, review that specific file or path. Otherwise, review all uncommitted changes.

1. Get the diff:
   - If no arguments: `git diff` for unstaged, `git diff --cached` for staged
   - If file/path provided: `git diff $ARGUMENTS`

2. For each changed file, check:
   - Follows the conventions in CLAUDE.md and .claude/rules/
   - No security issues (SQL injection, hardcoded secrets, missing auth checks)
   - No f-strings in logger calls (use %s formatting)
   - SQLAlchemy uses select() not legacy .query()
   - Async patterns are correct (no blocking calls in async functions)
   - Pydantic schemas have Field descriptions and constraints
   - No cross-product references between SquatSense and FreeForm

3. Report findings grouped by severity:
   - **Critical**: Security issues, data loss risks, broken auth
   - **Warning**: Convention violations, missing validation, performance concerns
   - **Info**: Style suggestions, minor improvements

Keep the review concise and actionable. Do not suggest changes to code that was not modified.
