# Plan: three repos (infra, game, data), reviewed 28 Nov 2026 (#687, #788, #813)

Status: **APPROVED by the owner** (`python3 tools/runner/owner_q.py gate #687` prints OPEN). Reviewed on 28 Nov (#813).
This document is the map. The issues are the source of truth for each step's Acceptance: #789-#797, #814, #815.
Nothing is moved, deleted or made private by this document.

Names used here: **INFRA** = today's repo (keeps the backlog and all issue numbers; stays public, owner decision 28 Nov),
**GAME** = a new PUBLIC repo with a clean history, **DATA** = a new PRIVATE repo. The owner picks the real names in #789.

## 0. Owner decisions (28 Nov, binding)

| | Decision | Where it lands |
|---|---|---|
| a | The game KEEPS the kid's real name for the kid. The public source holds `{{KID_NAME}}`; the build injects the name from a private secret; a CI check keeps the name out of the source. No rename, no re-voice. | #791 |
| b | Privacy step 0 = #783-#787 (scrub of GitHub writes, phone-links issue, play data never on GitHub, one-time clean-up). | #783-#787 |
| c | The hardening #800 goes FIRST, before any repo move. | every step below is blocked by #800 |
| d | ONE day of watching (it was a week), then the clean-up. INFRA STAYS PUBLIC: no GitHub Pro, no private INFRA (owner decision 28 Nov). | #797 |
| e | The infra (GitHub App, Claude cloud environment, runner) has access to all 3 repos, so nothing ever asks the owner. | #789, #795 |
| f | One backlog, in INFRA. Issues are OFF in GAME and DATA. | #792, #796 |
| g | The kid's saves and progress stay in Cloudflare (D1) and must not change. | #815, #796 |

## 1. What goes where

| repo | content | today's paths |
|---|---|---|
| INFRA (public) | runner, watchdog, panel, canary, owner questions, agent rules, the backlog, owner reports | `tools/`, `.claude/`, `docs/`, `FLOW.md`, `ORCHESTRATOR.md`, `HOWTO.md` |
| GAME (public, clean history) | the game and its website, with the placeholder instead of the name | `oren2/` without its `docs/`, `oren2/ci` (#794), the 3 game workflows, `GLOSSARY.md`, a game `CLAUDE.md` with the worker rules, the session guard of #800 |
| DATA (private) | documents and summaries about the kid's real play | personal docs and real-play screenshots (#790), retro and play summaries. Never the raw play log, family codes or keys |

Not in any repo, unchanged: the play log on the PC (`~/.oren/`), the keys on the PC, and everything in Cloudflare
(saves, event log, voice recordings, the Pages secrets).

## 2. Order of steps

Every step is blocked by #800 (decision c). Tracks A, B and C run side by side; the rest is one line.

| # | Step | Issue | Who | Waits for | Way back |
|---|---|---|---|---|---|
| S | Hardening: trusted authors, session guard; then the cloud permission mode | #800, then #778 (PR #780) | lanes | none | revert the PR |
| 0 | Privacy step 0 | #783 (done), #785, #786, #787 | lanes; owner says yes to the clean-up list | #783 | edits cannot be undone: that is why #787 lists first |
| 1 | Sitting A: create GAME and DATA, app access to the 3 repos, e-mail privacy | #789 | **owner, 15 min** | #800, #785, #786 | delete the empty repos |
| A1 | Runner knows two repos: route, lookups, keys by repo + number | #792 | lane | #800, #778 | `game_repo` unset = today's behaviour |
| A2 | Cloud sessions start in the right repo; local GAME checkout | #793 | lane | #792 | config line |
| A3 | Access check and alarm for all 3 repos | #795 | lane + owner (cloud environment, 5 min) | #789, #792, #793 | check only, changes nothing |
| B1 | CI helpers move into the game tree | #794 (PR #802) | lane | #800 | revert the PR |
| B2 | Placeholder in the source, name injected at build | #791 | lane + **owner, 2 min** (one command sets the secret) | #794 | revert the PR; the secret stays unused |
| B3 | Deploy switch, failures to the one backlog, database guard | #815 | lane | #794, #791 | revert the PR |
| C1 | Personal docs and real-play screenshots to DATA | #790 | lane; owner says yes to the list | #789, #786, #787 | files stay in INFRA history |
| T | Split tools: clean export, port open PRs, settings check, way back | #814 | lane | #794 | tools only |
| 2 | Cutover. Part A rehearsal (no owner). Part B the hour | #796 | executor + **owner, 30-45 min** | all above | one switch (section 4) |
| 3 | ONE day watch, then the clean-up PR (INFRA stays public) | #797 | **owner, 2 min** | #796 | the one deploy switch, before the clean-up PR |

Changes made by the review, with the reason:
- #800 was not in the chain at all; now it is first (decision c). PR #802 had no `no-automerge` label, so the runner could have merged a workflow change by itself; the label is on now.
- #788 is done, so it is no longer a blocker. #787 no longer blocks #789 and #791: neither depends on the clean-up, and #787 waits for an owner answer, so it would have stalled the two longest steps.
- #791 now waits for #794: both change `deploy.yml` and the build.
- The end-to-end canary of #793 needed content in GAME, which only #796 creates (a loop). It moved to part A of #796.
- Two gaps got their own issues: #814 (nobody built the export, the PR porting or the way back) and #815 (the deploy path).

## 3. How it works across the repos

- **Backlog and numbers**: issues live only in INFRA, which is today's repo, so every existing issue and PR number keeps working.
  GAME is new: its PR numbers start at 1 and will collide with small INFRA issue numbers. So the runner keys its state by
  repo + number, writes PR references on INFRA issues as full URLs, and closes the INFRA issue itself after merge + deploy;
  the `Closes` keyword is a bonus (#792). Old `#n` notes inside game code keep pointing at the INFRA backlog.
- **Route**: one rule decides the repo of an issue (`core` is always GAME; one label for the rest), set by triage, with a
  one-time backfill of the open issues and self-recovery from a wrong route (#793).
- **Cloud sessions**: a session starts in the repo of the checkout it is launched from, so the PC keeps a second checkout
  (GAME) kept current by the main sync. A game session reads its rules from GAME's own `CLAUDE.md` and its issue from INFRA.
  Three access paths must cover ALL repositories of the account (owner decision 28 Nov: the agents manage all his projects); the check verifies at least the 3 plan repos: the bots' App, the Claude GitHub app, the token in the cloud environment (#795).
- **CI**: the game suites, deploy and preview run in GAME (public, free). INFRA keeps ONE job named `tests` (the tools tests).
- **Deploy**: same Cloudflare Pages project, same database, same site address. One Actions variable `DEPLOY_ENABLED` per repo;
  exactly one repo has it on. Deploy and tour failures are opened as issues in INFRA by the watchdog, because GAME has no
  issues and its workflow token cannot write to INFRA (#815).
- **Secrets**: GitHub secrets cannot be copied, they are set again. GAME gets a NEW `CLOUDFLARE_API_TOKEN` (four permissions,
  listed in #796) and `KID_NAME`. The old token stays in INFRA as the way back and is revoked in #797. `LOG_READ_KEY`, the
  voice keys and the diag key are Cloudflare Pages secrets: they stay with the Pages project and do not move.
- **The name** (#791): one secret holds every written form (Hebrew, Hebrew with nikud, Latin), set by a script from the private
  file on the PC, never typed. It is set in INFRA first, because #791 merges and deploys there before the cutover. Production
  stops when the secret is missing; tests, previews and local builds use one fixed dummy name (tester screenshots land in
  public PR comments). What this protects: the source, the history and code search. What it does not: the live site shows the
  name to every visitor, as today, and technical identifiers (folder, site address, repo name) keep their names.
- **Voice**: recordings are stored in the same database as the saves, keyed by the sentence text. The voice tools must read
  the BUILT text: today `pregen.js` reads source parts and has sentences with the name inside the tool. A hash gate in the
  deploy job proves the sentence list is the same before anything goes live (#791).

## 4. The cutover and the way back (#796)

Part A, rehearsal, no owner: export to GAME with the verify step (no name, no personal e-mail, no personal docs, neutral
author), `tests` green there, deploy switched off there, GAME settings equal to INFRA's, one canary through GAME.

Part B, the hour, in this order:
1. Freeze. Main green, no open `Deploy failed` issue, no pregen running, open game PRs merged or listed for porting.
2. Saves first: database export to the private folder on the PC, row counts noted.
3. INFRA deploy switch off. Last sync export to GAME, `tests` green.
4. Owner: new Cloudflare token in GAME, then two commands for the GAME protection settings and the name secret (#796).
5. GAME deploy switch on. Checks: same database bound, counts not lower, a test family code still loads, same sentence list,
   voice-missing count not higher, smoke check and regression tour green.
6. Runner config points at GAME, routes backfilled, freeze released, one game canary and one infra canary green. Port the listed PRs.

Way back, until #797 removes the game tree from INFRA:
- Site wrong: Cloudflare Pages rollback to the previous deployment (one click, no GitHub).
- Flow wrong: GAME switch off, INFRA switch on, `game_repo` out of the config; if PRs already merged in GAME, first `export.py --back`.
- The database is never touched by any of this: same project, same binding, and `deploy.sh` may no longer create or rebind one (#815).

## 5. Review findings

| Area | Risk found | Fix | Issue |
|---|---|---|---|
| Deploy during cutover | Two repos with the deploy workflow and a 15-minute cron on one Pages project: an old tree can go live over a new one | One switch per repo, exactly one on, alarm otherwise | #815, #795 |
| Deploy during cutover | Failed deploys and tours open issues in their own repo; GAME has none, so they would be silent | The watchdog opens them in INFRA | #815 |
| Deploy during cutover | 9 open PRs touched the game tree when measured; a clean history cannot take their branches | Drain before the hour, port the rest as diffs | #814, #796 |
| Saves (decision g) | `deploy.sh` creates and binds a new database when it finds none; a new token makes that possible | Never create or rebind without an explicit flag; export + counts before, compare after; never recreate the Pages project | #815, #796 |
| Rate limits | Limits are per identity, not per repo: the split adds no budget. Searching both repos for every PR would double the calls | Look in ONE repo by route; one batched read covers both repos; calls per repo on the dashboard | #792 |
| Secrets | #791 merges in INFRA, but its owner step put the secret in GAME, and a missing secret meant 'use the dummy': production would have shown and voiced the dummy name | Secret in INFRA before the merge; production stops without it | #791 |
| Secrets | Typing a name with nikud by hand cannot be byte-exact, so recordings would be missed | One script sets it from the private file | #791 |
| Secrets | The cutover asked to revoke the old Cloudflare token, which kills the way back; the Hebrew step listed one permission of four; `LOG_READ_KEY` was listed as a GitHub secret | Keep the old token until #797; list the four; it is a Pages secret | #796, #797 |
| Cloud environment | Access is three separate things (bots' App, Claude app, environment token), each can fail alone | 'All repositories' on each path (owner decision 28 Nov); the check verifies at least the 3 plan repos | #789, #795 |
| Cloud environment | Sessions start from a local checkout; there is none for GAME. The canary needed a GAME that did not exist yet | Second checkout + sync; canary in the rehearsal | #793, #796 |
| Numbers | GAME PR numbers restart at 1; bare `#n` and `Closes #n` point at the wrong thing | Keys by repo + number, full URLs, the runner closes the issue | #792 |
| Branch protection | Today: required check `tests`, admins included (checked 28 Nov). A new repo has none of it, and no interaction limit, auto-merge setting or session guard | A settings check that compares GAME with INFRA; the owner applies it with one command | #814, #796 |
| Branch protection | A private repo on the Free plan would have no branch protection and no auto-merge | Not an issue: INFRA stays public, no Pro (owner decision 28 Nov); the access check shows the rule still present | #797 |
| Clean history | A neutral first commit is lost at the first squash merge: the merge commit carries the PR author's e-mail | E-mail privacy on before the first commit; neutral git identity in the GAME checkout; the merge guard refuses other e-mails | #789, #814 |
| Voice cache | The Actions caches (pregen state, voice-check marks) do not move to a new repo: a restart from zero would re-ask for every sentence and spend the daily limits | The first run must make 0 new recordings and no check burst | #815 |
| Voice cache | Preview builds with the dummy name add recordings to the production store | One fixed dummy name: at most one extra set | #791 |
| Rollback | After the switch INFRA still holds a second, stale copy of the game | The merge guard refuses changes to it; it leaves INFRA after the watch day | #814, #797 |

## 6. Cost

- **CI minutes** (public repos are free; private ones are metered). Owner decision 28 Nov: INFRA stays public, so there is no INFRA quota to watch.
  Measured 28 Nov: 202 `tests` runs and 74 deploy runs in the last 24 hours; a shard takes 3-5 minutes, the tools job 25 seconds.
  All of the heavy part stays in public GAME: free. INFRA stays public and free too. The old estimate for a private INFRA (about 1 billed minute per run, if half of
  today's runs are tooling PRs, that is about 3,000 minutes a month (estimate; the share was not measured) against 2,000 free on
  Free and 3,000 on Pro) is dropped. Making everything private at today's pace would
  cost hundreds of dollars a month, so the game stays public.
- **GitHub plan**: stays Free. No Pro (owner decision 28 Nov).
- **Tokens and lanes** (estimate, not measured): 8 lane issues are left (#790-#795, #814, #815) besides #800 and #778, four of
  them Opus, most with an Opus review, three with a tester. About 25-35 lane-hours, roughly 5-10% of one week's budget at the
  governor's prior of 0.20 week-% per lane-hour. At most 3 of them run at once, because tracks A and B are each a serial line
  through the same files; the other lanes keep doing game work.
- **Side cost**: #791 rewrites every sentence with the name in the core text files, so open core PRs will conflict with it
  once, and game merges stop during the freeze hour.
- **Elapsed time** (estimate): about two days of lane work before the rehearsal, then the hour, then one day of watching.
- **Owner time**: about 1 to 1.5 hours in three sittings. A (after #800): #789 and the #791 command, about 20 minutes, plus two
  yes answers (#787 list, #790 list). B: the cutover hour, 30-45 minutes, plus the #795 cloud-environment check. C: the day after, 5-10 minutes.

## 7. Owner-only steps and what is still open

Only the owner can: answer gates and questions; create repos; change visibility; change app access and the cloud environment;
create tokens and secrets; apply repo settings; decide on the GitHub plan. Each such step has 3 Hebrew steps inside its issue
(#789, #790, #791, #795, #796, #797).

Open for the owner:
Decided by the owner on 28 Nov (no open question left here):
1. INFRA stays public, no GitHub Pro (#797). Privacy rests on four things: the step 0 scrub (#783-#787), the private DATA repo, the collaborators-only interaction limit (renew before 2027-05-28, #829) and the #800 author filter.
2. The GitHub App and the Claude cloud environment get 'All repositories' (#789, #795); the access check verifies at least the 3 plan repos.

## 8. What is public today and what cannot be removed

- In the tree: the name inside kid sentences and their built copies, personal docs and screenshots, the age and traits line in
  `CLAUDE.md`. Fixed by #791 (placeholder), #790 (DATA) and the clean GAME history.
- On GitHub: issue and PR titles, bodies and comments with the name or play data. Fixed by #783-#787.
- In the git history of INFRA (606 commits from 3 authors, one with a personal e-mail; 526 files; measured 28 Nov): stays until
  INFRA stays public (owner decision 28 Nov); the step 0 scrub is the protection. GAME starts clean and never gets that history.
- Cannot be removed: anything already cloned, cached or archived; the name inside the site address and the repo name; the name
  on the live site itself. Nothing here is a guarantee; that is why the scrub and the private DATA repo matter.

## Out of scope
Renaming the site, the Pages project, the folders or the INFRA repo. Deleting old history or asking GitHub Support to purge caches (owner decision, later).
