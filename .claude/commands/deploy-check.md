Run pre-deployment checks to verify the codebase is ready for production.

1. **Backend tests**:
   ```
   cd backend && python -m pytest tests/ -v
   ```

2. **Frontend type check (SquatSense)**:
   ```
   cd squatsense-web && npx tsc --noEmit
   ```

3. **Frontend type check (FreeForm)** (if frontend/ exists and has dependencies):
   ```
   cd frontend && npx tsc --noEmit
   ```

4. **Check for common issues**:
   - Search for `TODO` or `FIXME` in changed files
   - Verify no `.env` files or secrets are staged: `git diff --cached --name-only | grep -E '\.env'`
   - Check for debug/print statements in Python: search for bare `print(` in backend/

5. **Report summary**:
   - Tests: X passed, Y failed
   - Type check: clean or N errors
   - Issues found: list any problems
   - **DEPLOY READY** or **BLOCKED** with reasons
