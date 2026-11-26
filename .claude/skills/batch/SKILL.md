---
name: batch
description: Group small open issues of the Oren game backlog into batch issues (5-8 per area) so one worker closes many in one PR. Use in the inbox when the owner or orchestrator asks to batch, or when many small P2/P3 issues are ready.
---
# Batch small issues (inbox skill)

Goal: fewer runs close more issues. One worker does a whole batch in ONE PR; independent members can go to sub-agents.

## Pick the members
1. `gh issue list -R igalgerman/oren_study --state open --limit 200 --json number,title,labels,body`
2. Candidates: P2 or P3, labelled `ready-for-agent`, NOT `cloud`, `in-progress`, `blocked`, `manual`, and with no open PR (`gh pr list -R igalgerman/oren_study --search "#<n>"`).
3. Never batch P0/P1, design/spec issues, or an issue another one is `Blocked by`.
4. Group by AREA (same screen, same files or same kind of change: simplicity items, content fixes, parent panel polish, voice text, tests). 5-8 per batch; fewer than 3 = do not batch.

## Make the batch issue
Title: `Batch: <area> (#a, #b, #c, ...)`. Labels: `P2` (or `P3` if all members are P3), `ready-for-agent`, the members' lane (`core` if any member is core, else `pack`), `model:sonnet` unless a member needs more.
Body (keep this text, fill the list):
```
Members (each keeps its own acceptance; read every member issue with --comments):
- [ ] #a  <one line>
- [ ] #b  <one line>
...
## Acceptance
Every member's acceptance is met; all suites green; ONE PR whose body has one line per member: Fixes #a, Fixes #b, ...
## How to work (worker)
- Members that touch DIFFERENT files are independent: you may hand each to a sub-agent (Agent tool) with the member issue,
  the files it may touch and 'do not commit'. Members on the same files: do them yourself, one after the other.
- You integrate: review every sub-agent diff, run the tests once for all, commit, push, open the ONE PR.
- A member that turns out bigger than expected: leave it out, comment on it 'taken out of batch #N: <why>', put
  ready-for-agent back on it, and say so in the PR.
```

## Mark the members
On each member: comment `In batch #N`, remove `ready-for-agent` (the runner must not start it alone). Keep its other labels.

## Report
One message to the owner/orchestrator: each batch number, area and member numbers.
