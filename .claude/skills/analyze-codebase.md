---
context: fork
allowed-tools: ["Read", "Glob", "Grep", "Bash"]
argument-hint: "Area to analyze (e.g., 'backend auth', 'scoring pipeline', 'WebSocket flow')"
---

Perform a deep analysis of the specified area of the codebase. This runs in an isolated context so verbose output stays contained.

Analyze: $ARGUMENTS

1. Identify all relevant files using Glob and Grep
2. Read each file and trace the data flow end-to-end
3. Document:
   - Entry points (routes, WebSocket handlers, exports)
   - Key functions and their responsibilities
   - Data models involved
   - External dependencies (APIs, DB, services)
   - Error handling patterns
   - Potential issues or improvements

Return a structured summary that can inform implementation decisions.
