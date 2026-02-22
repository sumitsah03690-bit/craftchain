#!/usr/bin/env bash
# ──────────────────────────────────────────────
# CraftChain — Quick Dev Environment Setup
# ──────────────────────────────────────────────
# Usage:  chmod +x dev-setup.sh && ./dev-setup.sh
# ──────────────────────────────────────────────

set -e

echo "🔧 Setting up CraftChain dev environment..."

# 1. Create .env from the example template (if it doesn't exist yet)
if [ -f .env ]; then
  echo "   .env already exists — skipping."
else
  cp .env.example .env
  echo "   ✅ Created .env from .env.example"
  echo "   ➡️  Open .env and add your MONGODB_URI before starting."
fi

# 2. Install all dependencies (root + workspaces)
echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "──────────────────────────────────────────"
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env and add your MongoDB connection string."
echo "  2. Run:  npm run dev"
echo "  3. Open http://localhost:5173  (React client)"
echo "  4. Open http://localhost:4000/api/health  (API health check)"
echo "──────────────────────────────────────────"
