#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "── astro-photo-renamer ───────────────────────────────"

# Pre-flight checks (report issues without launching anything)

# 1. Node version (≥20 required)
if ! command -v node &>/dev/null; then
  echo "⚠  Warning: Node.js is not installed." >&2
elif [[ $(node --version | sed 's/v//' | cut -d. -f1) -lt 20 ]]; then
  echo "⚠  Warning: Node.js 20+ required (found $(node --version))." >&2
fi

# 2. .env
if [ ! -f .env ]; then
  echo "⚠  Warning: .env not found. Run: cp .env.example .env"
fi

# 3. credentials.json
if [ ! -f credentials.json ]; then
  echo "⚠  Warning: credentials.json not found."
  echo "   OAuth will fail. See README → Google Cloud setup."
fi

# 4. Install dependencies if needed
if [ ! -f node_modules/.bin/tsx ]; then
  echo "Installing dependencies..."
  npm install
fi

echo ""
echo "astro-photo-renamer is a CLI tool — there is no server to start."
echo ""
echo "Usage:"
echo "  npm run dev -- <command> [options]"
echo ""
echo "Commands:"
echo "  run            Download + identify + rename in one shot"
echo "  run --local    Skip download; process images already in staging/"
echo "  download       Open Google Photos Picker and download selected images"
echo "  identify       Identify and rename images already in staging/"
echo ""
echo "Examples:"
echo "  npm run dev -- run"
echo "  npm run dev -- run --local"
echo "  DRY_RUN=true npm run dev -- run --local"
echo ""

exit 1
