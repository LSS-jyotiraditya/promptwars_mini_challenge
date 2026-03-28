"""
Aegis Bridge - AI Service (Gemini API + Ollama Fallback)
Multimodal crisis analysis with token-optimized prompts.
Supports: Text, Image, and Voice (via browser STT transcript).
"""

import os
import json
import logging
from typing import Optional
from dotenv import load_dotenv, find_dotenv
import asyncio

# CRITICAL: Load from project root OR backend folder BEFORE assigning constants
load_dotenv(find_dotenv())
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# ── Configuration ──────────────────────────────────────────────

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GCP_PROJECT = os.getenv("GCP_PROJECT", "")
GCP_LOCATION = os.getenv("GCP_LOCATION", "us-central1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:12b")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
AI_BACKEND = os.getenv("AI_BACKEND", "gemini")  # "gemini" or "ollama"

_gemini_client = None
_ollama_client = None


def _get_gemini():
    global _gemini_client
    if _gemini_client is None:
        try:
            from google import genai
            # PRIORITIZE API KEY if provided (more robust for UAT than ADC)
            if GEMINI_API_KEY:
                # Standard Gemini AI Mode
                _gemini_client = genai.Client(api_key=GEMINI_API_KEY)
            elif GCP_PROJECT:
                # Vertex AI Mode (Requires 'gcloud auth application-default login')
                _gemini_client = genai.Client(vertexai=True, project=GCP_PROJECT, location=GCP_LOCATION)
            else:
                print("⚠️  Warning: No AI credentials found. Check .env for GEMINI_API_KEY.")
        except Exception as e:
            print(f"❌ Failed to initialize Gemini: {e}")
            return None
    return _gemini_client


def _get_ollama():
    global _ollama_client
    if _ollama_client is None:
        import ollama
        _ollama_client = ollama.Client(host=OLLAMA_BASE_URL)
    return _ollama_client


def is_configured():
    if AI_BACKEND == "gemini":
        return bool(GEMINI_API_KEY or GCP_PROJECT)
    try:
        if OLLAMA_MODEL: return True
        return False
    except:
        return False


def get_backend_info():
    if AI_BACKEND == "gemini":
        if GEMINI_API_KEY:
            return f"Standard Gemini API (Key: {GEMINI_API_KEY[:4]}...{GEMINI_API_KEY[-4:]})"
        if GCP_PROJECT:
            return f"Vertex AI (Project: {GCP_PROJECT})"
    return f"Ollama ({OLLAMA_MODEL})"


# ── Token-Optimized System Prompts ──────────────────────────────
# Compressed to ~40% fewer tokens while retaining all key structure

