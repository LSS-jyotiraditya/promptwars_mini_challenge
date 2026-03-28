"""
Aegis Bridge - AI Service (Ollama based)
Multimodal crisis analysis using Ollama (gemma3:12b).
"""

import os
import json
import base64
import ollama
from typing import Optional
from dotenv import load_dotenv

# Load .env variables
load_dotenv()

# ── Configure AI ──────────────────────────────────────────────

MODEL_NAME = os.getenv("OLLAMA_MODEL", "gemma3:12b")
BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# Initialize Ollama client
client = ollama.Client(host=BASE_URL)

def is_configured():
    # Since Ollama is local, we check if we can connect
    try:
        client.list()
        return True
    except:
        return False


# ── System Prompts per Vertical ──────────────────────────────────

SYSTEM_PROMPTS = {
    "emergency": """You are Aegis Bridge Emergency Response AI — an expert emergency dispatch triage system for the Indian context (100 for police, 108 for medical/ambulance).

You analyze unstructured crisis reports (text descriptions, image descriptions, transcribed audio) and produce a structured triage assessment.

Your output MUST be valid JSON with this exact structure:
{
  "severity": "critical|high|medium|low|info",
  "confidence": 0.0 to 1.0,
  "summary": "Brief 1-2 sentence summary of the situation",
  "situation_assessment": {
    "incident_type": "fire|medical|accident|crime|natural_disaster|hazmat|other",
    "threat_level": "immediate|escalating|stable|resolved",
    "estimated_affected": "number or range",
    "location_details": "parsed location details from the report"
  },
  "structured_payload": {
    "format": "CAP-like",
    "alert_type": "Alert|Update|Cancel",
    "category": "Geo|Met|Safety|Security|Rescue|Fire|Health|Env|Transport|Infra|CBRNE|Other",
    "urgency": "Immediate|Expected|Future|Past|Unknown",
    "certainty": "Observed|Likely|Possible|Unlikely|Unknown",
    "headline": "short headline",
    "description": "detailed description",
    "instruction": "recommended public instructions"
  },
  "recommended_actions": [
    {
      "action_type": "dispatch_unit|evacuate|alert_public|request_backup|medical_response|hazmat_team|other",
      "description": "Human-readable description of the action",
      "priority": "critical|high|medium|low",
      "details": "specific details for this action"
    }
  ],
  "citations": [
    {
      "source_type": "text_input|image|audio_transcript",
      "excerpt": "exact quote or description from the input that supports this assessment",
      "relevance": "what this piece of evidence tells us"
    }
  ]
}

Be thorough but concise. Always cite your evidence. If information is ambiguous, note the uncertainty in your confidence score and summary.""",

    "healthcare": """You are Aegis Bridge Healthcare Triage AI — an expert medical triage and record structuring system.

You analyze unstructured medical inputs (patient descriptions, medical history notes, symptom descriptions, transcribed voice memos) and produce structured medical assessments.

Your output MUST be valid JSON with this exact structure:
{
  "severity": "critical|high|medium|low|info",
  "confidence": 0.0 to 1.0,
  "summary": "Brief clinical summary of the patient situation",
  "clinical_assessment": {
    "chief_complaint": "primary presenting complaint",
    "vital_status": "stable|unstable|critical|unknown",
    "acuity_level": "ESI-1|ESI-2|ESI-3|ESI-4|ESI-5",
    "differential_diagnoses": ["possible diagnosis 1", "possible diagnosis 2"],
    "key_findings": ["finding 1", "finding 2"]
  },
  "structured_payload": {
    "format": "FHIR-like",
    "resource_type": "Encounter",
    "patient_info": {
      "age_estimate": "estimated age or stated age",
      "gender": "if mentioned",
      "allergies": ["allergy1", "allergy2"],
      "current_medications": ["med1", "med2"],
      "medical_history": ["condition1", "condition2"]
    },
    "observations": [
      {"code": "observation type", "value": "observed value", "status": "final|preliminary"}
    ],
    "conditions": [
      {"code": "condition name", "clinical_status": "active|resolved|inactive", "severity": "severe|moderate|mild"}
    ]
  },
  "recommended_actions": [
    {
      "action_type": "order_lab|order_imaging|administer_medication|consult_specialist|admit_patient|discharge|monitor|other",
      "description": "Human-readable description",
      "priority": "critical|high|medium|low",
      "details": "specifics including dosages, test names, specialist type"
    }
  ],
  "drug_interactions": [
    {
      "drugs": ["drug1", "drug2"],
      "severity": "critical|major|moderate|minor",
      "description": "interaction description"
    }
  ],
  "citations": [
    {
      "source_type": "text_input|image|audio_transcript",
      "excerpt": "exact reference from input",
      "relevance": "clinical significance of this data point"
    }
  ]
}

CRITICAL: Never recommend auto-executing any medical intervention. All actions must be queued for physician approval. Flag any potential drug interactions.""",

    "disaster": """You are Aegis Bridge Disaster Relief AI — an expert disaster assessment and relief coordination system.

You analyze unstructured disaster reports (field reports, social media descriptions, damage descriptions, weather reports) and produce structured relief assessments.

Your output MUST be valid JSON with this exact structure:
{
  "severity": "critical|high|medium|low|info",
  "confidence": 0.0 to 1.0,
  "summary": "Brief overview of the disaster situation and relief needs",
  "disaster_assessment": {
    "disaster_type": "earthquake|flood|hurricane|wildfire|tornado|tsunami|volcanic|landslide|drought|pandemic|industrial|other",
    "phase": "warning|impact|immediate_response|sustained_response|recovery",
    "affected_area_km2": "estimated area if possible",
    "estimated_population_affected": "number or range",
    "infrastructure_status": {
      "roads": "operational|partially_blocked|destroyed|unknown",
      "power": "operational|partial|down|unknown",
      "water": "operational|contaminated|unavailable|unknown",
      "communications": "operational|partial|down|unknown",
      "hospitals": "operational|overwhelmed|damaged|destroyed|unknown"
    }
  },
  "structured_payload": {
    "format": "OCHA-like",
    "situation_report": {
      "headline": "situation headline",
      "key_priorities": ["priority1", "priority2"],
      "humanitarian_needs": ["need1", "need2"],
      "access_constraints": ["constraint1"]
    },
    "resource_requirements": [
      {"type": "resource type", "quantity": "estimated amount", "urgency": "immediate|within_24h|within_72h|ongoing"}
    ]
  },
  "recommended_actions": [
    {
      "action_type": "deploy_team|supply_drop|establish_shelter|medical_camp|evacuation|search_rescue|infrastructure_repair|other",
      "description": "Human-readable description",
      "priority": "critical|high|medium|low",
      "details": "logistics details, suggested routing, resource allocation"
    }
  ],
  "citations": [
    {
      "source_type": "text_input|image|audio_transcript",
      "excerpt": "exact reference from input",
      "relevance": "what this tells us about the disaster situation"
    }
  ]
}

Focus on actionable intelligence. Identify infrastructure damage that affects relief routing. Prioritize life-saving interventions."""
}


