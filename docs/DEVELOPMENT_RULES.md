# DEVELOPMENT RULES

## General Principles
Prefer:
- simple solutions
- explicit behavior
- modular architecture
- deterministic logic
- maintainable code

Avoid:
- unnecessary abstraction
- premature optimization
- large unrelated refactoring
- hidden side effects

## Naming
Variables: camelCase
Classes: PascalCase
Constants: UPPER_SNAKE_CASE
Files: Follow framework convention.

## Error Handling
All important operations must:
- detect failure
- provide meaningful errors
- log useful diagnostic information
- avoid silent failure

## Logging
Recommended levels:
DEBUG
INFO
WARNING
ERROR
CRITICAL

Never log secrets.

## Configuration
Runtime configuration must use environment variables.

Example:
DATABASE_URL=
API_URL=
LOG_LEVEL=

Do not hardcode environment-specific configuration.

## Testing
Required test categories:
- Unit Tests
- Integration Tests
- Regression Tests when bugs are fixed

Bug fixes should preferably include a test that would fail before the fix.

## Dependencies
Before introducing a dependency evaluate:
- necessity
- maintenance status
- security
- license
- complexity

Avoid dependencies for trivial functionality.

## Git
Branches:
- main
- develop
- feature/*
- fix/*

Recommended commits:
- feat:
- fix:
- docs:
- test:
- refactor:
- chore:
