#!/bin/bash
# Aegis Bridge - One-Command Startup
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║          AEGIS BRIDGE - Crisis Triage Platform           ║"
echo "╚══════════════════════════════════════════════════════════╝"

# Check for API key
if [ -z "$GEMINI_API_KEY" ]; then
    echo ""
    echo "⚠️  WARNING: GEMINI_API_KEY is not set."
    echo "   AI triage features will not work without it."
    echo "   Set it with: export GEMINI_API_KEY='your-key-here'"
    echo ""
fi

# Create virtual environment if needed
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate and install dependencies
echo "📦 Installing dependencies..."
source venv/bin/activate
pip install -q -r backend/requirements.txt

# Create data directory
mkdir -p data/uploads

# Start the server
echo ""
echo "🚀 Starting Aegis Bridge server on http://localhost:8080"
echo "📡 API Documentation: http://localhost:8080/docs"
echo ""
uvicorn backend.main:app --host 0.0.0.0 --port 8080 --reload
