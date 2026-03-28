# Aegis Bridge - Crisis Triage Platform (Production Update)

Aegis Bridge is a multimodal, AI-powered triage and response coordinator optimized for crisis management. It transitions from local intelligence (Ollama) to cloud-scale reasoning (Gemini 2.0 / Vertex AI) while maintaining resilience through automatic fallback.

## 🚀 Key Features

*   **Multimodal AI Triage**: Integrated logic for processing text reports, incident photos, and transcribed voice calls.
*   **Gemini 2.0 Flash / Vertex AI**: High-velocity analysis for healthcare, emergency services, and disasters.
*   **Voice Emergency Bot (LIVE)**: Browser-based Speech-to-Text (STT) and Text-to-Speech (TTS) for hands-free reporting.
*   **Automatic Intelligence Fallback**: If Gemini hits rate limits (429), it automatically falls back to local **Gemma 3 (12B)** on Ollama.
*   **Indian Context Optimization**: Pre-configured for Indian emergency numbers (100, 108, 101) and healthcare triage protocols (ESI-1 to ESI-5).
*   **Human-in-the-Loop (HITL)**: AI generates recommendations; human operators approve actions via the Action Queue.

## 🛠️ Technology Stack

*   **Frontend**: Vanilla HTML/JS with Glassmorphic CSS Design. Uses Web Speech API for voice.
*   **Backend**: FastAPI (Python) with standard RESTful routes.
*   **Database**: SQLite (`data/aegis_bridge.db`) with full audit logging and incident versioning.
*   **Deployment**: Optimized for **Google Cloud Run** using a lean Dockerfile (~30KB source).

## 📡 Deployment & Configuration

### Environment Variables (`backend/.env`)
```bash
GEMINI_API_KEY=...       # From AI Studio
GCP_PROJECT=...          # Set to enable Vertex AI / Cloud Run
GCP_LOCATION=us-central1 # Regional endpoint
AI_BACKEND=gemini        # 'gemini' or 'ollama'
ENVIRONMENT=production   # Used for runtime optimization
```

### Local Testing
1. Install dependencies: `pip install -r backend/requirements.txt`
2. Start server: `python -m uvicorn backend.main:app --port 8080 --reload`
3. Access UI: `http://localhost:8080`

### Cloud Deployment
Deploy to Cloud Run with:
```bash
gcloud run deploy aegis-bridge --source . --region us-central1 --allow-unauthenticated
```

## 📜 Audit & Compliance
Every action is logged in the Audit Trail with a unique trace ID, linking the initial report, AI analysis, manual interventions, and final execution for accountability.
