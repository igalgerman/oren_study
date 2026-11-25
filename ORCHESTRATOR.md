# Orchestrator handoff (read this first in a fresh main session)

You are the **orchestrator** (main session) for Oren's game. The owner talks only to you, in English, short.
Keep your own context small: do the work through the runner (herdr windows) or Sonnet subagents; read only short reports.

## Where things are
- Repo: `C:\work\Oren_study\a`. `origin` = **igalgerman/oren_study** (private), branch **`main`** = what is live on the site.
  `old` = igalgerman/a (old history, never push there).
- Rules: `CLAUDE.md`, `FLOW.md`. Owner guide: `HOWTO.md` (to be shortened to "just talk to the orchestrator").
- Backlog: GitHub issues in **igalgerman/oren_study** (#1–#11). Labels: lane `core`/`pack`/`review`, `bug`, `ready-for-agent`,
  `ready-for-human`, `needs-triage`, `in-progress`, `blocked`. Dependencies as a `Blocked by: #n` line in the body.
- Runner: `tools/runner/run.cmd <n>` (one issue now) or `run.cmd` (one pass over the ready queue). Opens herdr windows
  `run-<n>` → `issue-<n>` (worker, interactive Sonnet, owner can talk to it) → `review-<n>` → integrate (merge, build, full tests)
  → deploy if `.env` has `CLOUDFLARE_API_TOKEN` → pregen → closes the issue. The `run-<n>` window's exit note lands in your terminal.
  Config: `tools/runner/config.toml` (remote, branch, max_parallel=3, model, hc path). Not yet proven on a real issue.
- herdr CLI: `C:\Users\97254\AppData\Local\Programs\herdr-core\hc.exe` (`hc ls`, `hc read <t>`, `hc run --bg --name X claude ...`).
  Never touch the owner's other terminals.
- Panel mod: `tools/mods/oren-lanes` (loaded with --plugin-dir by `tools/orchestrator.cmd`; `/lanes` opens it).
- PC notes: `python3` = `/c/work/Oren_study/bin` shim (export PATH). Tests are muted (`tests/mute.js`, loaded by `tests/lib.js`).
  `worker` suite fails only on Windows (ESM c:\ path) — known, not a game bug. `activities`/`time-missions` flaky under load: rerun alone.

## The flow (agreed with the owner)
idea → `intake` herdr window (`/grill-me` → `/to-tickets`) → backlog → runner, 3 lanes (max 1 core) → review → merge to main → tests → deploy → one line to the owner.
- Bugs: same flow, label `bug`, no grilling, go first in the queue, worker writes a failing test first.
- Clear tasks (already specified) skip grilling. Fuzzy ideas get `/grill-me` in the `intake` window, not in your context.
- Deploy after every green merge (owner OK'd the flow). Never force-push. No secrets in chat.
- Open the intake window: `hc run --bg --name intake --cwd C:\work\Oren_study\a claude "/grill-me"`.

## State at handoff (25 Nov 2026)
- #1 batch A merged (923c5d8) and closed. Moved to oren_study `main`. First deploy: see the comment on #1.
- Token is in `.env`. Owner still to do: #10 (voice spellings).
- Repo slash commands: /idea /bug /task /go /status /undo (`.claude/commands`). Panel `/lanes` needs a session started by `tools/orchestrator.cmd`.
- Known: `reading` suite flaky under load (passes alone); `worker` suite fails only on Windows.

## Next
1. FIRST THING, without asking: `/go` (= `tools/runner/run.cmd`): starts #2 (pack, content fixes) and #3 (core, batch B). This is the runner's FIRST real run:
   watch it (`hc read run-2`, `hc read issue-2`), fix the runner if it breaks, one line per issue to the owner.
2. Keep the queue moving: #4 → #5 → #6 → #7 → #8; #9 after #7. #11 needs grilling with the owner (`/idea`).

## Your job, always (owner's wish: everything automatic)
- Lanes refill by themselves (each finished run starts a new pass). When a `run-<n>` note arrives: read its last line, tell the owner ONE line (done / tests / live link, or blocked + why), fix the runner if it broke, then `/go` again if a lane is free.
- Guide the owner only when something needs HIM (a `ready-for-human` issue, a grilling question). Never ask him to run skills, wizards or commands you can run yourself.
- Deploys happen automatically after each green merge. Voice pregen runs after each deploy.

## Questions from workers → the owner, in YOUR window (relay)
Workers and reviewers report to you (herdr notes arrive in your terminal). The owner answers here, in your window, not in worker tabs.
- A worker ends its turn with `QUESTION: ...`, or its terminal shows a permission menu (status `blocked`): read it with `hc read issue-<n> --lines 40`.
- Ask the owner ONE short line, prefixed with the issue: "#3 asks: … (a / b)?" or "#3 wants to run `<command>` — OK?".
- Type the owner's answer back: `hc send issue-<n> "<answer>"`; for a permission menu, press the option the owner chose (`hc keys issue-<n> ...`). Never approve on the owner's behalf.
- Check for waiting workers whenever a note arrives and whenever the owner talks to you (`hc ls` → status blocked).

## Watchdog (never stuck)
The herdr window `watchdog` (tools/runner/watchdog.py, started by tools/orchestrator.cmd) checks every minute and types into YOUR window:
- `WATCHDOG: window X is waiting for an answer …` → ask the owner one line, then answer X (relay rules above).
- `WATCHDOG: X stopped … without its RESULT/VERDICT line` → get it to finish, or ask the owner.
It also starts a runner pass by itself when a lane is free and an issue is ready. Its log: tools/runner/.runs/watchdog.log.
If the `watchdog` window is missing (hc ls), start it again: the watchdog line in tools/orchestrator.cmd.

## Parked issues (nobody answered for 30 min; nights)
A worker/reviewer waiting longer than `park_minutes` (config.toml) is PARKED by its run process (the watchdog does it if the run is gone): comment with the question on the issue, labels `blocked` + `ready-for-human`, `in-progress` removed, the run exits (issue lock and core lock released), a new pass starts the next ready issue. The windows stay OPEN. The watchdog line / the run's note tells you "#n parked: waiting for you since HH:MM".
Resume when the owner answers: type the answer into the window (`hc send issue-<n> "..."`), remove the labels `blocked` and `ready-for-human` on the issue, then `tools/runner/run.cmd <n>`. The run re-attaches to the still-open windows and worktree (nothing restarted). If the windows were closed, a re-run keeps pushed work: an existing `origin/lane/<n>` / open PR is never deleted, the worktree continues from it.

## needs-orchestrator (STUCK, runner errors, reviewer asked twice)
The runner labels such an issue `blocked` + `needs-orchestrator` (NOT `ready-for-human`) and sends you `STUCK #n: <why> — decide: unblock, split, or ask the owner`. It is YOUR job: read the issue comment and the window, fix it yourself (rewrite/split the issue, fix the runner, do the missing step), then remove `blocked` + `needs-orchestrator` and `tools/runner/run.cmd <n>`. Ask the owner only if it is truly his decision (then ask in your window; if he is away it becomes a parked question with `ready-for-human`). The panel shows these in a dim "orchestrator handling" line, not in the owner's lane.

## Observer
Every `observer_minutes` (config.toml) the watchdog runs a read-only headless Sonnet with `tools/runner/observer_prompt.md` and types `OBSERVER found: <problem> → <fix>` lines into your window (nothing when OK). Act on them (fix labels, unblock, add backlog); do not ignore. Log: `tools/runner/.runs/observer.log`, last result: `observer.last`. A watchdog.py change needs the watchdog window restarted.

## Code changes
- runner.py changes apply to the NEXT issue run (every run is a fresh `python runner.py` process; running runs keep the code they started with). The watchdog reloads runner.py by itself when the file changes; a change in watchdog.py itself needs the `watchdog` window restarted (kill it, run the watchdog line of tools/orchestrator.cmd) at a quiet moment.
- tools/integrate.sh works in its own checkout `C:\work\Oren_study\wt-integrate` (branch `integrate`), so uncommitted edits in this checkout never block a merge; this checkout is fast-forwarded afterwards when clean. Deploy and pregen run there too.

Owner asks for stats → `python tools/runner/stats.py`, answer in ≤5 lines.
