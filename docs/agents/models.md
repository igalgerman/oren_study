# Which model builds a task (guideline)

Every issue gets ONE model label before it runs. The inbox proposes it; the owner approves it
(the inbox asks: "#57 → model:opus? OK / change"). The runner starts the worker with that model.
No label = `model:sonnet`.

| Label | Model | Use it for |
|---|---|---|
| `model:haiku` | Haiku 5.5 | tiny, mechanical work: a typo, a label/text change, one-line config, a status/log summary |
| `model:sonnet` | Sonnet 5.5 (default) | normal code: bugs, pack content, wiring, tests, runner/tooling, docs |
| `model:opus` | Opus 5.5 | design / UI / UX for Oren's screens, teaching logic (how he learns), anything touching many core files at once, a bug two Sonnet tries could not fix, security/save/sync of the family data |

Helpers (sub-agents): a worker MAY start its own helpers for independent read-only work
(search, screenshots, a content check) — Haiku or Sonnet, never more expensive than the worker,
at most 2 at a time, and only when it saves real time. Writing code stays with the worker.

Reviewers: Sonnet by default; Opus when the task was `model:opus`.

Cost rule: pick the cheapest model that will do it right the first time. A redo costs more than Opus.
