# Aegis Bridge | AI-Powered Crisis Triage Platform 🛡️

Aegis Bridge is a high-performance, asynchronous crisis response platform designed to automate situational intelligence and triage for Indian public safety and healthcare sectors. Powered by **Gemini 2.0 Flash** with a robust, local **CUDA-accelerated RAG** fallback (Gemma-3:12B).

## 🚀 Key Features

-   **🎙️ Multi-modal Crisis Triage**: Unified processing of Voice (STT), Text, and Image. Voice Bot includes a manual fallback for network-restricted environments.
-   **⚡ Asynchronous Situational Analysis**: AI triage, RAG retrieval (ChromaDB), and Knowledge Graph (Neo4j) synchronization run in background threads, keeping the frontend 100% responsive.
-   **📦 CUDA Intelligence Core**: Automatic detection and utilization of GPU resources for embeddings (`all-MiniLM-L6-v2`) and local LLM fallbacks.
-   **🌍 Spatial Intelligence**: Interactive Leaflet.js maps withIndian landmark geocoding.
-   **📈 Human-In-The-Loop**: Auto-generated action queue with audit trails for full operational compliance.

## 🛠️ Technology Stack

-   **Backend**: FastAPI (Python 3.12), Pydantic, asyncio.
-   **AI Core**: Google Gemini 2.0 Flash (Cloud), Ollama/Gemma-3 (Local/CUDA).
-   **Discovery**: ChromaDB (Vector RAG), Neo4j (Graph).
-   **Frontend**: Vanilla HTML5/CSS3 (Glassmorphism), Leaflet.js, Web Speech API.

## 🏁 Getting Started (Local UAT)

1.  **Configure environment**: Add your `GEMINI_API_KEY` to `backend/.env`.
2.  **Run the bootstrapper**:
    ```bash
    fuser -k 8000/tcp || true; ./venv/bin/python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
    ```
3.  **Access the Dashboard**: [http://localhost:8000](http://localhost:8000)

## ☁️ Cloud Deployment

### Google Cloud Run

To deploy Aegis Bridge to Cloud Run:

```bash
# Authenticate and set project
gcloud auth application-default login
gcloud config set project earnest-trilogy-491607-q0

# Build and deploy
gcloud run deploy aegis-bridge \
    --source . \
    --region us-central1 \
    --allow-unauthenticated \
    --set-env-vars="GEMINI_API_KEY=your_key,GCP_PROJECT=earnest-trilogy-491607-q0"
```

## 📜 Audit & Compliance
The platform maintains a complete `Audit Trail` of every AI decision and human action, stored in a localized SQLite persistence layer.
