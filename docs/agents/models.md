# Which model and effort build a task (guideline)

Every issue gets ONE `model:` label and ONE `effort:` label before it runs. The inbox decides both from the table below, after splitting big tasks.
The owner can override. The runner starts the worker with that model. No `model:` label = `model:sonnet`; no `effort:` label = `effort:medium`.

Inbox decides, owner can override; reviewer always Opus (medium, high for design/UI/UX, security, save, sync); no low effort; design/UI floor is Opus.

## Labels

| Label | Model | Notes |
|---|---|---|
| `model:haiku` | Haiku 5.5 | only status/summary steps, never code |
| `model:sonnet` | Sonnet 5.5 (default) | normal code, content, tooling, tests |
| `model:opus` | Opus 5.5 | design/UI, teaching logic, tricky bugs, security/save/sync |
| `model:fable` | Fable 5.2 (`claude-fable-5-2`) | ONLY when the owner names it; effort high |

Effort labels: `effort:medium`, `effort:high`, `effort:xhigh`. There is no `effort:low`.

## Table: task type -> model, effort

| Task type | Model | Effort |
|---|---|---|
| Typo, label, text, one-line config (Haiku only for status/summary steps, never code) | Sonnet | medium |
| Docs, guides, small tooling (<= 3 files) | Sonnet | medium |
| Runner/watchdog logic with locks, merges, governor or concurrency | Sonnet | high |
| Pack content (missions, questions, Hebrew with nikud) | Sonnet | medium (high for nikud/pronunciation correctness) |
| Kid UI/UX, screens, story, game design, teaching logic (owner rule) | Opus | high |
| Core bug with a clear repro, <= 3 files | Sonnet | high |
| Tricky bug (timing, sync/save, cross-device, no repro, failed earlier try) | Opus | high |
| Security, family data, save/sync | Opus | high |
| Tests only | Sonnet | medium |
| Retro or audit (reading logs, listing findings) | Sonnet | high |
| Fable | only when the owner names it | high |

## Size rule

Data 25-28 Nov: above 600 lines the first-time rate is 22% Sonnet / 38% Opus. An estimate above ~600 lines, or a batch of 8+ items, is split before it gets a bigger model.

## Helpers and reviewers

Helpers (sub-agents): a worker MAY start its own helpers for independent read-only work (search, screenshots, a content check), Haiku or Sonnet, never more expensive than the worker, at most 2 at a time, only when it saves real time. Writing code stays with the worker.

Reviewers: always Opus, medium; high for design/UI/UX, security, save, sync (`model:opus` or `effort:high` issues). Floors live in `runner.floors()` (#714).

Cost rule: a redo costs more than Opus; split big tasks first, then pick the table's model.
