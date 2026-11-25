# Parallel work flow (several Claudes, one integrator)

Goal: several Claude sessions work at once without stepping on each other. ONE integrator
(the main local session) owns the working branch; other sessions work in their own worktrees.

Working branch: **`main`** on **igalgerman/oren_study** (`origin`). The old repo igalgerman/a is remote `old` — read-only history, do not push there.

## Who may write what
Wiring a pack touches the core (`talents.js` exports, `index.html` markers/`mergeIn`/`unlocked()`,
`build_talents.py`, `wire.js`, `tests/run.sh`, `activities.test`, `parent.test`). Two sessions editing
the core at once always conflict. So:

| kind of work | where | in parallel? |
|---|---|---|
| **Core wiring** (batches A, B, C) and **core fixes** (simplicity G1–G8, P1, P2) | directly on the working branch, one session at a time, owned by the integrator | **no** — one after another |
| **Pack-only work** (fixes inside one pack file + its own test) | a lane worktree (`tools/lane.sh`) | yes, one lane per pack |
| **Read-only work** (content correctness, clutter audits, screenshots, voice checks) | anywhere, no commits (or only a report in `oren2/docs/`) | yes |

The cloud session ("captain") and the local integrator never write the core at the same time:
whoever starts core work says so in `oren2/docs/STATUS.md` (one line, "core: <who> — <batch>"),
pushes that line first, and removes it when done.

## Every core step (batch or fix)
1. `git pull` on the working branch.
2. Follow the wiring notes in the pack headers and `oren2/docs/STATUS.md` section 7.
3. `python3 build_talents.py`, then `JOBS=4 tests/run.sh` (muted automatically). All green; a failing suite is rerun alone once — fails again = real.
4. Screenshots of new screens at phone 390x844 and desktop 1366x768; look at them: simple, one main action.
5. Commit, push, update STATUS.md (one line).

## A pack lane (worker in its own worktree)
```bash
bash tools/lane.sh <name>                 # ../wt-<name> on branch lane/<name>, Playwright linked
cd ../wt-<name>/oren2 && export PATH=/c/work/Oren_study/bin:$PATH   # python3 on this PC
```
- Edit only your pack's files and its test. Need a core change? Write it down for the integrator, don't make it.
- Test your suite alone: `NODE_OPTIONS="--require ./tests/mute.js" node tests/<suite>.test.js desktop` (and `phone`).
- Don't commit the built files (`oren2/index.html`, `oren2/cf/public/index.html`).
- `git push -u origin lane/<name>`, then tell the integrator. The integrator runs `bash tools/integrate.sh lane/<name>`
  (merge → rebuild → full tests → push only when green).

## Always
- Never deploy without the owner's OK. Never force-push. Never commit node_modules / package*.json / tests/.tmp.
- Kid text in Hebrew with correct nikud. Talk to the owner in English, short.

## Plan (integrator keeps this up to date)
| step | kind | status |
|---|---|---|
| batch 0 friend | core | done (cloud, 84e8dcf) |
| batch A: gaps, read-bank2, music2, chess, explore2 {merge:true}, english2 | core | done (local, not deployed) |
| content check of batch A packs (math, nikud, facts) | read-only | in progress (local, parallel) |
| batch B: think + daylog | core | next |
| batch C: learn, help, topic | core | after B |
| core G1–G8, then P1, then P2 | core | after C |
| final review: correctness + clutter of every screen | read-only, 2 in parallel | after P2 |
