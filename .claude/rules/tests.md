---
paths: ["backend/tests/**/*.py", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"]
---

# Test Rules

## Backend Tests (pytest + pytest-asyncio)

### Setup
- `asyncio_mode = auto` in `pytest.ini` — all async tests run automatically
- In-memory SQLite (`sqlite+aiosqlite:///:memory:`) for test DB — NOT production Postgres
- `conftest.py` patches `JWT_SECRET_KEY` before app imports
- SQLite compatibility: JSONB → TEXT compiler hook registered in conftest

### Fixtures
- `db` — direct async database session for setup/assertions
- `client` — `httpx.AsyncClient` with `ASGITransport`, dependency overrides
- Factory fixtures return async callables (e.g., `create_player`)
- Autouse fixtures for DB setup/teardown and state clearing

### Patterns
- Test functions: `async def test_description(client, db):`
- Use `client.post("/api/v1/...", json={...})` for API tests
- Assert response status codes and JSON body content
- Dependency overrides: `app.dependency_overrides[get_db] = _override_get_db`

### Running
```bash
cd backend && python -m pytest tests/ -v
python -m pytest tests/test_specific.py -v  # single file
python -m pytest tests/test_specific.py::test_name -v  # single test
```

## Frontend Tests
- Currently minimal — add tests with Vitest if needed
- Type checking serves as a test gate: `npx tsc --noEmit`
