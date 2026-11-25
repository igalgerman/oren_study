---
description: Report a bug → issue in the backlog (goes first), then start the runner
argument-hint: "what's wrong, where"
---
First follow "One backlog, no duplicates" in CLAUDE.md (check open AND closed issues; comment instead of duplicating; Blocked by for overlaps).
Create a GitHub issue in igalgerman/oren_study for this bug: $ARGUMENTS
- Title: short. Body: what happens, where (screen), expected. Labels: `bug`, `ready-for-agent`, and a lane (`core` if it's in index.html/talents.js/reading.js core, else `pack`).
- Then start the runner for it: `tools/runner/run.cmd <number>` (from C:\work\Oren_study\a).
Answer the owner in one line: issue number + "running in window issue-<n>".
