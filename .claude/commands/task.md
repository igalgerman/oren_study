---
description: A clear task → issue in the backlog, then start the runner
argument-hint: "the task"
---
First follow "One backlog, no duplicates" in CLAUDE.md (check open AND closed issues; comment instead of duplicating; Blocked by for overlaps).
Triage (#29): run the mattpocock-skills:triage steps on every new issue: labels per docs/agents/triage-labels.md, a P-level (P0-P3), the Acceptance list, one lane label, `Blocked by: #n` lines.
If the task is fuzzy (you'd need to ask more than one question), say so and suggest `/idea` instead.
Otherwise create a GitHub issue in igalgerman/oren_study: $ARGUMENTS
- Body: the task + an `## Acceptance` section (3-7 checkable points + the tests that prove them, and `Out of scope`; the runner refuses an issue without it, #186).
- Labels: `ready-for-agent` + one lane (`core` / `pack` / `review`, see FLOW.md). Tier (#437, docs/agents/triage-labels.md): tier-1 (no label) = fixes / blockers; `tier-2` = new features and improvements; `tier-3` = nice-to-have, polish; unsure -> `tier-2`. Add `Blocked by: #n` if it depends on an open issue.
- Start the runner: `tools/runner/run.cmd` (one pass over the ready queue).
Answer the owner in one line: issue number + the tier with a one-line reason + what's running now.
