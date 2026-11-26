# Work flow (automatic; rules for every Claude session)

Repo: **igalgerman/oren_study**, branch **`main`** = what is live on the site. The old repo igalgerman/a (`old` remote) is history only — never push there.
Backlog = GitHub issues. Owner guide: `HOWTO.md`. Main session: `ORCHESTRATOR.md`.

## The flow
idea → `/grill-me` → `/to-tickets` → issue (backlog) → runner → worker → reviewer → merge to main → all tests → deploy → issue closed.
Everything after the issue is automatic (`tools/runner`). Up to 3 issues at once, at most TWO `core` issues. If merging into main conflicts, the runner has the worker merge main in and retries (2 rounds, then the issue is parked).

Hand work by the orchestrator/inspector carries the label `manual`, never `in-progress` and no `core` on tooling: the runner ignores `manual` (no lane, never started) (#177).

Priority: label `P0` (urgent) / `P1` / `P2` (normal, default) / `P3` (low) orders the queue: bugs first, then P0→P3, then oldest.

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
On PASS (config `ci_merge = true`, #74): the runner waits for the PR's CI checks (`gh pr checks`) and runs `gh pr merge --squash` (only then takes the integrate lock). It merges main into the lane only when GitHub reports the PR as CONFLICTING (worker resolves) (#166). A red check is rerun once (flaky); still red -> the worker fixes it (same FIX loop). No full local suite. Then ONE build + deploy of main (PRs merged back to back share one deploy; pregen only if `pregen = true`), closes the issue and the windows, and starts the next ready issues. `ci_merge = false` or no PR: the old `tools/integrate.sh` (local merge + all tests). On any failure: nothing goes live, the issue gets `blocked` + `needs-orchestrator` with the reason; the orchestrator handles it (the owner only sees `ready-for-human` / `needs-triage`).

## Lanes
| label | what | parallel |
|---|---|---|
| `core` | touches talents.js / index.html core / reading.js / build_talents.py / wire.js / tests/run.sh | max 2 at a time (`max_core`) |
| `pack` | only inside one pack file + its own test | yes |
| `review` | read-only check, report as an issue comment | yes |

Line endings: `.gitattributes` forces LF (`* text=auto eol=lf`). Workers write files with LF (Python: `open(p, "w", newline="\n")`); when merging main into a lane use `git merge -X renormalize origin/main`.

Known: `worker` suite fails only on Windows (ESM c:\ path); `reading`/`activities`/`time-missions` can be flaky under load — rerun alone once.

## Observer
Every `observer_minutes` the watchdog runs `tools/runner/observer.py` (deterministic rules, no LLM): make_ready (needs-orchestrator/P0 untouched 30+ min while the orchestrator is idle), rerun (in-progress with no live run window for 10+ min), fix Blocked-by lines. Max 5 actions per run, each commented on the issue; never on ready-for-human, on an issue with an open lane/<n> PR, or while integrate.lock is alive. Result in `tools/runner/.runs/observer.last`; `observer_minutes = 0` stops it.

Questions to the owner: in Hebrew, through tools/ask/ask.py (browser page), one round at a time; never ask in the terminal when the owner prefers Hebrew.

## CI (GitHub Actions, #73)
`.github/workflows/tests.yml` runs all suites on every PR to main and every push to main: 6 parallel shards (`SUITES_SHARD=i/6 tests/run.sh`, a failed suite is retried alone once) and one summary job `tests`. **A PR is mergeable when the `tests` check is green.** No secrets in CI; deploy stays local.
