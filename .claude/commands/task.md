---
description: A clear task → issue in the backlog, then start the runner
argument-hint: "the task"
---
First follow "One backlog, no duplicates" in CLAUDE.md (check open AND closed issues; comment instead of duplicating; Blocked by for overlaps).
If the task is fuzzy (you'd need to ask more than one question), say so and suggest `/idea` instead.
Otherwise create a GitHub issue in igalgerman/oren_study: $ARGUMENTS
- Body: the task + an `## Acceptance` section (3-7 checkable points + the tests that prove them, and `Out of scope`; the runner refuses an issue without it, #186).
- Labels: `ready-for-agent` + one lane (`core` / `pack` / `review`, see FLOW.md). Add `Blocked by: #n` if it depends on an open issue.
- Start the runner: `tools/runner/run.cmd` (one pass over the ready queue).
Answer the owner in one line: issue number + what's running now.
