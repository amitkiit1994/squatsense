---
paths: ["backend/schemas/**/*.py"]
---

# Pydantic Schema Rules

## Naming
- Request DTOs: `*Create` or `*Request` suffix (e.g., `SessionCreate`, `CreateTeamRequest`)
- Response DTOs: `*Response` suffix (e.g., `SessionResponse`, `TeamResponse`)
- List item types: `*ListItem` (e.g., `SessionListItem`)
- Query/filter types: descriptive names (e.g., `LeaderboardEntry`)

## Field Definitions
- Always use `Field()` with `description=` for API documentation
- Numeric constraints: `ge=`, `le=`, `gt=`, `lt=` (e.g., `Field(ge=0.0, le=100.0)`)
- Optional fields: `Optional[T] = Field(default=None, description="...")`
- UUIDs: use `uuid.UUID` type, not strings
- Datetimes: use `datetime` from stdlib

## Validation
- Scores are always 0-100 float range
- Angles in degrees
- Set/rep numbers are 1-based: `Field(ge=1)`
- Exercise types match the registry: squat, deadlift, bench_press, overhead_press, lunge, pullup, row, pushup

## Patterns
- All schemas inherit from `BaseModel`
- No ORM mode / `from_attributes` unless explicitly needed for direct model mapping
- Keep schemas flat — avoid deep nesting unless the API response genuinely requires it
- Separate request and response schemas even if they look similar — they evolve independently
