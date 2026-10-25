#!/usr/bin/env bash
# Smoke check for a running instance: the site, its safety headers, the API
# and, with SMOKE_VOTE=1, one vote end to end.
#
#   deploy/smoke.sh https://personaindex.com          # the live site: reads only
#   EDGE_SECRET=... deploy/smoke.sh http://origin:8080 # an origin behind Cloudflare
#   SMOKE_VOTE=1 deploy/smoke.sh http://localhost:8080 # a throwaway database only
#
# SMOKE_VOTE casts a real vote. Never use it against the live site: results
# there must only ever count real people (CLAUDE.md, "Never fabricate votes").
set -euo pipefail

base="${1:?usage: deploy/smoke.sh BASE_URL}"
base="${base%/}"
edge=()
if [[ -n "${EDGE_SECRET:-}" ]]; then edge=(-H "X-Edge-Secret: ${EDGE_SECRET}"); fi
failures=0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; failures=$((failures + 1)); }

# fetch PATH [curl args...]: prints "status<TAB>headers-file<TAB>body-file".
fetch() {
  local path="$1"
  shift
  local h b
  h="$(mktemp "$tmp/h.XXXXXX")" b="$(mktemp "$tmp/b.XXXXXX")"
  local code
  code="$(curl -sS -o "$b" -D "$h" -w '%{http_code}' "${edge[@]}" "$@" "$base$path" || echo 000)"
  printf '%s\t%s\t%s\n' "$code" "$h" "$b"
}

header() { grep -i "^$2:" "$1" | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

expect() { # name status want-status
  if [[ "$2" == "$3" ]]; then pass "$1"; else fail "$1 (status $2, want $3)"; fi
}

contains() { # name haystack needle
  if [[ "$2" == *"$3"* ]]; then pass "$1"; else fail "$1 (got: ${2:-nothing})"; fi
}

IFS=$'\t' read -r code h b < <(fetch /api/ready)
expect "ready" "$code" 200

IFS=$'\t' read -r code h b < <(fetch /)
expect "app page" "$code" 200
contains "app page: scripts only from the site" "$(header "$h" content-security-policy)" "script-src 'self'"
contains "app page: HTTPS only" "$(header "$h" strict-transport-security)" "max-age="
contains "app page: no sniffing" "$(header "$h" x-content-type-options)" "nosniff"
contains "app page: always fresh" "$(header "$h" cache-control)" "no-cache"

IFS=$'\t' read -r code h b < <(fetch /read/)
expect "read pages" "$code" 200
contains "read pages: no script at all" "$(header "$h" content-security-policy)" "default-src 'none'"

IFS=$'\t' read -r code h b < <(fetch /sw.js)
expect "service worker" "$code" 200
contains "service worker: never cached" "$(header "$h" cache-control)" "no-cache"

IFS=$'\t' read -r code h b < <(fetch /api/questions/today)
expect "today's questions" "$code" 200
contains "API: locked-down policy" "$(header "$h" content-security-policy)" "default-src 'none'"
questions="$(jq -r '(.questions // []) | length' "$b" 2>/dev/null || echo 0)"
set_body="$b"
if [[ "$questions" -eq 0 && "$(jq -r '.review // false' "$b" 2>/dev/null)" == true ]]; then
  # Sunday (UTC) is the review day and has no questions by design. Saturday or
  # Monday is still today somewhere, so check that edition instead.
  pass "today is the review day: no questions, as designed"
  for day in "-1 day" "+1 day"; do
    d="$(date -u -d "$day" +%F)"
    IFS=$'\t' read -r code h b < <(fetch "/api/editions/$d")
    [[ "$code" == 200 ]] || continue
    questions="$(jq -r '(.questions // []) | length' "$b" 2>/dev/null || echo 0)"
    set_body="$b"
    [[ "$questions" -ge 1 ]] && break
  done
fi
if [[ "$questions" -ge 1 ]]; then pass "today's questions: $questions in the morning set"; else fail "today's questions: none"; fi

if [[ -n "${EDGE_SECRET:-}" ]]; then
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$base/api/questions/today" || echo 000)"
  expect "origin refuses requests that skip the edge" "$code" 403
fi

if [[ "${SMOKE_VOTE:-}" == 1 ]]; then
  IFS=$'\t' read -r code h b < <(fetch /api/device -X POST)
  expect "device pass" "$code" 201
  token="$(jq -r .token "$b")"
  read -r qid opt < <(jq -r '[.questions[] | select(.care != "intimate")][0] | "\(.id) \(.options[0].id)"' "$set_body")
  vote="$(jq -nc --arg q "$qid" --arg o "$opt" --arg t "$token" '{questionId:$q, optionId:$o, voterId:$t}')"
  IFS=$'\t' read -r code h b < <(fetch /api/votes -X POST -H 'Content-Type: application/json' -H "Idempotency-Key: smoke-$RANDOM$RANDOM" --data "$vote")
  expect "vote accepted" "$code" 202
  counted=0
  for _ in $(seq 20); do
    IFS=$'\t' read -r code h b < <(fetch "/api/questions/$qid/results")
    counted="$(jq -r '.totalVotes // 0' "$b")"
    [[ "$counted" -ge 1 ]] && break
    sleep 0.5
  done
  if [[ "$counted" -ge 1 ]]; then pass "vote counted"; else fail "vote not counted within 10 s"; fi
fi

if [[ "$failures" -gt 0 ]]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
