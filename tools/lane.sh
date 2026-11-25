#!/usr/bin/env bash
# Create a worktree for one lane: tools/lane.sh <lane-name> [base-branch=main]   (remote: $REMOTE, default origin)
set -euo pipefail
name="${1:?lane name}"; base="${2:-main}"; remote="${REMOTE:-origin}"
root="$(git rev-parse --show-toplevel)"; wt="$(dirname "$root")/wt-$name"
git -C "$root" fetch -q "$remote"
git -C "$root" worktree add "$wt" -b "lane/$name" "$remote/$base"
git -C "$wt" config core.autocrlf false
# share Playwright's node_modules with the main checkout (Windows junction; symlink elsewhere)
if [ -d "$root/oren2/node_modules" ] && [ ! -e "$wt/oren2/node_modules" ]; then
  if command -v cmd >/dev/null 2>&1; then MSYS2_ARG_CONV_EXCL="*" cmd /c mklink /J "$(cygpath -w "$wt/oren2/node_modules")" "$(cygpath -w "$root/oren2/node_modules")" >/dev/null
  else ln -s "$root/oren2/node_modules" "$wt/oren2/node_modules"; fi
fi
printf 'oren2/node_modules\noren2/package.json\noren2/package-lock.json\noren2/tests/.tmp/\n' >> "$(git -C "$wt" rev-parse --git-common-dir)/info/exclude"
echo "lane ready: $wt  (branch lane/$name from $remote/$base)"
