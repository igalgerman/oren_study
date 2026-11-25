#!/usr/bin/env bash
# Integrator: merge one lane into the integration branch, rebuild, test, push.  tools/integrate.sh lane/<name> [integration-branch=main]   (remote: $REMOTE, default origin; RUNNER=1 = caller closes the issue)
# Works in its OWN checkout (../wt-integrate, branch "integrate"), so uncommitted edits in the main checkout (the orchestrator lives there) never block it.
# Afterwards the main checkout is fast-forwarded when it is clean (best effort).
set -uo pipefail
lane="${1:?lane branch}"; into="${2:-main}"; remote="${REMOTE:-origin}"
root="$(git rev-parse --show-toplevel)"
case "$root" in */wt-integrate) root="$(git -C "$root" worktree list --porcelain | sed -n '1s/^worktree //p')";; esac
wt="$(dirname "$root")/wt-integrate"
export PATH=/c/work/Oren_study/bin:$PATH
git -C "$root" fetch -q "$remote" || exit 1
if [ ! -e "$wt/.git" ]; then
  git -C "$root" worktree prune
  git -C "$root" worktree add -B integrate "$wt" "$remote/$into" >/dev/null || exit 1
  git -C "$wt" config core.autocrlf false
  printf 'oren2/node_modules\noren2/package.json\noren2/package-lock.json\noren2/tests/.tmp/\n' >> "$(git -C "$wt" rev-parse --git-common-dir)/info/exclude"
fi
if [ -d "$root/oren2/node_modules" ] && [ ! -e "$wt/oren2/node_modules" ]; then
  if command -v cmd >/dev/null 2>&1; then MSYS2_ARG_CONV_EXCL="*" cmd /c mklink /J "$(cygpath -w "$wt/oren2/node_modules")" "$(cygpath -w "$root/oren2/node_modules")" >/dev/null
  else ln -s "$root/oren2/node_modules" "$wt/oren2/node_modules"; fi
fi
cd "$wt" || exit 1
git merge --abort 2>/dev/null; git reset -q --hard && git checkout -q -B integrate "$remote/$into" || { echo "cannot reset integration checkout"; exit 1; }
BUILT="oren2/index.html oren2/cf/public/index.html"
if ! git merge --no-ff --no-commit "$remote/$lane"; then
  [ -n "$(git diff --name-only --diff-filter=U)" ] || { echo "merge failed (no conflicts listed; is $remote/$lane there?)"; exit 2; }
  left=$(git diff --name-only --diff-filter=U | grep -vxF -e oren2/index.html -e oren2/cf/public/index.html)
  if [ -n "$left" ]; then echo "CONFLICTS (fix by hand, or send back to the lane):"; echo "$left"; exit 2; fi
  git checkout --ours -- $BUILT
fi
(cd oren2 && python3 build_talents.py >/dev/null) || { echo "build failed"; exit 3; }
git add $BUILT
(cd oren2 && JOBS="${JOBS:-4}" bash tests/run.sh) || { echo "TESTS FAILED: merge left uncommitted in $wt; rerun a flaky suite alone there, or 'git merge --abort'"; exit 4; }
git commit -qm "Integrate $lane

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q "$remote" "HEAD:$into" && echo "integrated $lane into $into" || { echo "commit/push failed"; exit 5; }
# bring the main checkout up to date when that is harmless
if [ "$(git -C "$root" rev-parse --abbrev-ref HEAD)" = "$into" ] && [ -z "$(git -C "$root" status --porcelain --untracked-files=no)" ]; then
  git -C "$root" merge -q --ff-only "$remote/$into" 2>/dev/null || true
fi
n="${lane#lane/}"; if [ -z "${RUNNER:-}" ] && [[ "$n" =~ ^[0-9]+$ ]]; then gh issue close "$n" --comment "Integrated into $into ($(git rev-parse --short HEAD)), all tests green." && echo "closed #$n"; fi
