#!/usr/bin/env bash
# #284: the game suites (Playwright) never run on the owner's PC: run.sh and tests/lib.js refuse unless CI=true,
# ALLOW_LOCAL_TESTS=1 or a cloud session (CLAUDE_CODE_REMOTE=true). Usage (in oren2/): bash tests/localguard.test.sh
set -u
cd "$(dirname "$0")/.."
MSG='game suites run in CI only (#284)'
pc(){ env -u CI -u ALLOW_LOCAL_TESTS -u CLAUDE_CODE_REMOTE "$@"; }
fail(){ echo "FAIL: $1"; exit 1; }
out=$(pc bash tests/run.sh 2>&1); rc=$?
[ "$rc" != 0 ] || fail "run.sh ran on the PC"
grep -qF "$MSG" <<<"$out" || fail "run.sh did not say why: $out"
out=$(pc node -e "require('./tests/lib.js')" 2>&1); rc=$?
[ "$rc" != 0 ] || fail "tests/lib.js (every suite) loaded on the PC"
grep -qF "$MSG" <<<"$out" || fail "lib.js did not say why: $out"
[ -n "$(pc env LIST_ONLY=1 bash tests/run.sh)" ] || fail "LIST_ONLY=1 must still list the suites"
for ok in CI=true ALLOW_LOCAL_TESTS=1 CLAUDE_CODE_REMOTE=true; do
  pc env "$ok" node -e "require('./tests/lib.js')" || fail "lib.js refused with $ok"
done
echo "PASS localguard"
