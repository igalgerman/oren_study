---
description: New idea → open the intake window (grill-me, then to-tickets into the backlog)
argument-hint: "the idea in a few words"
---
First follow "One backlog, no duplicates" in CLAUDE.md (check open AND closed issues; comment instead of duplicating; Blocked by for overlaps).
Triage (#29): run the mattpocock-skills:triage steps on every new issue: labels per docs/agents/triage-labels.md, a P-level (P0-P3), the Acceptance list, one lane label, `Blocked by: #n` lines.
Open a herdr window where the owner talks the idea through, so it stays out of this context:
`"C:\Users\97254\AppData\Local\Programs\herdr-core\hc.exe" run --bg --name intake-$(date +%H%M) --cwd C:\work\Oren_study\a claude "/grill-me $ARGUMENTS. When it's clear, run /to-tickets into igalgerman/oren_study with a lane label (core/pack/review), a tier (tier-1 no label = fixes/blockers, tier-2 = new features and improvements, tier-3 = nice-to-have and polish, unsure = tier-2; say the tier and a one-line reason for each issue), an '## Acceptance' section (3-7 checkable points + tests, and 'Out of scope'), ready-for-agent, and 'Blocked by: #n' lines."`
A plan with several steps -> follow docs/agents/skills/to-tickets.md (small end-to-end tickets, Blocked by only for real dependencies, each with an Acceptance list).
Every new issue is written the way docs/agents/skills/writing-for-agents.md says.
Tell the owner in one line: the window name, and that issues appear in the backlog when it's done.

Questions to the owner: in Hebrew, through tools/ask/ask.py (browser page), one round at a time; never ask in the terminal when the owner prefers Hebrew.
