---
name: debugging
description: "Use when debugging failures, errors, or unexpected behavior. 4-phase systematic approach with 3-failure circuit breaker."
triggers: [debug, error, bug, fix, broken, failing]
use_count: 0
---

# Systematic Debugging

4-phase approach. Never guess — investigate.

## Phase 1: Reproduce

1. Get the exact error message / unexpected behavior
2. Find the minimal reproduction steps
3. Confirm: can you trigger it reliably?

## Phase 2: Investigate Root Cause

1. Read the error — what does it actually say?
2. Trace backwards from the error to the source
3. Check assumptions — what do you think is true that might not be?
4. Form a hypothesis: "The problem is X because Y"

## Phase 3: Fix

1. Write a test that reproduces the bug (RED)
2. Apply the minimal fix
3. Verify the test passes (GREEN)
4. Check for regressions

## Phase 4: Verify

1. Run the full test suite
2. Manual check if applicable
3. Document what went wrong in corrections.md

## 3-Failure Circuit Breaker

<HARD-GATE>
If 3+ fix attempts have failed on the same issue — STOP.
The problem is not what you think it is.
Step back and question the architecture, not the implementation.
</HARD-GATE>

## Rationalization Resistance

| Agent thought | Reality |
|--------------|---------|
| "Let me try the same thing again" | 3 failures = wrong hypothesis. Change approach. |
| "Probably a library bug" | Most likely your code. Check yours first. |
| "I know what it is, no need to reproduce" | Without reproduction you don't know. You assume. |
