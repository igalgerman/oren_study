# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.

## Lane labels (this repo)

Every ticket also gets exactly one lane label, so parallel sessions don't collide (see `FLOW.md`):

| Label | Meaning |
|---|---|
| `core` | Touches core files (`talents.js`, `index.html` core, `reading.js`, `build_talents.py`, `wire.js`, `tests/run.sh`). Only ONE `core` ticket in progress at a time. |
| `pack` | Only inside one pack file + its own test. Many can run in parallel. |
| `review` | Read-only check (content, clutter, screenshots). Produces a report, no code. |

## Routing labels (runner)

| Label | Who acts | Set when |
|---|---|---|
| `blocked` + `needs-orchestrator` | the orchestrator (unblocks, splits, or asks the owner only if it is truly his decision) | worker `RESULT: STUCK`, runner error, reviewer asked for fixes twice |
| `blocked` + `ready-for-human` | the owner | a real owner question parked after `park_minutes`; or a task a human must do by hand |

The owner's lane (panel "YOUR LANE") shows only `ready-for-human` and `needs-triage`. The observer (`tools/runner/observer.py`) checks this every `observer_minutes`.

## Priority labels

`P0` urgent, `P1` high, `P2` normal (default when missing), `P3` low. The runner starts bugs first, then P0 before P3, then the oldest; the panel shows `[Pn]` in UP NEXT.
