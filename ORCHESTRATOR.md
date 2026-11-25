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
1. `/go` (= `tools/runner/run.cmd`): starts #2 (pack, content fixes) and #3 (core, batch B). This is the runner's FIRST real run:
   watch it (`hc read run-2`, `hc read issue-2`), fix the runner if it breaks, one line per issue to the owner.
2. Keep the queue moving: #4 → #5 → #6 → #7 → #8; #9 after #7. #11 needs grilling with the owner (`/idea`).
