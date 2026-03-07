---
description: TDD reminder
---

# Testing — Red/Green TDD

Sequence: RED (write failing test first) -> GREEN (minimum code to pass) -> REFACTOR.
Never skip the red phase. Run the full area test suite before committing.

Load the `tdd` skill when:
- Writing new tests or modifying existing ones
- Implementing a new feature or bug fix (need the RED phase first)
- Unsure about test structure, naming conventions, or which test runner to use
- Setting up mocks or deciding what to test

Skip the `tdd` skill when:
- Only reading or explaining code (no changes being made)
- Running tests to check current state (not writing new ones)
- Working on non-code files (config, docs, infra)
