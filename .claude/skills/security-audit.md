---
context: fork
allowed-tools: ["Read", "Glob", "Grep"]
argument-hint: "Scope to audit (e.g., 'auth', 'league', 'all routers')"
---

Run a security audit on the specified scope. This runs in isolated context.

Scope: $ARGUMENTS

Check for:

1. **Authentication & Authorization**
   - Routes missing auth dependencies (get_current_user_id / get_league_player_id)
   - Cross-auth-system leaks (FreeForm auth used in league routes or vice versa)
   - JWT token handling issues

2. **Input Validation**
   - Missing Pydantic field constraints (unbounded strings, missing ge/le)
   - SQL injection vectors (raw string interpolation in queries)
   - Path traversal in file upload handlers

3. **Data Exposure**
   - Response schemas returning sensitive fields (password_hash, tokens)
   - Error messages leaking internal details
   - CORS misconfiguration

4. **Rate Limiting**
   - Sensitive endpoints without rate limits (auth, password reset, email verification)

5. **Secrets**
   - Hardcoded secrets, API keys, or tokens in source code
   - Debug/development defaults left in production paths

Report findings by severity: Critical > High > Medium > Low.
