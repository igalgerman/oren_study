# Plan: three private repos (infra, game, data) — design only (#687)

Status: **PROPOSAL. Nothing is moved, deleted or made private by this document.** The owner approves first
(gate: `python3 tools/runner/owner_q.py gate #687` must print OPEN before any step below starts).
Numbers measured on 28 Nov 2026 with the GitHub API (`igalgerman/oren_study`, public, 28 MB, 369 files, 50 commits, 719 issues+PRs).

## 1. What goes where

| repo (private) | content | today's paths |
|---|---|---|
| `oren-infra` | runner, watchdog, panel, canary, owner questions, CI helpers, agent rules | `tools/`, `.claude/`, `docs/agents/`, `FLOW.md`, `ORCHESTRATOR.md`, `HOWTO.md`, `docs/adr/` |
| `oren-game` | the game and its website (no personal text) | `oren2/` (code, `cf/`, tests), `oren/`, `GLOSSARY.md`, `CLAUDE.md` (game rules only), `.github/workflows/{tests,deploy,preview}.yml` |
| `oren-data` | anything about the child or family | play logs (`~/.oren/playlog`, never in git today), parent reports, owner photos/screenshots of him, personal notes, `oren2/docs/qa-deep-report.md`, `shots/` and `oren2/docs/shots/` that show real play, the owner-question history |

Rule of thumb: if it names or shows the child, or says how he played, it is `oren-data`. Code and rules keep only the
neutral word "the kid". The game keeps working from `oren-game` alone; `oren-data` is read by humans and the nightly retro only.

## 2. How it works across three repos

- **Issues / backlog**: ONE backlog stays in `oren-infra` (the runner reads one repo: `repo = ...` in `tools/runner/config.toml`).
  Game issues are labelled `game`; the worker gets the game repo checked out next to infra. PRs open in the repo they change;
  the body says `Fixes igalgerman/oren-infra#n` (cross-repo close needs the full ref). The runner's PR lookup
  (`remote.pr_for`, `Fixes #n`) gets a second repo argument (`game_repo`). This is the biggest code change (~71 files in `tools/runner` use `repo`).
