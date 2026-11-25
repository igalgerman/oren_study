#!/usr/bin/env bash
# Test: SUITES_SHARD=i/n splits the suite list; every suite lands in exactly one shard (#73).
cd "$(dirname "$0")/.."
all=$(LIST_ONLY=1 tests/run.sh | sort)
[ -n "$all" ] || { echo "FAIL: no suites listed"; exit 1; }
for n in 1 4 6; do
  got=$(for i in $(seq 1 $n); do LIST_ONLY=1 SUITES_SHARD=$i/$n tests/run.sh; done | sort)
  [ "$got" = "$all" ] || { echo "FAIL: shards 1..$n do not add up to the full list"; exit 1; }
  [ "$(echo "$got" | uniq -d)" = "" ] || { echo "FAIL: a suite is in two shards ($n)"; exit 1; }
done
[ -n "$(LIST_ONLY=1 SUITES_SHARD=4/4 tests/run.sh)" ] || { echo "FAIL: shard 4/4 empty"; exit 1; }
if LIST_ONLY=1 SUITES_SHARD=5/4 tests/run.sh >/dev/null 2>&1; then echo "FAIL: bad shard accepted"; exit 1; fi
echo "RESULT shard 6 0"
