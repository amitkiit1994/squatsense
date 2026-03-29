Run TypeScript type checking on frontend projects. Pass `squatsense` or `freeform` as $ARGUMENTS, or omit to check both.

For SquatSense:
```
cd squatsense-web && npx tsc --noEmit
```

For FreeForm:
```
cd frontend && npx tsc --noEmit
```

Report any type errors found with file paths and line numbers.
