"""
Aegis Bridge - Main Application
FastAPI entry point with static file serving.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from .database import init_db
from .routes import router

# ── App Setup ─────────────────────────────────────────────────────

app = FastAPI(
    title="Aegis Bridge",
    description="Gemini-Powered Crisis Triage & Response Platform",
    version="1.0.0-uat"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)

# Serve frontend static files
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

# ── Startup ───────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    init_db()
    print("=" * 60)
    print("  AEGIS BRIDGE - Crisis Triage Platform (UAT)")
    print("=" * 60)
    from . import ai_service
    if ai_service.is_configured():
        import os
        model = os.getenv("OLLAMA_MODEL", "gemma3:12b")
        print(f"  ✅ AI Engine: Ollama ({model})")
    else:
        print("  ⚠️  Ollama connection failed — AI features will fail")
    print("  🌐 Frontend: http://localhost:8080")
    print("  📡 API Docs: http://localhost:8080/docs")
    print("=" * 60)

# ── Serve Frontend SPA ────────────────────────────────────────────

@app.get("/")
async def serve_frontend():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/{path:path}")
async def serve_frontend_files(path: str):
    """Catch-all to serve frontend SPA files."""
    file_path = os.path.join(FRONTEND_DIR, path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    # Fall back to index.html for SPA routing
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
