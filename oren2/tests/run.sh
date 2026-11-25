#!/usr/bin/env bash
# Run all test suites in parallel.  Usage: tests/run.sh   (FULL=1 adds the slow play-through, SHOTS=1 saves screenshots, JOBS=n sets parallelism)
set -uo pipefail
cd "$(dirname "$0")/.."                       # oren2/
T0=$(date +%s)
python3 build_talents.py >/dev/null || { echo "build failed"; exit 1; }
python3 cf/tools/make_worker.py >/dev/null || { echo "worker bundle failed"; exit 1; }
export NODE_OPTIONS="--require ./tests/mute.js ${NODE_OPTIONS:-}"
rm -rf tests/.tmp && mkdir -p tests/.tmp/logs
node -e "const L=require('./tests/lib.js');" || exit 1          # writes tests/.tmp/t.html
SUITES=(math-logic edge-cases regressions activities reading "parent desktop" "parent phone" time-missions "day-path desktop" "day-path phone" "sandbox-voice desktop" "sandbox-voice phone" entry "arcade desktop" "arcade phone" family-sync worker voice-stop "health desktop" "health phone" "timelimit desktop" "timelimit phone" "qa-fix desktop" "qa-fix phone" "auto-read desktop" "friend desktop" "friend phone" spell "gaps desktop" "gaps phone" read-bank2 "music2 desktop" "music2 phone" "chess desktop" "chess phone" "explore2 desktop" "explore2 phone" "english2 desktop" "english2 phone" think)
if [ "${FULL:-}" = 1 ]; then SUITES+=("playthrough desktop" "playthrough phone"); fi
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
echo "time: $(( $(date +%s) - T0 ))s   logs: tests/.tmp/logs/"
exit $FAILED
