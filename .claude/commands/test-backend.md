Run backend tests. Pass an optional file or test name pattern as $ARGUMENTS.

If no arguments provided, run all tests:
```
cd backend && python -m pytest tests/ -v
```

If a specific file or pattern is provided:
```
cd backend && python -m pytest $ARGUMENTS -v
```

After tests complete, report: total passed, failed, and any error summaries.
