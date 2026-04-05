---
name: code-review
description: "Use when reviewing code changes, PRs, or completed stories. Two-stage review: spec compliance first, then code quality."
triggers: [review, pr, ревью, code review, pull request]
use_count: 0
---

# Code Review (Two-Stage)

Two-stage review ensures correctness before quality. No point polishing code that doesn't meet spec.

## Stage 1: Spec Compliance

Does the code do what was asked?

1. Read the original requirement (story, issue, PR description)
2. List every acceptance criterion
3. For each criterion: verify with evidence (test output, file content, behavior)
4. Mark: PASS / FAIL / PARTIAL

<HARD-GATE>
If ANY criterion is FAIL — stop. Do not proceed to Stage 2.
Report failures with specific evidence.
</HARD-GATE>

## Stage 2: Code Quality

Is the code well-written?

1. **Correctness** — edge cases, error handling, race conditions
2. **Simplicity** — could this be simpler without losing functionality?
3. **Naming** — do names reveal intent? Would a stranger understand?
4. **Tests** — do tests prove the code works, or just that it runs?
5. **Security** — secrets exposure, injection, access control

## Rationalization Resistance

| Мысль | Реальность |
|-------|-----------|
| "Код работает, значит всё ок" | Работает ≠ правильно. Проверь spec compliance. |
| "Мелочи, не буду придираться" | Мелочи накапливаются. Заметил — скажи. |
| "Автор знает лучше" | Автор мог пропустить. Свежий взгляд — ценность ревью. |

## Output Format

```
## Spec Compliance: PASS | FAIL
- [x] Criterion 1 — evidence
- [ ] Criterion 2 — what's missing

## Code Quality: score/10
- Issue 1 (severity: high|medium|low)
- Issue 2
```
