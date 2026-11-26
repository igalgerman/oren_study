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
  `run-<n>` → `issue-<n>` (worker, interactive Sonnet, owner can talk to it) → `review-<n>` → integrate (wait for green CI, squash-merge, ONE build + deploy; #74)
  → deploy if `.env` has `CLOUDFLARE_API_TOKEN` → pregen → closes the issue. The `run-<n>` window's exit note lands in your terminal.
  Config: `tools/runner/config.toml` (remote, branch, local_lanes=1 + remote_lanes=4, model, hc path). Not yet proven on a real issue.
- herdr CLI: `C:\Users\97254\AppData\Local\Programs\herdr-core\hc.exe` (`hc ls`, `hc read <t>`, `hc run --bg --name X claude ...`).
  Never touch the owner's other terminals.
- Panel mod: `tools/mods/oren-lanes` (loaded with --plugin-dir by `tools/orchestrator.cmd`; `/lanes` opens it).
- PC notes: `python3` = `/c/work/Oren_study/bin` shim (export PATH). Tests are muted (`tests/mute.js`, loaded by `tests/lib.js`).
  `worker` suite fails only on Windows (ESM c:\ path) — known, not a game bug. `activities`/`time-missions` flaky under load: rerun alone.

## The flow (agreed with the owner)
idea → `intake` herdr window (`/grill-me` → `/to-tickets`) → backlog → runner, 3 lanes (max 2 core; merge conflicts are resolved by the worker automatically, 2 rounds, then parked) → review → merge to main → tests → deploy → one line to the owner.
- Bugs: same flow, label `bug`, no grilling, go first in the queue, worker writes a failing test first.
- Clear tasks (already specified) skip grilling. Fuzzy ideas get `/grill-me` in the `intake` window, not in your context.
- Deploy after every green merge (owner OK'd the flow). Never force-push. No secrets in chat.
- Owner writes `approve #n` or `express #n`: add the label `express` to that issue at once (`gh issue edit n --repo igalgerman/oren_study --add-label express`) and answer in one line. Express issues get their own extra lane (`express_lanes` in config.toml), start first, and may exceed max_core (#72).
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

## Phone (Remote Control) and push notifications (owner, 26 Nov)
- tools/orchestrator.cmd starts you with `--remote-control "oren-orchestrator"`: the owner can see and answer you from his phone.
- Use the PushNotification tool ONLY when the owner must act: a review PURPLE question, a P0 problem (main red, deploy failed, live site or family saves broken), the PC restart test (#141), or a decision only he can make. One line, under 200 characters, what to do first. Never for routine progress.
- Code Mode does not work with Remote Control: you run without it; workers of every 3rd issue run with it (trial, config code_mode_every).

## Owner decisions, 26 Nov 2026 (after the flow analysis)
- Order: first the flow fixes (#62 line endings, #149 review severity, #166 merge on green, #177 hand-work label, #153 chains), then remote lanes (#134-#137 carry Blocked-by lines).
- Freeze on NEW tool features (runner, watchdog, panel, dashboard, remote, freeze/recover) until #152 (CI runs the tool tests) is merged. Bug fixes to the system and all game work continue. After #152: tooling gets at most 1 lane, the game at least 2.
- Your own hand work never carries `in-progress` (the runner counts it as a lane) and tooling never gets `core`. Label hand work `manual` (the runner ignores it: no lane, never started) and link the PR.
- Do not split work into many tiny issues: a problem you find while working goes into the existing issue as a comment unless it is a separate real defect.

## Your job, always (owner's wish: everything automatic)
- Lanes refill by themselves (each finished run starts a new pass). When a `run-<n>` note arrives: read its last line, tell the owner ONE line (done / tests / live link, or blocked + why), fix the runner if it broke, then `/go` again if a lane is free.
- Guide the owner only when something needs HIM (a `ready-for-human` issue, a grilling question). Never ask him to run skills, wizards or commands you can run yourself.
- Deploys happen automatically after each green merge. Voice pregen runs after each deploy.
- Owner says "stats" / "status" / "how many issues": run `python3 tools/runner/dashboard.py --text` and paste its lines (#142). He can also double-click `tools\dashboard.cmd` for the page.

## Owner questions: ONE place (#193)
- Every question for the owner lives in the pinned, owner-assigned GitHub issue **'Questions for the owner'** (GitHub mobile notifies him). The watchdog posts each waiting window's question there by itself (issue link, question, options); `remote.py status <n>` posts a remote QUESTION comment.
- Write every owner question (#205) the way docs/agents/skills/to-questionnaire.md says: clear options, a recommendation, Hebrew for decisions.
- Your own question (or one from a reviewer PURPLE point / grill): `python tools/runner/owner_q.py ask <#n|window> "<question in Hebrew, options>"`.
- For each NEW question (watchdog line `NEW OWNER QUESTION`): send a PushNotification with the question text (#189). Never write 'waiting for you in window X' without the question text.
- He answers in that issue (the watchdog types `OWNER ANSWERED ...` into your window) or here. Relay the answer to the window / issue, then `python tools/runner/owner_q.py answered <key> "<answer>"`. Open list: `owner_q.py open` (also in the dashboard 'Needs you').

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

## Observer (acting, within limits)
Every `observer_minutes` (config.toml, default 10) the watchdog runs `tools/runner/observer.py`, python rules only (no LLM): `make_ready` (needs-orchestrator/P0 untouched 30+ min while you are idle), `rerun` (in-progress with no live run-n terminal for 10+ min), `fix_blocked_by` (normalize dependency lines). Limits: max 5 actions per run, same action+issue once per 60 min, never on ready-for-human, never on an issue with an open lane/<n> PR, never while `integrate.lock` is alive (re-checked before each action). Each action is commented on the issue ("Observer: ...") and logged in `tools/runner/.runs/observer.log`; last result `observer.last`. To stop it: `observer_minutes = 0`. Dry run: `python tools/runner/observer.py --dry`. Use `needs-orchestrator` on purpose to keep the observer off an issue for 30 min. The `rerun` rule skips issues labelled `cloud` (no local run window by design).

## AI observer (#203, read-only)
Every `ai_observer_minutes` (default 60, 0 = off) the watchdog runs `tools/runner/ai_observer.py`: one headless Sonnet session with read-only tools looks for inconsistencies (labels vs Blocked-by, PRs not moving, cloud lanes, log errors, the merge lock). You get `AI OBSERVER (hourly, read-only):` with up to 5 `OBSERVER: <problem #n> -> <fix, who>` lines; act on them yourself (the same finding is not repeated for 6 h). Owner findings also land in #193. Last result: `tools/runner/.runs/ai_observer.last`. One run by hand: `python tools/runner/ai_observer.py`.

## Code changes
- runner.py changes apply to the NEXT issue run (every run is a fresh `python runner.py` process; running runs keep the code they started with). The watchdog reloads runner.py by itself when the file changes; a change in watchdog.py itself needs the `watchdog` window restarted (kill it, run the watchdog line of tools/orchestrator.cmd) at a quiet moment.
- Normal path (#74): the runner merges on a green PR `tests` check. tools/integrate.sh is the fallback (`ci_merge = false`) and works in its own checkout `C:\work\Oren_study\wt-integrate` (branch `integrate`), so uncommitted edits in this checkout never block a merge; this checkout is fast-forwarded afterwards when clean. Deploy and pregen run there too.

Owner asks for stats → `python tools/runner/stats.py`, answer in ≤5 lines.
