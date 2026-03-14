#!/bin/bash
set -e

cd /Users/minhthiennguyen/Desktop/tony-podcast

# Install dependencies (idempotent)
npm install

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  cat > .env << 'EOF'
# Convex
CONVEX_DEPLOYMENT=""
NEXT_PUBLIC_CONVEX_URL=""

# Clerk
CLERK_SECRET_KEY=""
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_SIGN_IN_URL="/sign-in"
CLERK_SIGN_UP_URL="/sign-up"

# LLM Provider ("openai" | "ollama")
LLM_PROVIDER="ollama"

# Ollama (local)
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="llama3.1"

# OpenAI (if using openai provider)
OPENAI_API_KEY=""
EOF
fi

# Initialize Convex scaffolding if missing (safe + idempotent)
if [ ! -d convex ] || [ ! -f convex.json ]; then
  echo "Convex scaffolding not found. Attempting non-interactive initialization..."
  if CONVEX_AGENT_MODE=anonymous npx --yes convex init; then
    echo "Convex scaffolding initialized."
  else
    echo "Skipped Convex initialization: non-interactive setup failed (likely requires interactive project/account linking)."
    echo "Manual follow-up in interactive shell: npx convex init"
  fi
else
  echo "Convex scaffolding already present."
fi

echo "Environment ready."
