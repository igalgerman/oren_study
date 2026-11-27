# Remote (cloud) Claude sessions — spike results (#131, 26 Nov 2026)

Tested from the owner PC (Claude Code 2.1.332, claude.ai Max login) with throwaway issue #143.
Script: `tools/runner/remote.py start|status|send` (test: `python tools/runner/test_remote.py`, fake CLI).

## What works (proven)
| step | result |
|---|---|
| clone igalgerman/oren_study | yes (GitHub access is already set up for the account) |
| push `lane/<n>` | yes (`lane/143`) |
| open a PR | yes (draft PR #145) |
| comment on the issue | yes (`RESULT: DONE <PR url>` on #143) |
| follow-up message to a session | yes, also after it finished (comments `FOLLOWUP: ok`, `SCRIPT SEND: ok`) |

## How to start
- `claude --cloud "<task>"` creates the session, prints the id and URL, and **exits** (the session keeps running in the cloud):
  ```
  Created cloud session: <title>
  View: https://claude.ai/code/session_01...?from=cli&m=0
  Resume with: claude --teleport session_01...
  ```
- It needs a real terminal: piped output gives `--cloud requires an interactive terminal`; `--bg --cloud` and
  `-p --cloud "<new task>"` are refused. `remote.py start` therefore runs it in a herdr terminal (`remote-<n>`) and reads the screen.
- The session starts from the **current commit of the cwd checkout** (it must be on GitHub). Start from the main checkout,
  not from a local-only lane branch (the CLI then falls back to that branch's base commit and says so).
- Token trap: the herdr server's environment has `CLAUDE_CODE_OAUTH_TOKEN` (a setup-token, `user:inference` only).
  With it, every start fails `Cloud session create failed: Request failed with status code 403`.
  `remote.py` unsets it, so claude uses the stored claude.ai login (has `user:sessions:claude_code`).

## Session id and state
- The id (`session_...`) and URL come only from the start output. `claude agents --json [--all]` and `claude logs <id>`
  do **not** know cloud sessions (`No session matching ...`).
- So the state comes from GitHub: `remote.py status <n>` reads the issue's comments (last `RESULT: DONE|STUCK` or
  `QUESTION:` line wins; none = `working`) and the PR on `lane/<n>`.
  Only comments from the latest `Runner: started` comment on count (the runner also passes its start time), so a reopened
  issue never finishes on an earlier run's RESULT (#236). `remote.py cloud` lists label `cloud` issues plus in-progress
  issues whose `.runs/<n>/where` is `remote`; the dashboard and panel count cloud lanes from it.
  #297: no RESULT line but this run's PR is open and its head has had no commit for 10 min -> `done` (goes to review;
  `runner.log` says `done by PR (no RESULT line)`); the panel row shows `waiting review PR #n`.
- Owner/manual view: the URL, or `claude --teleport <session>` (interactive).

## Follow-up messages
`claude -p --cloud <session> --output-format json "<text>"` — no terminal needed, returns at once with
`{"ok":true,"session_id":...,"url":...}` and the session acts on it (works on a finished session too). `remote.py send` wraps this.

## When a start is refused
Any failed start (no `Created cloud session` line, non-zero exit) prints `Error: Cloud session create failed: ...`;
`remote.py start` returns `{"ok": false, "error": "<that line>"}` with exit 1 -> the runner runs the issue locally (#137).
Seen: 403 (wrong token). **Not seen:** a usage-limit refusal (cannot be forced on purpose); assumed to take the same path.

## Reviewer and fix rounds for cloud issues (#134)
An issue whose worker ran in the cloud is also reviewed in the cloud: the runner starts a fresh cloud session with
`remote_review_prompt` (read-only, same four colours as FLOW.md). It posts ONE PR comment; the runner polls
`remote.review_status(pr, since=<round start>)` and takes the last `VERDICT:` line (on its own line) of a comment from this round.
No verdict within 60 min (or a refused start) -> the issue is blocked for the orchestrator.
RED (`VERDICT: FIX`) goes back to the worker's session (`remote.py send`, id kept in `.runs/<n>/remote.json`); if there is no
session or the send fails, a new cloud fix session checks out `lane/<n>`. The fix reports `RESULT: DONE` on the issue as before.
Same limits as local: 2 fix rounds, then blocked. The local worktree is made only after the last round (for merge/resolve).

## Questions from a cloud session (#135)
1. The session posts `QUESTION: <question, options>` on the issue and stops. The runner sees it within one poll (60 s).
2. `park_remote`: labels `blocked` + `ready-for-human` (lane freed, `in-progress` dropped), a `Parked (cloud)` comment, the question in the
   pinned 'Questions for the owner' issue (window `remote-<n>`: question page + phone push, panel, dashboard 'needs you'), and the orchestrator is told.
3. The owner answers: on the question page or the phone push (qwin posts `OWNER ANSWER ...` on the issue), through the orchestrator, or in the questions issue (the orchestrator records it with `qwin.py answer`). #608: a plain comment on the issue is never an answer (every session posts as the owner's account).
4. Every watchdog tick `resume_answered()` finds parked cloud issues (`.runs/<n>/where` = remote) whose last QUESTION has an answer
   (`remote.answer_after_question`: a later owner_q answer record `<!-- owner-answer:KEY -->`, written only by `qwin.py answer`; #608), stores it in
   `.runs/<n>/answer.json`, removes `blocked` + `ready-for-human` and comments `Runner: ...`.
5. The next runner pass starts the issue again (always remote): `remote_resume` sends the answer to the saved session
   (`remote.json`); no session or the send fails -> a new cloud session that reads the thread and continues `lane/<n>`. Then review/merge as usual.
qwin does not send the answer itself for these issues (no double send); a cloud issue the runner does not manage still gets it from qwin directly.

## Cloud desks: inbox + ask from the phone (#306)
`tools/runner/desks.py` (called by the watchdog every minute, in a thread; test `test_desks.py`). Two long-lived cloud sessions:
`Oren inbox (cloud)` (creates issues from the owner's Hebrew/English messages, one backlog, no duplicates) and
`Oren ask (cloud)` (read-only status answers in Hebrew). Their prompts are `desks.prompt()`.
- ONE pinned issue `Oren cloud: phone links + live status` (label `manual`): the two session links + `dashboard.py --text`,
  body edited in place every `status_minutes` (10; 0 = off). Nothing is committed. The ask session reads it.
- Keep-alive: a desk without a session is started (`remote.start(..., name="desk-<role>")`, window `desk-<role>`, label `role=desk`);
  every `desk_probe_hours` (12) a short `PING` goes to it (`remote.send`); no `ok` from the send = ended -> a new session, links updated.
  A refused start is retried after 30 min. State: `.runs/desks_state.json`; panel/dashboard line: `.runs/desks.json` (`cloud desks: inbox ok · ask down`).
- Subscription only (`claude --cloud`, `claude -p --cloud`): no paid API.

## One poller for all cloud lanes, cloud resolve (#289)
- Cloud picks are not started as one `run-<n>` process each. The pass queues them (`.runs/lanes/<n>.json`) and keeps ONE herdr
  window `lanes` (`runner.py --lanes`, `tools/runner/lanes.py`) live: it runs each cloud lane's flow in a thread, all of them poll
  GitHub on the same minute (one ghcache read answers all), and it exits after 5 idle minutes (the next pass starts it again).
  `.runs/lanes.json` lists its lanes; the watchdog, observer and recover see them as virtual `run-<n>` rows. The #364 safety net
  stops such a lane with `.runs/<n>/lanes_stop` instead of killing a window.
- Resolve runs are cloud sessions on the PR's branch: the watchdog's #262 backstop (`watchdog.resolve_start`, no wait; a round
  counts as running for `conflicts.RESOLVE_WAIT_MIN` = 40 min while the head does not move) and the resolve / red-CI fix inside a
  cloud lane's flow (`runner.remote_task`). Local `run-<n>` lanes (`local_lanes`) keep their local worker.
- The orchestrator's reviews and fixes: `runner.py <n> --cloud-review` / `runner.py <n> --cloud-fix="<points>"` (ORCHESTRATOR.md).
