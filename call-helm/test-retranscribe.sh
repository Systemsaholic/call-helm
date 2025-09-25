#!/bin/bash

# Test script for re-transcribing calls
# Usage: ./test-retranscribe.sh [callId]

API_URL="http://localhost:3000/api/test/retranscribe"

if [ -z "$1" ]; then
    echo "📋 Fetching recent calls with recordings..."
    echo ""
    curl -s "$API_URL" | python3 -m json.tool
    echo ""
    echo "To re-transcribe a call, run:"
    echo "./test-retranscribe.sh <call-id>"
else
    echo "🔄 Re-transcribing call: $1"
    echo ""
    curl -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "{\"callId\": \"$1\"}" \
        -s | python3 -m json.tool
    echo ""
    echo "✅ Re-transcription triggered. Check the dashboard in a few seconds."
fi