#!/bin/bash

# This script starts both the Turai Image Engine (in the parent dir or local) 
# and the VibePost app.

echo "🚀 Checking for Turai Image Engine..."

# Since this repo (VibePost-Core) is often used standalone in Replit,
# we need to check where the Turai server code is.
# In your setup, it sits one level up.

if [ -f "../server/index.ts" ]; then
    echo "✅ Found Turai in parent directory. Starting on port 5001..."
    # Go up, start Turai, then come back
    (cd .. && PORT=5001 NODE_ENV=development npx tsx server/index.ts) &
    # Allow time for Turai to bind to 5001
    sleep 5
else
    echo "⚠️ Warning: Turai Image Engine not found in parent directory."
    echo "   Manual image generation might fail unless Turai is started elsewhere."
fi

echo "🚀 Starting VibePost App on port 5002..."
# Start VibePost (the current dir)
PORT=5002 NODE_ENV=development npx tsx server/index.ts