- **Runner & lanes**: runs from `oren-infra`; cloud sessions clone `oren-game` as the work repo. The GitHub App (#363) is installed on all three.
- **CI**: `tests.yml`, `deploy.yml`, `preview.yml` move with the game. The `tools` job (runner tests) moves to infra and is tiny (<1 min).
  The merge gate (`tests` check) stays in `oren-game`; the runner merges there.
- **Deploy**: unchanged (Cloudflare Pages project `oren-game`, `oren2/cf/tools/deploy.sh`), now triggered from `oren-game`.
- **Secrets**: `CLOUDFLARE_API_TOKEN` and `LOG_READ_KEY` (Pages secret) move to `oren-game` repo secrets; the GitHub App key stays on the PC
  (`~/.oren/app.pem`). `oren-data` holds none. Rotate the Cloudflare token and the log key at the move (never in git, but the repo was public).
- **Data**: `tools/playlog.py` keeps writing to `~/.oren/` (outside every repo); a nightly job may add a *summary* only to `oren-data`.

## 3. Order of steps, each with a way back

1. Owner approves this plan (owner_q gate). Way back: nothing changed.
2. Create `oren-data` (private, empty). Copy (not move) the personal files in. Way back: delete the repo.
3. Create `oren-game` as a **copy** of the current repo at current `main`; run CI there once; add secrets. The old repo stays live and untouched. Way back: delete the copy.
4. Runner change on an `oren-infra` branch (config `game_repo`, PR lookup, issue refs); canary run against the copy with a throwaway issue. Way back: config line.
5. **Cutover** (one quiet hour, runner stopped with `freeze`): last sync to `oren-game`, repoint the deploy to it, switch runner config, start the runner. Way back: switch config + deploy workflow back to the old repo (kept, still public until step 7).
6. One week of normal flow; check CI minutes, deploys, canary green.
7. Only then: make the old repo private, or delete it after cleaning history (section 4). Before deletion the way back is the old repo; after deletion there is none, so do this last and only on an explicit owner answer.

## 4. Child-related text that is public today

Measured by grep over the tree, git history and GitHub:

- **Name**: "Oren"/"אורן" appears ~800 times in 76 files (code comments, kid text, docs; `oren2/index.html` and `cf/public/index.html` 225 each, built copies).
  Also in the site name `oren-game.pages.dev`, the repo name `oren_study`, and the commit author (one author, the owner's own email, on all 50 commits).
- **Age and traits**: `CLAUDE.md` ("age 6-7, new to computers, very smart"), `GLOSSARY.md`, `docs/adr/0001-task-pool.md`, comments in `friend.js`, `pday.js`, `health.js`, `story-mixer.md` (his pet friend, "he").
- **Play behaviour**: `oren2/docs/qa-deep-report.md`, `STATUS.md`; 12 issues/PRs with phrases such as "Oren cried/played/asked" (#41, #258, #347, #373, #392, #420, #462, #470, #536, #612, #623, #634); 1 issue with an attachment; 60 screenshot files under `shots/` and `oren2/docs/shots/` (names suggest game UI only; the owner should look at them).
- **Not public**: raw play events (`playlog.py` keeps them in `~/.oren/`), the family save codes (D1 on Cloudflare), keys.
- **Hebrew kid text / voice lines** are the product, not personal data; they stay.

**What can be removed**
- From the working tree: everything above, by moving to `oren-data` and rewording code comments to "the kid" (a normal PR in the new game repo).
- From git history: only by rewriting it. Step 3 can start `oren-game` from a **clean one-commit history**, so old text never enters it. 50 commits, one author: nothing of value is lost.
- Issues and PR comments: the 12 issues can be edited or deleted by the owner; in the new infra repo, transfer only open issues and leave closed ones behind.

**What cannot be removed**
- Anything already cloned, forked, cached or archived by third parties, search engines or the Wayback Machine; GitHub's cached views of old commits (SHAs can stay fetchable by hash until GitHub Support purges them); the public site name unless the Pages project is renamed.
- So making the old repo private or deleting it stops new exposure but is no guarantee. If it matters, ask GitHub Support to purge cached views after deletion.

## 5. CI minutes and cost (measured)

Public repos get Actions free; **private repos are metered**: Free plan 2,000 min/month, Pro 3,000, Linux overage $0.008/min
(rates from my knowledge; the owner should confirm on the billing page, which I cannot read).

Measured from the last 15 completed runs of each workflow (job minutes summed, rounded up per job), times the run counts from the API:

| workflow | runs so far (since 25 Nov) | billed min per run | total so far (est.) |
|---|---|---|---|
| `tests` (6 shards + tools + summary) | 818 | ~23 | ~19,000 |
| `deploy` (includes a 15-min cron) | 266 | ~22 | ~5,800 |
| `preview` | 36 | ~1 | ~40 |

That is **~25,000 min in about 3 days, ~8,000/day**, so ~240,000 min/month at the current pace, about **$1,900/month** — over 100x the free quota. The current flow cannot move to private repos as it is. (Estimate from a 15-run sample per workflow.)

Fixes (the owner picks; not decided here):
1. **Self-hosted runner** (small cloud VM; the PC froze under load): private repos use it free.
2. Cut waste first: run `tests` on PRs only (not again on the main push), skip the 6 shards for docs-only PRs, deploy on the cron only when main moved, cache playwright. Likely 70-80% fewer minutes, still tens of thousands a month.
3. Keep only `oren-data` and `oren-infra` private (infra CI is ~1 min) and keep `oren-game` public once cleaned. Costs about nothing and removes the personal text; the game itself is not secret. **Recommended.**

## 6. Recommendation (one choice for the owner)

`oren-data` private (new), `oren-infra` private, `oren-game` a **clean-history public** repo with the personal text removed. Only if the game must be private too: add a self-hosted runner first.
Owner question: is a public, cleaned `oren-game` acceptable, or must it be private too?

## Out of scope
Moving files, creating repos, changing visibility, deleting history, changing the runner. All need the approval above.
