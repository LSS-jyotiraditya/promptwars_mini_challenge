# Aegis Bridge: Advanced Intelligence Upgrade Walkthrough

The **Aegis Bridge** platform has been upgraded to a **situational intelligence system**, moving beyond isolated report triaging to a context-aware, knowledge-baked crisis response engine.

## 1. Advanced Knowledge Architecture (RAG + Graph)

### 🧠 Long-Term Memory (Vector RAG)
Implemented via **ChromaDB**, the system now stores embeddings of every incident. During triage, the AI retrieves similar past incidents to provide historical context.
- **Verification**: Logs show automatic retrieval of similar incidents when a new Highway 101 report was submitted.
- **Resilience**: The backend now handles the entire storage-retrieval pipeline asynchronously within `triage_engine.py`.

### 🔗 Relational Reasoning (Knowledge Graph)
Implemented via **Neo4j**, the platform builds a graph of incidents linked by location, entities, and vertical.
- **Relationships**: Automatically links incidents occurring at the same landmark (e.g., "Highway 101, Exit 42").
- **Audit**: The graph provides a "situational map" showing how events are correlated over time.

## 2. Spatial Intelligence (Interactive Maps)

### 🌍 Global Situation Map
The dashboard now features an interactive **Leaflet.js** map showing the real-time location and severity of all crisis events.
- **Marker Color Coding**: Red (Critical), Orange (High), Yellow (Medium) markers provide immediate visual triage.
- **Live Sync**: The map initializes with the latest `recent_incidents` data on dashboard load.

### 📍 Localized Triage Map
The Incident Detail view contains a localized map focused on the report's origin.
- **Geocoding Simulator**: Integrated a library for parsing Indian landmarks (e.g., "Mumbai Airport T2", "Red Fort") into GPS coordinates.
- **Marker Interaction**: Hovering over markers reveals the AI assessment summary.

## 3. High-Resilience AI Logic

### 🔄 Dual-Backend Orchestration
The AI service now supports seamless fallback from **Vertex AI (Gemini 2.0 Flash)** to local **Ollama (gemma3:12b)** if cloud connectivity or credentials fail.
- **Verification**: System successfully fell back to Ollama during local UAT when GCP credentials were restricted.
- **Vertical-Specific Reasoning**: Enhanced system prompts for **Emergency**, **Healthcare**, and **Disaster** categories ensure protocols align with Indian emergency service standards (100, 108).

### 🎙️ Augmented Voice Intelligence
The Voice Bot UI was polished with animated "listening" states and real-time transcripts.
- **Interactive Triage**: Users can listen to the AI's response via Text-to-Speech (TTS), enabling hands-free field reporting.

## 4. Verification & Deployment Readiness
- ✅ **API Health**: All routes (`/incidents`, `/actions`, `/dashboard/stats`) verified via `curl`.
- ✅ **Schema**: SQLite database migration complete with `triage_results` and `audit_log` tables.
- ✅ **Containerization**: Updated `Dockerfile` and `requirements.txt` to include ChromaDB and Neo4j drivers.

---
**Deployment Command (UAT Environment):**
```bash
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
