#!/usr/bin/env bash
# Build and deploy "המסע של אורן" to Cloudflare Pages (project oren-game, D1 binding DB + old KV binding SAVES).
# DEPLOY_BRANCH=pr-<n> (#618, .github/workflows/preview.yml): a preview at https://pr-<n>.oren-game.pages.dev instead of production (main).
# Needs network access to api.cloudflare.com with a token (Pages:Edit, Workers KV Storage:Edit, D1:Edit, Account Settings:Read).
set -euo pipefail
cd "$(dirname "$0")/../.."          # oren2/
python3 build_talents.py            # index.html + cf/public/index.html
python3 cf/tools/make_worker.py     # cf/dist/_worker.js (site + save API in one file)
ACC="${CLOUDFLARE_ACCOUNT_ID:-4c3b50ff49c164a76d735099e5d0e932}"
# D1 (free plan): create the database "oren-game" once, make the tables, bind it as DB to the Pages project (idempotent).
# Needs the token permission "D1: Edit" (Account). The worker also creates the tables itself if they are missing.
API="https://api.cloudflare.com/client/v4/accounts/$ACC"; AUTH=(); [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")   # array: never word-split, never echoed (#109)
DBID=$(curl -sS "${AUTH[@]}" "$API/d1/database?name=oren-game" | python3 -c "import sys,json;r=json.load(sys.stdin).get('result') or [];print(r[0]['uuid'] if r else '')" || true)
if [ -z "$DBID" ]; then
  DBID=$(curl -sS -X POST "${AUTH[@]}" -H 'content-type: application/json' -d '{"name":"oren-game"}' "$API/d1/database" | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('result') or {}).get('uuid') or '');sys.stderr.write('' if d.get('success') else 'D1 create failed (add token permission D1: Edit): %s\n'%d.get('errors'))") || true
  [ -n "$DBID" ] && curl -sS -X POST "${AUTH[@]}" -H 'content-type: application/json'     -d "$(python3 -c "import json;print(json.dumps({'sql':open('cf/migrations/0001_init.sql').read()}))")" "$API/d1/database/$DBID/query" >/dev/null
fi
[ -z "$DBID" ] && echo "WARNING: D1 not bound (token lacks 'D1: Edit'?): family saves stay on KV (#109)"
if [ -n "$DBID" ]; then
  curl -sS -X PATCH "${AUTH[@]}" -H 'content-type: application/json'     -d "{\"deployment_configs\":{\"production\":{\"d1_databases\":{\"DB\":{\"id\":\"$DBID\"}}},\"preview\":{\"d1_databases\":{\"DB\":{\"id\":\"$DBID\"}}}}}"     "$API/pages/projects/oren-game" >/dev/null
fi
curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$ACC/pages/projects/oren-game/deployments" \
  ${CLOUDFLARE_API_TOKEN:+-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"} \
  -F 'manifest={}' -F "branch=${DEPLOY_BRANCH:-main}" -F '_worker.js=@cf/dist/_worker.js;filename=_worker.js;type=application/javascript+module' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok' if d.get('success') else d.get('errors'),(d.get('result') or {}).get('url'))"
