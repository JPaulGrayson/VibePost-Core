#!/bin/bash

# Start the VibePost App with watch mode for hot reloading
echo "🚀 Starting VibePost App with hot reload..."

# Run the development server with watch mode
NODE_ENV=development npx tsx --watch server/index.ts
