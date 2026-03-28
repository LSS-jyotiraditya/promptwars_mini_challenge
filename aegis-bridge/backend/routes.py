"""
Aegis Bridge - API Routes
All REST endpoints for the platform.
"""

import os
import json
import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query, BackgroundTasks
from typing import Optional, List
from pydantic import BaseModel
import backend.database as db
import backend.triage_engine as triage_engine
import backend.ai_service as ai_service

router = APIRouter(prefix="/api")

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Health ────────────────────────────────────────────────────────

@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "Aegis Bridge",
        "version": "1.0.0-uat",
        "ai_configured": ai_service.is_configured()
    }


# ── Dashboard ─────────────────────────────────────────────────────

@router.get("/dashboard/stats")
async def dashboard_stats():
    return db.get_dashboard_stats()


# ── Incidents ─────────────────────────────────────────────────────

@router.get("/incidents")
async def list_incidents(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    vertical: Optional[str] = None,
    status: Optional[str] = None
):
    return db.get_incidents(limit=limit, offset=offset, vertical=vertical, status=status)


@router.get("/incidents/{incident_id}")
async def get_incident(incident_id: int):
    incident = db.get_incident_detail(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@router.post("/incidents")
async def create_incident(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    vertical: str = Form(...),
    text_input: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    reported_by: Optional[str] = Form("Anonymous"),
    files: Optional[List[UploadFile]] = File(None)
):
    """Create a new incident and trigger AI triage."""
    # Validate vertical
    if vertical not in ("emergency", "healthcare", "disaster"):
        raise HTTPException(status_code=400, detail="Invalid vertical. Must be: emergency, healthcare, disaster")

    # Save uploaded files
    file_paths = []
    image_data = []
    
    if files:
        for f in files:
            if f.filename and f.size and f.size > 0:
                file_path = os.path.join(UPLOAD_DIR, f"{os.urandom(8).hex()}_{f.filename}")
                content = await f.read()
                with open(file_path, "wb") as fp:
                    fp.write(content)
                file_paths.append(file_path)
                
                # If image or PDF, prepare for AI analysis
                if f.content_type:
                    if f.content_type.startswith("image/") or f.content_type == "application/pdf":
                        image_data.append((content, f.content_type))

    # Create incident record
    incident_id = db.insert_incident(
        title=title,
        vertical=vertical,
        input_text=text_input,
        input_files=file_paths,
        location=location,
        reported_by=reported_by or "Anonymous"
    )

    # Run AI triage in background
    background_tasks.add_task(
        triage_engine.process_incident,
        incident_id=incident_id,
        vertical=vertical,
        text_input=text_input,
        image_data=image_data if image_data else None,
        location=location
    )
    
    return {"status": "created", "incident_id": incident_id}


@router.post("/incidents/demo")
async def create_demo_incident(
    background_tasks: BackgroundTasks,
    vertical: str = Form("emergency")
):
    """Create a demo incident with pre-populated data for testing."""
    if vertical not in ("emergency", "healthcare", "disaster"):
        raise HTTPException(status_code=400, detail="Invalid vertical")

    demo = triage_engine.generate_demo_incident(vertical)

    incident_id = db.insert_incident(
        title=demo["title"],
        vertical=vertical,
        input_text=demo["text"],
        location=demo.get("location"),
        reported_by="Demo System"
    )

    background_tasks.add_task(
        triage_engine.process_incident,
        incident_id=incident_id,
        vertical=vertical,
        text_input=demo["text"],
        location=demo.get("location")
    )

    return {
        "status": "created",
        "incident_id": incident_id,
        "message": "Demo incident created. AI analysis running in background."
    }


# ── Actions (Human-in-the-Loop) ──────────────────────────────────

@router.get("/actions/pending")
async def get_pending_actions():
    return db.get_pending_actions()


@router.post("/actions/{action_id}/approve")
async def approve_action(action_id: int, approved_by: Optional[str] = Form("operator")):
    try:
        db.approve_action(action_id, approved_by=approved_by or "operator")
        return {"status": "approved", "action_id": action_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/actions/{action_id}/reject")
async def reject_action(action_id: int, approved_by: Optional[str] = Form("operator")):
    try:
        db.reject_action(action_id, approved_by=approved_by or "operator")
        return {"status": "rejected", "action_id": action_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class VoiceRequest(BaseModel):
    transcript: str
    vertical: str = "emergency"
    location: Optional[str] = None
    reported_by: Optional[str] = "Voice Caller"

# ── Voice Triage (Browser STT → AI → TTS) ───────────────────────

@router.post("/voice-triage")
async def voice_triage(
    background_tasks: BackgroundTasks,
    request: VoiceRequest
):
    """
    Accepts voice transcript from browser Web Speech API.
    Creates incident, runs triage, returns spoken summary for TTS.
    """
    if request.vertical not in ("emergency", "healthcare", "disaster"):
        request.vertical = "emergency"

    # Create incident
    incident_id = db.insert_incident(
        title=f"Voice Report: {request.transcript[:60]}{'...' if len(request.transcript) > 60 else ''}",
        vertical=request.vertical,
        input_text=request.transcript,
        location=request.location,
        reported_by=request.reported_by or "Voice Caller"
    )

    # Trigger background AI triage
    background_tasks.add_task(
        triage_engine.process_incident,
        incident_id=incident_id,
        vertical=request.vertical,
        text_input=request.transcript,
        location=request.location,
        audio_transcript=request.transcript
    )

    # For immediate response, we give a confirmation. 
    # Real TTS summary will be generated in the background task if needed, 
    # but for now we give an immediate response to resolve Network error.
    return {
        "status": "created",
        "incident_id": incident_id,
        "message": "Voice triage initiated. Our AI engine is analyzing your situation on CUDA.",
        "severity": "medium", # Placeholder until background task finished
        "summary": "AI Situational Intelligence is analyzing your report...",
        "actions_created": 0
    }


# ── Audit Trail ───────────────────────────────────────────────────

@router.get("/audit")
async def get_audit_log(
    limit: int = Query(100, ge=1, le=500),
    incident_id: Optional[int] = None
):
    return db.get_audit_log(limit=limit, incident_id=incident_id)
