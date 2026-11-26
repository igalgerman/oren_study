#!/usr/bin/env bash
# Run all test suites in parallel.  Usage: tests/run.sh   (FULL=1 adds the slow play-through, SHOTS=1 saves screenshots, JOBS=n sets parallelism)
# #187 time budget: every suite is timed (tests/.tmp/times.tsv); a suite slower than its tests/budget.txt line (default 60 s) FAILS;
# RUN_BUDGET=s fails the whole run when it takes longer (CI: 480 per shard). SUITES_LIST (one per line) / BUDGET_FILE: for tests/budget.test.sh.
set -uo pipefail
cd "$(dirname "$0")/.."                       # oren2/
T0=$(date +%s)
SUITES=(math-logic edge-cases regressions activities reading "parent desktop" "parent phone" time-missions "day-path desktop" "day-path phone" "sandbox-voice desktop" "sandbox-voice phone" entry "arcade desktop" "arcade phone" family-sync nowplay worker voice-stop voice-numbers voice-stats "health desktop" "health phone" "timelimit desktop" "timelimit phone" "qa-fix desktop" "qa-fix phone" "auto-read desktop" "friend desktop" "friend phone" spell "gaps desktop" "gaps phone" read-bank2 "music2 desktop" "music2 phone" "chess desktop" "chess phone" "explore2 desktop" "explore2 phone" "english2 desktop" "english2 phone" think learn "help desktop" "help phone" "helpbtn desktop" "helpbtn phone" "batchc desktop" "batchc phone" "norepeat desktop" "variety desktop" "simplicity desktop" "simplicity phone" "again desktop" "again phone" "instructions desktop" "lessoncard desktop" "lessoncard phone" "know desktop" "know phone" eventlog kidtext network pday)
if [ "${FULL:-}" = 1 ]; then SUITES+=("playthrough desktop" "playthrough phone"); fi
if [ -n "${SUITES_LIST:-}" ]; then mapfile -t SUITES <<<"$SUITES_LIST"; fi
BUDGET="${BUDGET_FILE:-tests/budget.txt}"
# SUITES_SHARD=i/n (1-based): run only every n-th suite starting at i, so CI can split the list over n machines (#73). LIST_ONLY=1 prints the chosen suites and exits.
if [ -n "${SUITES_SHARD:-}" ]; then
  si="${SUITES_SHARD%/*}"; sn="${SUITES_SHARD#*/}"
  case "$si$sn" in ''|*[!0-9]*) echo "bad SUITES_SHARD=$SUITES_SHARD (want i/n)"; exit 2;; esac
  { [ "$si" -ge 1 ] && [ "$si" -le "$sn" ]; } || { echo "bad SUITES_SHARD=$SUITES_SHARD (want 1<=i<=n)"; exit 2; }
  PICK=(); for k in "${!SUITES[@]}"; do [ $(( k % sn + 1 )) = "$si" ] && PICK+=("${SUITES[$k]}"); done
  SUITES=("${PICK[@]}")
fi
[ "${LIST_ONLY:-}" = 1 ] && { printf '%s\n' "${SUITES[@]}"; exit 0; }
# #284: never on the owner's PC (50 headless browsers made it crawl): only CI, a cloud session, or an explicit ALLOW_LOCAL_TESTS=1
if [ "${CI:-}" != true ] && [ "${ALLOW_LOCAL_TESTS:-}" != 1 ] && [ "${CLAUDE_CODE_REMOTE:-}" != true ]; then
  echo "game suites run in CI only (#284): see the PR's 'tests' check (ALLOW_LOCAL_TESTS=1 to override)"; exit 3; fi
python3 build_talents.py >/dev/null || { echo "build failed"; exit 1; }
python3 cf/tools/make_worker.py >/dev/null || { echo "worker bundle failed"; exit 1; }
export NODE_OPTIONS="--require ./tests/mute.js ${NODE_OPTIONS:-}"
rm -rf tests/.tmp && mkdir -p tests/.tmp/logs
node -e "const L=require('./tests/lib.js');" || exit 1          # writes tests/.tmp/t.html
key(){ local k="${1// /-}"; echo "${k//\//-}"; }      # suite name as in logs, budget.txt, quarantine.txt ("parent desktop" -> parent-desktop)
budget_of(){ awk -v s="$1" '/^[[:space:]]*#/{next} $1=="default"{d=$2} $1==s{b=$2} END{print (b!="" ? b : (d!="" ? d : 60))}' "$BUDGET" 2>/dev/null || echo 60; }
# hard timeout 120 s; a suite whose budget is 120+ s (tests/budget.txt says why) gets budget + 30 s, so its budget is the real limit
run_one(){ local s="$1"; local file="${s%% *}"; local arg=""; [ "$s" != "$file" ] && arg="${s#* }"
  local to=120 b; b=$(budget_of "$(key "$s")"); [ "$b" -ge 120 ] && to=$(( b + 30 ))
  local log="tests/.tmp/logs/$(key "$s").log" t0=$(date +%s); timeout "$to" node "tests/$file.test.js" $arg >"$log" 2>&1; echo $? >"$log.code"
  echo $(( $(date +%s) - t0 )) >"$log.secs"; }
