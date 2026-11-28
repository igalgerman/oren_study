---
name: owner-round
description: The owner's "one by one" round, for the inspector session. Use when the owner says "owner round", "one by one", "סבב שאלות", "what is waiting for me", or asks what needs his answer. Collects everything waiting on him and asks it one item at a time.
---
# Owner round (inspector only)

Goal: the owner answers every waiting item in one sitting, one question at a time, and nothing is recorded in his name except through the sanctioned channel. Talk to him in English; kid-facing content questions may be in Hebrew. Never print secrets, the kid's name or play data.

## 1. Collect (all four, then dedupe)
1. `python tools/runner/owner_q.py open` (key, window/issue, text, url).
2. `gh issue list -R igalgerman/oren_study --label ready-for-human --state open --json number,title,labels,body`
3. The owner to-do list: search `gh issue list -R igalgerman/oren_study --state open --search "owner to-do"`; if none exists, grep open issue bodies for `## Owner step` and Hebrew owner steps.
4. PRs waiting on him: `gh pr list -R igalgerman/oren_study --state open --label owner-merge` and `--label no-automerge`.
Dedupe: EN/HE pairs and re-asks of the same question are ONE item. Keep the newest per issue + topic and use its key.

## 2. Order
1. P0 / `express`.
2. What blocks the most other work (count `Blocked by: #n` in open issues, and `blocked:owner`).
3. The oldest first.
Say the count once ("5 items, first: ...") and start. No long list.

## 3. Ask ONE item at a time
- Use the AskUserQuestion tool, one question per call. Never batch items.
- Short English question, the recommended option FIRST and marked `(Recommended)`, a link only if he needs to look.
- Wait for the answer before the next item.
- If AskUserQuestion is unavailable, ask the same single question as plain text with the recommended option first, and wait for his reply before the next item.

## 4. Record the answer (only this way)
- Owner_q question: `python tools/runner/qwin.py chat-answer <key> "<answer>" --quote "<his exact words>"` (#803; only the inspector may run it). Telegram shows him a confirmation; he has 10 minutes to undo with `בטל`, `אשר` makes it final. Tell him that, and that the gate stays closed until the final marker (`python tools/runner/owner_q.py gate #n`).
- NEVER write an `owner-answer` record, an `ANSWERED` line, "approved" or a reaction yourself. No session approves on his behalf (#608/#800); free comment text never counts.
- A merge OK: only his own merge click or a gate answer. Never merge for him.
- A manual step for him (secret, account, device): give at most 3 exact steps in Hebrew, then a check command that proves it is done without showing the value, e.g. `gh api repos/igalgerman/oren_study/actions/secrets/<NAME> --jq .name` (existence only). Run the check yourself after he says done.
- A ready-for-human issue with no question: put one in the normal channel (`owner_q.py ask #n "<question>" --gates n`) and move on; do not answer it yourself.
- His answer needs no key (a decision in plain words)? Do the work it unlocks, and say what you did.

## 5. Close the round
- Answered: one line each (item, his answer, what it unlocks, link).
- Still open: one line each with the link, and why (waiting for the Telegram `אשר`/undo window, not asked, he skipped it).
- Reminders: name the existing mechanism (the 2 h Telegram reminder of the open question). Say "no checkpoint exists" if none; never promise a manual check later.
- Anything you can do now (unblock, rebase, file the follow-up issue) do it now.
