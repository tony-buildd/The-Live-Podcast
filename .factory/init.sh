#!/bin/bash
set -e

cd /Users/minhthiennguyen/Desktop/tony-podcast

# Install dependencies (idempotent)
npm install

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  cat > .env << 'EOF'
# Database
DATABASE_URL="file:./prisma/dev.db"

# LLM Provider ("openai" | "ollama")
LLM_PROVIDER="ollama"

# Ollama (local)
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="llama3.1"

# OpenAI (if using openai provider)
OPENAI_API_KEY=""

# Auth (Phase 5)
NEXTAUTH_SECRET="dev-secret-change-in-production"
NEXTAUTH_URL="http://localhost:3100"
EOF
fi

# Generate Prisma client
npx prisma generate

# Run migrations (creates SQLite DB if needed)
npx prisma migrate dev --name init 2>/dev/null || npx prisma db push

echo "Environment ready."