export -f key budget_of; export BUDGET
export -f run_one
printf '%s\n' "${SUITES[@]}" | xargs -P "${JOBS:-6}" -I{} bash -c 'run_one "$@"' _ {}
# check <suite>: sets p f secs bud st (ok | FAILED | SLOW = passed but over its budget)
check(){ local k; k=$(key "$1"); local log="tests/.tmp/logs/$k.log" line code; line=$(grep '^RESULT' "$log" 2>/dev/null | tail -1); code=$(cat "$log.code" 2>/dev/null || echo 1)
  if [ -n "$line" ]; then read -r _ _ p f <<<"$line"; else p=0; f='-'; fi
  secs=$(cat "$log.secs" 2>/dev/null || echo 0); bud=$(budget_of "$k"); st=ok
  if [ -z "$line" ] || [ "$code" != 0 ] || [ "$f" != 0 ]; then st=FAILED; elif [ "$secs" -gt "$bud" ]; then st=SLOW; fi; }
why(){ local k; k=$(key "$1"); if [ "$st" = SLOW ]; then echo "    over budget: $k ${secs}s > budget ${bud}s (tests/budget.txt)"
  else grep -E '^FAIL|Error' "tests/.tmp/logs/$k.log" | head -5 | sed 's/^/    /'; fi; }
FAILED=0
printf '\n%-24s %5s %5s %5s  %s\n' suite pass fail secs status
for s in "${SUITES[@]}"; do check "$s"
  [ "$st" != ok ] && FAILED=1
  printf '%-24s %5s %5s %5s  %s\n' "$(key "$s")" "$p" "$f" "$secs" "$st"
  [ "$st" != ok ] && why "$s"
done
# RETRY_ALONE=1 (CI, tools/integrate.sh): a suite that failed (or was too slow) under parallel load is rerun ALONE once; ok alone = flaky, not a failure (#60, #40)
if [ "$FAILED" = 1 ] && [ "${RETRY_ALONE:-}" = 1 ]; then
  FAILED=0; FLAKY=""; QUAR=""
  for s in "${SUITES[@]}"; do check "$s"; [ "$st" = ok ] && continue
    run_one "$s"; check "$s"
    if [ "$st" != ok ]; then
      if grep -qxF "$(key "$s")" tests/quarantine.txt 2>/dev/null; then QUAR="$QUAR $(key "$s")"; else FAILED=1; fi
      echo "FAILED again alone: $(key "$s")"; why "$s"
    else FLAKY="$FLAKY $(key "$s")"; fi
  done
  [ -n "$FLAKY" ] && echo "FLAKY (failed under load, passed alone):$FLAKY"
  [ -n "$QUAR" ] && echo "QUARANTINED (fails, does not block; see tests/quarantine.txt):$QUAR"
fi
# times.tsv (the test gardener reads it, tools/test_garden.py) + the CI step summary
{ printf 'suite\tseconds\tbudget\tstatus\n'; for s in "${SUITES[@]}"; do check "$s"; printf '%s\t%s\t%s\t%s\n' "$(key "$s")" "$secs" "$bud" "$st"; done; } >tests/.tmp/times.tsv
TOTAL=$(( $(date +%s) - T0 ))
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  { echo "### Suites ${SUITES_SHARD:-all}: ${TOTAL}s${RUN_BUDGET:+ (budget ${RUN_BUDGET}s)}"; echo; echo '| suite | seconds | budget | status |'; echo '|---|---|---|---|'
    tail -n +2 tests/.tmp/times.tsv | sort -t$'\t' -k2,2nr | awk -F'\t' '{print "| "$1" | "$2" | "$3" | "$4" |"}'; } >>"$GITHUB_STEP_SUMMARY"
fi
if [ -n "${RUN_BUDGET:-}" ] && [ "$TOTAL" -gt "$RUN_BUDGET" ]; then echo "run over budget: ${TOTAL}s > ${RUN_BUDGET}s (RUN_BUDGET)"; FAILED=1; fi
echo "time: ${TOTAL}s   logs: tests/.tmp/logs/  times: tests/.tmp/times.tsv"
exit $FAILED
