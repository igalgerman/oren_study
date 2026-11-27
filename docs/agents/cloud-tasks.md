# Cloud scheduled tasks (#289)

The AI observer (#203) and the nightly retro (#219) run as Claude Code **cloud scheduled tasks** (claude.ai, the subscription;
never the paid API, never `claude -p` on the PC). Config: `ai_observer_where = "cloud"`, `retro_where = "cloud"`
(`tools/runner/config.toml`; `"local"` = the old headless run on the PC). The PC watchdog only relays (no LLM there):
- `ai_observer.relay`: every 5 min it reads the newest comment on the open issue labelled `ai-observer` ('AI observer (cloud)')
  and sends new `OBSERVER:` lines to the orchestrator (6 h repeat filter, owner findings to #193). Silent 3 h -> one note.
- `nightly.cloud_retro`: from `retro_hour` on it looks for the issue `Daily retro <date>` and writes the inspector handoff
  (`inspector_handoff`, outside the repo) and the ORCHESTRATOR.md handoff PR. None 2 h after `retro_hour` -> one note.
- #525 (the triggers never ran, 27 Nov): no trigger-made observer comment for 3 h -> ONE owner note through `owner_q`
  (also Telegram): 'cloud AI observer silent since HH:MM - log in again (/login) or check claude.ai/code -> Scheduled', at most
  every 12 h. Until one trigger-made comment is seen, the watchdog itself starts the AI observer prompt below every hour as a
  cloud job (`remote.launch`, window `cloud-observer`, no runner lane), and the retro prompt once a day when no
  `Daily retro <date>` exists 2 h after `retro_hour` (window `cloud-retro`). A fallback run starts its comment / issue body
  with the line `<!-- fallback #525 -->`, so it never counts as proof that the trigger works.

Two scheduled tasks (fresh session per run, created once; manage them at claude.ai/code -> Scheduled):
- `Oren AI observer (hourly)`: every hour. Prompt: "Follow docs/agents/cloud-tasks.md, section AI observer, in igalgerman/oren_study."
- `Oren nightly retro`: daily 22:41 Asia/Jerusalem (before `retro_hour` 23). Prompt: "... section Nightly retro ...".
Created 26 Nov 2026 (#289): `trig_012s8RwkxkTSzHi477fGm8dh` (observer, minute :06) and `trig_01CjmG4AQo5TZt2EZ8S18F7f` (retro);
no push/e-mail notifications (the watchdog relays). Each one stops at once while this file is not on main.

In a cloud session `gh` has no GraphQL: use the REST API only (`gh api repos/igalgerman/oren_study/...`). Work in a checkout
of igalgerman/oren_study (`git clone https://github.com/igalgerman/oren_study` when the working directory has none) and read
this file from `main`. If this file is not on main: stop at once.

## AI observer
You are the AI OBSERVER of the Oren study automatic flow: a read-only auditor. Change NOTHING except the one comment below.
Rules: FLOW.md, ORCHESTRATOR.md, docs/agents/triage-labels.md. Labels: `ready-for-human` = the owner must answer;
`blocked` + `needs-orchestrator` = the orchestrator handles it; `in-progress` = a lane runs it; `later` = held only when the owner asks (#652).
Check, with a few REST calls only:
1. Open issues (`gh api 'repos/igalgerman/oren_study/issues?state=open&per_page=100'`): labels that contradict each other or
   the `Blocked by: #n` lines; in-progress with no runner comment for hours; an owner-lane issue an agent could do.
2. Open PRs (`.../pulls?state=open`) and their comments: red checks nobody fixes, `VERDICT: PASS` but not merging, PRs not moving.
3. The runner's own comments (`Runner: ...`, `RESULT:`, `QUESTION:`): stuck runs, a QUESTION nobody relays, DONE with no PR.
Then post ONE comment on the open issue labelled `ai-observer` (create it once if missing: title `AI observer (cloud)`,
label `ai-observer`): at most 5 lines, each exactly
`OBSERVER: <what is wrong, with #n> -> <the fix, who does it (orchestrator / worker / owner)>`
or the single line `no problems`. "owner" only when it is truly his decision. Nothing else in that comment.

## Nightly retro
You are the NIGHTLY RETRO of the Oren study flow for today (Asia/Jerusalem date). Read-only except the one issue below.
Follow docs/agents/skills/retro.md for the DAY (today's issues, PRs, runner/reviewer comments, `Deploy failed`/canary issues,
the `ai-observer` issue comments), then docs/agents/skills/handoff.md for the two handoffs. Every proposal points to a concrete
moment (an issue/PR #n, a comment time HH:MM); no evidence -> leave it out. If the issue `Daily retro <date>` exists: stop.
Else create it (labels `retro`, `P2`) with exactly this body:
```
Nightly retro (cloud scheduled task, #289). Nothing was applied: the orchestrator turns the accepted ones into tickets.

RETRO: <proposal, one line> | EVIDENCE: <#n / HH:MM>
(at most 7 RETRO lines, most valuable first)
HANDOFF-INSPECTOR:
<short handoff for the next inspector session: state, open threads, what to watch>
HANDOFF-ORCHESTRATOR:
<short handoff for the next orchestrator session: state, open threads, what to do first>
```