SYSTEM_PROMPTS = {
    "emergency": """You are the Aegis Bridge Emergency AI (India). 
Mission: Rapid triage for Police (100), Ambulance (108), and Fire (101).

CONTEXT GUIDELINES:
1. If 'RELATED PAST INCIDENTS' are provided, check if the current report is a DUPLICATE or RELATED to an ongoing event.
2. Prioritize life-safety and first-responder mobilization.
3. Use Indian terminology (e.g., 'nullah' for drain, 'chawl' for housing, specific city landmarks).

OUTPUT VALID JSON:
{
  "severity": "critical|high|medium|low|info",
  "confidence": 0.0-1.0,
  "summary": "Precise situational summary (2 sentences)",
  "situation_assessment": {
    "incident_type": "fire|medical|accident|crime|natural_disaster|hazmat|other",
    "threat_level": "immediate|escalating|stable|resolved",
    "is_duplicate_potential": true|false,
    "estimated_affected": "numeric estimate",
    "location_details": "parsed landmarks/address"
  },
  "structured_payload": {
    "format": "CAP-1.2",
    "alert_type": "Alert|Update|Cancel",
    "category": "Safety|Security|Rescue|Fire|Health|Transport|Other",
    "urgency": "Immediate|Expected|Future",
    "certainty": "Observed|Likely",
    "headline": "Action-oriented headline",
    "instruction": "Instructions for public/dispatch"
  },
  "recommended_actions": [
    {
      "action_type": "dispatch_unit|evacuate|alert_public|request_backup|medical_response",
      "description": "Clear directive",
      "priority": "critical|high|medium",
      "details": "Specifics (e.g. 'Send CATS ambulance', 'Mobilize NDRF unit')"
    }
  ],
  "citations": [{"source_type": "text|image|voice", "excerpt": "verbatim evidence", "relevance": "why it matters"}]
}""",

    "healthcare": """You are the Aegis Bridge Healthcare Triage AI (India).
Mission: Clinical intake and acuity assessment for Indian Tertiary Care.

CONTEXT GUIDELINES:
1. Analyze symptoms vs 'RELATED PAST INCIDENTS' (check for patient history or disease clusters).
2. Use ESI (Emergency Severity Index) for acuity.
3. Flag high-risk drug interactions or allergies mentioned in history/input.

OUTPUT VALID JSON:
{
  "severity": "critical|high|medium|low",
  "confidence": 0.0-1.0,
  "summary": "Clinical impression summary",
  "clinical_assessment": {
    "chief_complaint": "primary symptom",
    "vital_status": "stable|unstable|critical",
    "acuity_level": "ESI-1|ESI-2|ESI-3|ESI-4|ESI-5",
    "key_findings": ["finding1", "finding2"]
  },
  "structured_payload": {
    "resource_type": "Encounter",
    "patient_info": {"age": "est", "gender": "if known", "history": []},
    "observations": [{"code": "LOINC_CODE", "value": "val"}]
  },
  "recommended_actions": [
    {
      "action_type": "order_lab|order_imaging|administer_medication|consult_specialist|admit",
      "description": "Clinical directive",
      "priority": "high|medium|low",
      "details": "Specific dosage or test name"
    }
  ],
  "drug_interactions": [{"drugs": ["a", "b"], "severity": "major|minor", "description": "why"}],
  "citations": [{"source_type": "text|image|voice", "excerpt": "evidence"}]
}""",

    "disaster": """You are the Aegis Bridge Disaster AI (NDRF/SDMA).
Mission: Large-scale situational awareness and resource allocation.

CONTEXT GUIDELINES:
1. Compare with 'RELATED PAST INCIDENTS' to track disaster progression (e.g. rising water levels, spreading fire).
2. Prioritize infrastructure integrity (Power/Water/Telecom) and access routes.

OUTPUT VALID JSON:
{
  "severity": "critical|high|medium|low",
  "confidence": 0.0-1.0,
  "summary": "Disaster situational summary",
  "disaster_assessment": {
    "type": "flood|earthquake|industrial|etc",
    "phase": "warning|impact|response|recovery",
    "infrastructure_status": {
        "roads": "green|yellow|red",
        "power": "green|yellow|red",
        "hospitals": "green|yellow|red"
    }
  },
  "structured_payload": {
    "resource_requirements": [{"type": "team|supplies", "qty": "val", "urgency": "high"}],
    "access_constraints": ["constraint1"]
  },
  "recommended_actions": [
    {
      "action_type": "deploy_team|supply_drop|establish_shelter|evacuation|search_rescue",
      "description": "Strategic directive",
      "priority": "critical|high|medium",
      "details": "Logistical details"
    }
  ],
  "citations": [{"source_type": "text|image|voice", "excerpt": "evidence"}]
}"""
}


# ── Voice Summary Prompt (ultra-compact for TTS) ────────────────

VOICE_SUMMARY_PROMPT = """Given this triage JSON, produce a brief spoken summary (2-3 sentences max) for an emergency operator. Include: severity, key finding, and top priority action. Be direct and clear. Output ONLY the spoken text, no JSON."""


# ── Core Analysis Function ───────────────────────────────────────

