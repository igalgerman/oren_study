#!/usr/bin/env bash
# Run all test suites in parallel.  Usage: tests/run.sh   (FULL=1 adds the slow play-through, SHOTS=1 saves screenshots, JOBS=n sets parallelism)
set -uo pipefail
cd "$(dirname "$0")/.."                       # oren2/
T0=$(date +%s)
SUITES=(math-logic edge-cases regressions activities reading "parent desktop" "parent phone" time-missions "day-path desktop" "day-path phone" "sandbox-voice desktop" "sandbox-voice phone" entry "arcade desktop" "arcade phone" family-sync worker voice-stop voice-numbers "health desktop" "health phone" "timelimit desktop" "timelimit phone" "qa-fix desktop" "qa-fix phone" "auto-read desktop" "friend desktop" "friend phone" spell "gaps desktop" "gaps phone" read-bank2 "music2 desktop" "music2 phone" "chess desktop" "chess phone" "explore2 desktop" "explore2 phone" "english2 desktop" "english2 phone" think learn "help desktop" "help phone" "batchc desktop" "batchc phone" "norepeat desktop" "simplicity desktop" "simplicity phone" "again desktop" "again phone" "instructions desktop" "lessoncard desktop" "lessoncard phone" "know desktop" "know phone")
if [ "${FULL:-}" = 1 ]; then SUITES+=("playthrough desktop" "playthrough phone"); fi
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
run_one(){ local s="$1"; local file="${s%% *}"; local arg=""; [ "$s" != "$file" ] && arg="${s#* }"
  local log="tests/.tmp/logs/${s// /-}.log"; timeout 600 node "tests/$file.test.js" $arg >"$log" 2>&1; echo $? >"$log.code"; }
export -f run_one
printf '%s\n' "${SUITES[@]}" | xargs -P "${JOBS:-6}" -I{} bash -c 'run_one "$@"' _ {}
FAILED=0
printf '\n%-24s %5s %5s  %s\n' suite pass fail status
for s in "${SUITES[@]}"; do log="tests/.tmp/logs/${s// /-}.log"; line=$(grep '^RESULT' "$log" | tail -1); code=$(cat "$log.code" 2>/dev/null || echo 1)
  if [ -n "$line" ]; then read -r _ name p f <<<"$line"; else p=0; f='-'; fi
  st=ok; if [ -z "$line" ] || [ "$code" != 0 ] || [ "$f" != 0 ]; then st=FAILED; FAILED=1; fi
  printf '%-24s %5s %5s  %s\n' "${s// /-}" "$p" "$f" "$st"
  if [ "$st" = FAILED ]; then grep -E '^FAIL|Error' "$log" | head -5 | sed 's/^/    /'; fi
done
# RETRY_ALONE=1 (used by tools/integrate.sh): a suite that failed under parallel load is rerun ALONE once; all pass alone = flaky, not a failure (#60, #40)
if [ "$FAILED" = 1 ] && [ "${RETRY_ALONE:-}" = 1 ]; then
  FAILED=0; FLAKY=""; QUAR=""
  for s in "${SUITES[@]}"; do log="tests/.tmp/logs/${s// /-}.log"; line=$(grep '^RESULT' "$log" | tail -1); code=$(cat "$log.code" 2>/dev/null || echo 1)
    if [ -n "$line" ]; then read -r _ name p f <<<"$line"; else f='-'; fi
    if [ -z "$line" ] || [ "$code" != 0 ] || [ "$f" != 0 ]; then
      run_one "$s"; line=$(grep '^RESULT' "$log" | tail -1); code=$(cat "$log.code")
      if [ -n "$line" ]; then read -r _ name p f <<<"$line"; else f='-'; fi
      if [ -z "$line" ] || [ "$code" != 0 ] || [ "$f" != 0 ]; then
        if grep -qxF "${s// /-}" tests/quarantine.txt 2>/dev/null; then QUAR="$QUAR ${s// /-}"; else FAILED=1; fi
        echo "FAILED again alone: ${s// /-}"; grep -E '^FAIL|Error' "$log" | head -5 | sed 's/^/    /'
      else FLAKY="$FLAKY ${s// /-}"; fi
    fi
  done
  [ -n "$FLAKY" ] && echo "FLAKY (failed under load, passed alone):$FLAKY"
  [ -n "$QUAR" ] && echo "QUARANTINED (fails, does not block; see tests/quarantine.txt):$QUAR"
fi
echo "time: $(( $(date +%s) - T0 ))s   logs: tests/.tmp/logs/"
exit $FAILED
