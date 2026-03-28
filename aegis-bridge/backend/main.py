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

import backend.database as db
import backend.routes as routes

# ── App Setup ─────────────────────────────────────────────────────

app = FastAPI(
    title="Aegis Bridge",
    description="Gemini-Powered Crisis Triage & Response Platform",
    version="1.0.0-uat"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False, # Must be false when using allow_origins=["*"] in some FastAPI versions
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(routes.router)

# Serve frontend static files
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

# ── Startup ───────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    db.init_db()
    print("=" * 60)
    print("  AEGIS BRIDGE - Crisis Triage Platform (UAT)")
    print("=" * 60)
    import backend.ai_service as ai
    if ai.is_configured():
        print(f"  ✅ AI Engine: {ai.get_backend_info()}")
    else:
        print("  ⚠️  AI service not configured — check .env")
    print("  🌐 Frontend: http://localhost:8000")
    print("  📡 API Docs: http://localhost:8000/docs")
    print("=" * 60)

# ── Serve Frontend SPA ────────────────────────────────────────────

# ── Serve Frontend SPA ────────────────────────────────────────────

@app.get("/")
async def serve_frontend():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

# Static files should be mounted AFTER routes to avoid shadowing
# But we'll handle explicit static paths here
@app.get("/static/{path:path}")
async def get_static_asset(path: str):
    return FileResponse(os.path.join(FRONTEND_DIR, path))

@app.get("/favicon.ico")
async def get_favicon():
    return FileResponse(os.path.join(FRONTEND_DIR, "favicon.ico"))