async def analyze_crisis(
    vertical: str,
    text_input: Optional[str] = None,
    image_data: Optional[list] = None,
    audio_transcript: Optional[str] = None,
    location: Optional[str] = None
):
    system_prompt = SYSTEM_PROMPTS.get(vertical, SYSTEM_PROMPTS["emergency"])

    # Build user message (compact)
    parts = []
    if text_input:
        parts.append(f"REPORT:\n{text_input}")
    if audio_transcript:
        parts.append(f"VOICE TRANSCRIPT:\n{audio_transcript}")
    if location:
        parts.append(f"LOCATION: {location}")
    
    user_message = "\n\n".join(parts) if parts else "No input provided."
    user_message += "\n\nProvide structured triage JSON."

    if AI_BACKEND == "gemini":
        try:
            return await _call_gemini(system_prompt, user_message, image_data)
        except Exception as e:
            # Automatic fallback to Ollama if Gemini fails (e.g. 429 Quota Exceeded)
            print(f"⚠️ Gemini failed ({str(e)}). Falling back to Ollama ({OLLAMA_MODEL})...")
            try:
                result, raw = await _call_ollama(system_prompt, user_message, image_data)
                # Mark that this was a fallback result
                if isinstance(result, dict):
                    result["backend_info"] = f"Ollama Fallback (Gemini Error: {str(e)[:50]})"
                return result, raw
            except Exception as ollama_e:
                raise Exception(f"Primary (Gemini) and Fallback (Ollama) both failed. Gemini: {e}, Ollama: {ollama_e}")
    else:
        return await _call_ollama(system_prompt, user_message, image_data)


async def generate_voice_summary(triage_json: dict) -> str:
    """Generate a concise spoken summary from triage results (for TTS)."""
    summary_input = f"{VOICE_SUMMARY_PROMPT}\n\nTriage JSON:\n{json.dumps(triage_json, indent=0)}"
    
    if AI_BACKEND == "gemini":
        try:
            from google.genai import types
            client = _get_gemini()
            if not client:
                 raise Exception("Gemini client not initialized - check credentials.")
            # Use Async Client (aio)
            response = await client.aio.models.generate_content(
                model="gemini-2.0-flash",
                contents=[types.Content(role="user", parts=[types.Part.from_text(text=summary_input)])],
                config=types.GenerateContentConfig(temperature=0.3, max_output_tokens=150)
            )
            return response.text.strip()
        except Exception as e:
            return triage_json.get("summary", f"Triage complete. Severity: {triage_json.get('severity', 'unknown')}")
    else:
        return triage_json.get("summary", f"Triage complete. Severity: {triage_json.get('severity', 'unknown')}")


# ── Gemini Backend ───────────────────────────────────────────────

async def _call_gemini(system_prompt: str, user_message: str, image_data: Optional[list] = None):
    from google.genai import types
    client = _get_gemini()
    
    parts = [types.Part.from_text(text=user_message)]
    
    if image_data:
        for img_bytes, mime_type in image_data:
            parts.append(types.Part.from_bytes(data=img_bytes, mime_type=mime_type))
        parts.append(types.Part.from_text(text="Include visual evidence in analysis."))
    
    contents = [types.Content(role="user", parts=parts)]
    
    # Use Async Client (aio)
    response = await client.aio.models.generate_content(
        model="gemini-2.0-flash",
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            temperature=0.2,
            max_output_tokens=2048
        )
    )
    
    response_text = response.text.strip()
    result = _parse_json_response(response_text)
    return result, response_text


# ── Ollama Backend ───────────────────────────────────────────────

async def _call_ollama(system_prompt: str, user_message: str, image_data: Optional[list] = None):
    client = _get_ollama()
    
    images = []
    if image_data:
        for img_bytes, mime_type in image_data:
            images.append(img_bytes)

    # Wrap synchronous ollama call in to_thread to avoid blocking event loop
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, lambda: client.generate(
        model=OLLAMA_MODEL,
        system=system_prompt,
        prompt=user_message,
        images=images if images else None,
        format='json',
        options={"temperature": 0.2, "num_ctx": 8192}
    ))
    
    response_text = response.get('response', '')
    result = _parse_json_response(response_text)
    return result, response_text


# ── JSON Parser ──────────────────────────────────────────────────

def _parse_json_response(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except:
                pass
        return {
            "severity": "medium",
            "confidence": 0.0,
            "summary": "Failed to parse AI response. Manual review required.",
            "recommended_actions": [],
            "citations": [],
            "structured_payload": {"error": "JSON parse failed", "raw": text[:500]}
        }
