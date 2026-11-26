#!/bin/bash
# git-guardrails (Matt Pocock, tuned for the Oren pipeline, see the issue in the commit): blocks only truly dangerous git.
# Allowed: normal pushes of lane/<n> branches, resets inside worktrees. No jq needed: we grep the raw hook JSON.
INPUT=$(cat)
deny() { echo "BLOCKED by git-guardrails: $1. Ask the orchestrator/owner instead (FLOW.md: never force-push, never push to main)." >&2; exit 2; }
echo "$INPUT" | grep -qE 'git[^"]*push[^"]*( --force| -f([ "\]|$)|--force-with-lease| \+[A-Za-z]|:\+)' && deny "force push"
echo "$INPUT" | grep -qE 'git[^"]*push[^"]*[ :](main|master)([ "\]|$)' && deny "push to main"
echo "$INPUT" | grep -qE 'git[^"]*(branch +(-D|-d|--delete)|push[^"]*--delete)[^"]*(main|master)([ "\]|$)' && deny "deleting main"
echo "$INPUT" | grep -qE 'git[^"]*clean[^"]* -[a-zA-Z]*x' && deny "git clean -x (deletes ignored files such as .env)"
exit 0
