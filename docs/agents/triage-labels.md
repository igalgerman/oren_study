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

`P0` urgent, `P1` high, `P2` normal (default when missing), `P3` low. Tiers (#437): `tier-1` (default, no label), `tier-2`, `tier-3` — a later round of work; the owner's 26 Nov game picks are `tier-2`.
The inbox picks the tier of every new issue (like the P-level): `tier-1` (no label) = fixes / anything that blocks or breaks current work, the system or Oren's play today; `tier-2` = new features and improvements the owner adds; `tier-3` = nice-to-have, polish, later ideas; unsure -> `tier-2`. Its reply to the owner states the tier and a one-line reason.
The runner starts `express`, then P0 (any tier), then tier 1→3, then bugs, then P1→P3, then the oldest; the panel shows `Pn` (and `T2`/`T3`) in UP NEXT.
