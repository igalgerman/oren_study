# Work flow (automatic; rules for every Claude session)

Repo: **igalgerman/oren_study**, branch **`main`** = what is live on the site. The old repo igalgerman/a (`old` remote) is history only — never push there.
Backlog = GitHub issues. Owner guide: `HOWTO.md`. Main session: `ORCHESTRATOR.md`.

## The flow
idea → `/grill-me` → `/to-tickets` → issue (backlog) → runner → worker → reviewer → merge to main → all tests → deploy → issue closed.
Everything after the issue is automatic (`tools/runner`). Up to 3 issues at once, at most TWO `core` issues. If merging into main conflicts, the runner has the worker merge main in and retries (2 rounds, then the issue is parked).

## If you are a WORKER (window `issue-<n>`, in worktree `wt-<n>`, branch `lane/<n>`)
Do the WHOLE job yourself, then report. Nobody merges for you by hand.
1. Read CLAUDE.md, this file, and the issue (`gh issue view <n> --repo igalgerman/oren_study --comments`). Do only that issue.
2. Implement (use the `mattpocock-skills:tdd` skill: test first; for a bug `mattpocock-skills:diagnosing-bugs`, then tdd). `export PATH=/c/work/Oren_study/bin:$PATH` (python3). In `oren2/`: `python3 build_talents.py`, then the suites you touched
   (muted: `NODE_OPTIONS="--require ./tests/mute.js" node tests/<suite>.test.js desktop|phone`). Core work: also `JOBS=3 tests/run.sh`.
3. Screenshots of every changed screen at phone 390x844 and desktop 1366x768 into `C:/work/Oren_study/shots/<n>/` (outside the repo: tests/run.sh wipes tests/.tmp); look at them (simple, one main action, Hebrew with nikud).
4. Commit your changes (NOT the built `oren2/index.html` / `oren2/cf/public/index.html`, node_modules, package*.json, tests/.tmp).
5. `git push -u origin lane/<n>`, then **open the PR**: `gh pr create --repo igalgerman/oren_study --base main --head lane/<n>` with `Closes #<n>` (write the body with the `mattpocock-skills:pr` skill), a short summary and the screenshot paths.
6. The very last line of your final message: `RESULT: DONE` (or `RESULT: STUCK <why>`). STUCK goes to the orchestrator (labels `blocked` + `needs-orchestrator`), not to the owner.
7. Need the owner? End your turn with `QUESTION: <short question, options>` — the orchestrator asks him and types the answer back. Unanswered for 30 min: the issue is parked (blocked + ready-for-human: a real owner question), your window stays open, the lane goes to the next issue.
Never push to main, never deploy, never force-push. Found another problem? Open a new issue (see "One backlog, no duplicates" in CLAUDE.md).

## If you are a REVIEWER (window `review-<n>`)
Read-only. Use the `mattpocock-skills:code-review` skill (Standards = CLAUDE.md + FLOW.md, Spec = the issue), then check the PR against the issue: correct, simple (one main action per screen), Hebrew nikud, facts, no unrelated changes. One PR comment; last line `VERDICT: PASS` or `VERDICT: FIX`.

## The runner does the rest
On PASS: `tools/integrate.sh` merges into main, rebuilds, runs ALL tests, pushes, deploys (token in `.env`), prepares voice, closes the issue, closes the windows, and starts the next ready issues. On any failure: nothing goes live, the issue gets `blocked` + `needs-orchestrator` with the reason; the orchestrator handles it (the owner only sees `ready-for-human` / `needs-triage`).

## Lanes
| label | what | parallel |
|---|---|---|
| `core` | touches talents.js / index.html core / reading.js / build_talents.py / wire.js / tests/run.sh | max 2 at a time (`max_core`) |
| `pack` | only inside one pack file + its own test | yes |
| `review` | read-only check, report as an issue comment | yes |

Known: `worker` suite fails only on Windows (ESM c:\ path); `reading`/`activities`/`time-missions` can be flaky under load — rerun alone once.

## Observer
Every `observer_minutes` the watchdog runs `tools/runner/observer.py`, an observer that ACTS within limits (make_ready, rerun, fix Blocked-by lines, nudge the orchestrator; max 5 per run, each commented on the issue). Result in `.runs/observer.last`; `observer_minutes = 0` stops it.