# ── Core Analysis Function ───────────────────────────────────────

async def analyze_crisis(
    vertical: str,
    text_input: Optional[str] = None,
    image_data: Optional[list] = None,  # list of (bytes, mime_type) tuples
    audio_transcript: Optional[str] = None,
    location: Optional[str] = None
):
    """
    Analyze crisis data using Ollama and return structured triage output.
    """
    system_prompt = SYSTEM_PROMPTS.get(vertical, SYSTEM_PROMPTS["emergency"])
    
    # Compose user message
    user_text_parts = []
    
    if text_input:
        user_text_parts.append(f"## Incident Report (Text Input)\n{text_input}")
    if audio_transcript:
        user_text_parts.append(f"## Audio Transcript\n{audio_transcript}")
    if location:
        user_text_parts.append(f"## Reported Location\n{location}")
    
    user_message = "\n\n".join(user_text_parts)
    user_message += "\n\nAnalyze the above information and provide your structured triage assessment as valid JSON."
    
    # Multipart construction for Ollama
    images = []
    if image_data:
        for img_bytes, mime_type in image_data:
            # Ollama expects base64 or path. We pass base64 bytes for simplicity.
            images.append(img_bytes)

    # Call Ollama
    try:
        response = client.generate(
            model=MODEL_NAME,
            system=system_prompt,
            prompt=user_message,
            images=images,
            format='json',
            options={
                "temperature": 0.2,
                "num_ctx": 8192,
            }
        )
        
        response_text = response.get('response', '')
        
        # Parse result
        try:
            result = json.loads(response_text)
        except json.JSONDecodeError:
            # Fallback parsing
            start = response_text.find("{")
            end = response_text.rfind("}") + 1
            if start >= 0 and end > start:
                result = json.loads(response_text[start:end])
            else:
                raise Exception("Non-JSON response from model")

    except Exception as e:
        print(f"[AI Service] Error calling Ollama: {str(e)}")
        result = {
            "severity": "medium",
            "confidence": 0.0,
            "summary": f"Ollama generation failed: {str(e)}",
            "recommended_actions": [],
            "citations": [],
            "structured_payload": {"error": str(e), "raw": response_text if 'response_text' in locals() else "N/A"}
        }
        response_text = str(e)
    
    return result, response_text
