---
description: Report a bug → issue in the backlog (goes first), then start the runner
argument-hint: "what's wrong, where"
---
First follow "One backlog, no duplicates" in CLAUDE.md (check open AND closed issues; comment instead of duplicating; Blocked by for overlaps).
Triage (#29): run the mattpocock-skills:triage steps on every new issue: labels per docs/agents/triage-labels.md, a P-level (P0-P3), the Acceptance list, one lane label, `Blocked by: #n` lines.
Create a GitHub issue in igalgerman/oren_study for this bug: $ARGUMENTS
- Title: short. Body: what happens, where (screen), expected, and an `## Acceptance` section (3-7 checkable points + the tests that prove them, and `Out of scope`; the runner refuses an issue without it, #186). Labels: `bug`, `ready-for-agent`, and a lane (`core` if it's in index.html/talents.js/reading.js core, else `pack`).
- Then start the runner for it: `tools/runner/run.cmd <number>` (from C:\work\Oren_study\a).
Answer the owner in one line: issue number + "running in window issue-<n>".
