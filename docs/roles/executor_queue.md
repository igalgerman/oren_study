# Executor queue — FORMAT only

The real queue is a private file outside the repo (config key `executor_queue` in `tools/runner/config.toml`). It is one table with these columns:

| id | mode | status | task | result |
|---|---|---|---|---|
| 1 | sonnet-mid | queued | example: rename a label on an issue | |

- `mode`: `haiku`, `sonnet-mid`, `sonnet-high`, `opus-mid`, `opus-high`, `opus-max`.
- `status`: `queued`, `running`, `done`, `stuck`.
- `result`: one line (PR/issue link or the reason it is stuck); empty until done or stuck.
