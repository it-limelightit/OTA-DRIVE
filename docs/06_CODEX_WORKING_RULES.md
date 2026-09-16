# Codex CLI Working Rules

This file is specifically for Codex CLI or another coding agent operating inside the existing repository.

# Mandatory First Action

Before editing code:

1. Read all project Markdown instruction files.
2. Inspect repository structure.
3. Inspect Git status.
4. Identify current stack.
5. Identify current working features.
6. Run available build/test/lint commands.
7. Produce a short current-state assessment.

Do not begin by generating a replacement architecture.

# Project Is Partially Complete

Assume:

```text
some features are already working
some features are incomplete
some code may be experimental
documentation may not exactly match implementation
```

Treat code, migrations and tests as evidence.

# Decision Hierarchy

```text
1. Explicit user instruction
2. Existing working behavior
3. Project documentation
4. Existing code conventions
5. Best engineering judgment
```

If docs conflict with a clearly working and better approach, report it and preserve the better approach.

# Change Strategy

Prefer:

```text
small patch
-> test
-> next patch
```

over:

```text
large rewrite
-> hope
```

# Before Editing a File

Understand:
- who imports it.
- what calls it.
- whether tests cover it.
- whether generated.
- whether it contains user edits.

# Database Rule

Before schema changes:
- inspect migrations.
- inspect ORM schema.
- inspect DB access patterns.
- create migration.
- update types/models.
- update tests.

# API Rule

Before adding endpoint:
- inspect route conventions.
- auth middleware.
- validation library.
- error format.
- service pattern.

# Frontend Rule

Before UI work:
- inspect components.
- theme.
- routing.
- API client.
- state management.
- table components.
- modal patterns.

Reuse these.

# MQTT Rule

Before modifying MQTT:
- inspect topics.
- subscription patterns.
- reconnect strategy.
- QoS.
- retained behavior.
- payload schema.
- authentication.

Do not break deployed-device compatibility.

# OTA Rule

OTA is not only:

```text
download file
-> reboot
```

Required lifecycle:

```text
eligibility
-> command
-> precheck
-> download
-> verification
-> install
-> reboot
-> post-boot validation
-> success/rollback reporting
```

# Refactoring Rule

Refactor only when:
- blocks implementation.
- causes correctness problems.
- causes major duplication.
- creates security risk.
- makes testing impossible.
- user explicitly requests.

# Dependency Rule

Before adding a package:
1. Check existing functionality.
2. Check standard library.
3. Check current dependencies.
4. Add only if justified.

# Git Safety

Do not run:

```text
git reset --hard
git clean -fd
git checkout -- .
git restore .
force push
rebase shared history
```

unless explicitly instructed.

# Testing Rule

After meaningful implementation run relevant:
```text
lint
typecheck
unit tests
integration tests
build
```

If failure occurs:
- determine whether pre-existing.
- report exact failure.
- fix if related or clearly safe.

# Completion Rule

A feature is not complete until:

```text
code exists
+ integration is wired
+ build/tests checked
+ failure paths considered
+ manual validation steps exist
```

# Output Style

At the end:

## Found
What existed before.

## Implemented
What changed.

## Files Changed
Exact files.

## Database
Migration/schema changes.

## Configuration
New env vars.

## Validation
Commands and results.

## Risks
Anything not fully verified.

## Next
One recommended next step.

# No Hallucination Rule

Do not claim:
- API exists unless inspected.
- table exists unless inspected.
- tests pass unless run.
- device code works on hardware unless tested.
- production safety unless failure paths validated.
