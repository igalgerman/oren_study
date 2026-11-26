#!/usr/bin/env bash
# #187: run.sh times every suite (tests/.tmp/times.tsv), FAILS a suite over its tests/budget.txt line, and fails the run over RUN_BUDGET.
# Uses two fixture suites (tests/fixtures/budget-*.test.js) through SUITES_LIST + BUDGET_FILE. Usage (in oren2/): bash tests/budget.test.sh
set -u
cd "$(dirname "$0")/.."
fail(){ echo "FAIL: $1"; exit 1; }
export CI=true SUITES_SHARD= RETRY_ALONE= GITHUB_STEP_SUMMARY=
run(){ SUITES_LIST="$1" BUDGET_FILE=tests/fixtures/budget.txt RUN_BUDGET="${2:-}" bash tests/run.sh 2>&1; }
# budget.txt: 'default 60', every line names a real suite, a budget over 60 s says why ('# ...')
while read -r name secs _; do case "$name" in ''|'#'*|default) continue;; esac
  LIST_ONLY=1 FULL=1 bash tests/run.sh | tr ' ' '-' | grep -qxF "$name" || fail "budget.txt names an unknown suite: $name"
  [ "$secs" -gt 60 ] && ! grep -E "^$name[[:space:]]" tests/budget.txt | grep -q '#' && fail "$name has budget $secs > 60 without a '# why' comment"
done < tests/budget.txt
grep -qE '^default 60$' tests/budget.txt || fail "budget.txt needs 'default 60'"
# 1) the fast suite alone passes and is timed
out=$(run "fixtures/budget-fast"); rc=$?
[ "$rc" = 0 ] || fail "fast suite failed: $out"
grep -qP '^fixtures-budget-fast\t\d+\t60\tok$' tests/.tmp/times.tsv || fail "times.tsv row for the fast suite: $(cat tests/.tmp/times.tsv)"
head -1 tests/.tmp/times.tsv | grep -qP '^suite\tseconds\tbudget\tstatus$' || fail "times.tsv header"
# 2) the slow suite passes its own checks but takes 3 s > budget 1 s: the run fails and says suite, seconds, budget
out=$(run "fixtures/budget-fast
fixtures/budget-slow"); rc=$?
[ "$rc" != 0 ] || fail "a suite over its budget did not fail the run: $out"
grep -qE 'over budget: fixtures-budget-slow [3-9]s > budget 1s' <<<"$out" || fail "no over-budget message: $out"
grep -qP '^fixtures-budget-slow\t[3-9]\t1\tSLOW$' tests/.tmp/times.tsv || fail "times.tsv row for the slow suite: $(cat tests/.tmp/times.tsv)"
grep -qP '^fixtures-budget-fast\t\d+\t60\tok$' tests/.tmp/times.tsv || fail "the fast suite must stay ok"
# 3) whole-run budget (CI: RUN_BUDGET=480 per shard): a 3 s run over RUN_BUDGET=1 fails
out=$(run "fixtures/budget-fast" 60); [ $? = 0 ] || fail "a run under RUN_BUDGET should pass: $out"
out=$(SUITES_LIST="fixtures/budget-slow" BUDGET_FILE=/dev/null RUN_BUDGET=1 bash tests/run.sh 2>&1); rc=$?
[ "$rc" != 0 ] || fail "a run over RUN_BUDGET did not fail: $out"
grep -qE 'run over budget: [3-9][0-9]*s > 1s' <<<"$out" || fail "no run-over-budget message: $out"
# 4) the CI step summary gets a table
sum=$(mktemp); out=$(SUITES_LIST="fixtures/budget-fast" BUDGET_FILE=tests/fixtures/budget.txt GITHUB_STEP_SUMMARY="$sum" bash tests/run.sh 2>&1)
grep -qF '| suite | seconds | budget | status |' "$sum" || fail "no step summary table: $(cat "$sum")"
grep -qE '^\| fixtures-budget-fast \| [0-9]+ \| 60 \| ok \|$' "$sum" || fail "no summary row: $(cat "$sum")"
rm -f "$sum"
echo "RESULT budget 4 0"
