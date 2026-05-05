#!/usr/bin/env bash
# Quickest sanity check — non-streaming first, streaming second.
# Requires: SARMALINK_AI_URL and SARMALINK_AI_KEY in env.

set -euo pipefail

: "${SARMALINK_AI_URL:?Set SARMALINK_AI_URL, e.g. https://your-deployment.vercel.app}"
: "${SARMALINK_AI_KEY:?Set SARMALINK_AI_KEY (your SarmaLink-AI API key)}"

echo "── Non-streaming request ──"
curl -sS -X POST "$SARMALINK_AI_URL/api/v1/chat/completions" \
  -H "Authorization: Bearer $SARMALINK_AI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "smart",
    "messages": [
      { "role": "user", "content": "Reply with the single word: pong" }
    ],
    "stream": false
  }'

echo ""
echo ""
echo "── Streaming request (SSE chunks below) ──"
curl -sS -N -X POST "$SARMALINK_AI_URL/api/v1/chat/completions" \
  -H "Authorization: Bearer $SARMALINK_AI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "smart",
    "messages": [
      { "role": "user", "content": "List three UK cities, one per line." }
    ],
    "stream": true
  }'

echo ""
