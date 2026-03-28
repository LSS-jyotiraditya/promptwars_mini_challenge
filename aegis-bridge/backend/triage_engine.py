"""
Aegis Bridge - Triage Engine
Orchestrates crisis analysis workflow: ingestion → Gemini analysis → structured output → action creation.
"""

import os
import json
from typing import Optional
from . import database as db
from . import ai_service


async def process_incident(
    incident_id: int,
    vertical: str,
    text_input: Optional[str] = None,
    image_data: Optional[list] = None,
    audio_transcript: Optional[str] = None,
    location: Optional[str] = None
):
    """
    Full triage pipeline for an incident.
    1. Calls AI Service for multimodal analysis
    2. Stores triage results
    3. Creates action items for human approval
    """
    try:
        # Step 1: AI Analysis
        result, raw_response = await ai_service.analyze_crisis(
            vertical=vertical,
            text_input=text_input,
            image_data=image_data,
            audio_transcript=audio_transcript,
            location=location
        )

        # Step 2: Extract fields from AI response
        severity = result.get("severity", "medium")
        confidence = result.get("confidence", 0.5)
        summary = result.get("summary", "Analysis completed.")
        
        # Build structured output based on vertical
        structured_output = _extract_structured_payload(result, vertical)
        recommended_actions = result.get("recommended_actions", [])
        citations = result.get("citations", [])

        # Step 3: Store triage result
        db.insert_triage_result(
            incident_id=incident_id,
            severity=severity,
            summary=summary,
            structured_output=structured_output,
            recommended_actions=recommended_actions,
            citations=citations,
            confidence=confidence,
            raw_response=raw_response
        )

        # Step 4: Create actionable items for human approval
        for action in recommended_actions:
            db.insert_action(
                incident_id=incident_id,
                action_type=action.get("action_type", "other"),
                description=action.get("description", "Review required"),
                priority=action.get("priority", "medium"),
                payload=action.get("details", {})
            )

        return {
            "status": "triaged",
            "severity": severity,
            "confidence": confidence,
            "summary": summary,
            "actions_created": len(recommended_actions)
        }

    except Exception as e:
        # Log the error and mark incident for manual review
        db.insert_triage_result(
            incident_id=incident_id,
            severity="high",
            summary=f"AI triage failed: {str(e)}. Manual review required.",
            structured_output={"error": str(e)},
            recommended_actions=[],
            citations=[],
            confidence=0.0,
            raw_response=str(e)
        )
        db.insert_action(
            incident_id=incident_id,
            action_type="manual_review",
            description=f"AI triage failed. Manual review required. Error: {str(e)[:200]}",
            priority="high",
            payload={"error": str(e)}
        )
        return {
            "status": "error",
            "error": str(e),
            "actions_created": 1
        }


def _extract_structured_payload(result: dict, vertical: str) -> dict:
    """Extract the vertical-specific structured payload from the AI response."""
    payload = result.get("structured_payload", {})
    
    if vertical == "emergency":
        assessment = result.get("situation_assessment", {})
        payload["situation_assessment"] = assessment
    elif vertical == "healthcare":
        assessment = result.get("clinical_assessment", {})
        payload["clinical_assessment"] = assessment
        payload["drug_interactions"] = result.get("drug_interactions", [])
    elif vertical == "disaster":
        assessment = result.get("disaster_assessment", {})
        payload["disaster_assessment"] = assessment
    
    return payload


def generate_demo_incident(vertical: str) -> dict:
    """Generate a realistic demo incident for testing."""
    demos = {
        "emergency": {
            "title": "Multi-Vehicle Accident on Highway 101",
            "text": """CALLER: Oh god, there's been a huge accident on Highway 101 near exit 42! 
            I can see at least 3 cars involved, one of them is flipped over. There's smoke coming 
            from the engine of the flipped car. I can see someone trying to crawl out of the passenger 
            side. There are people standing on the shoulder looking hurt — one woman is holding her arm 
            and there's blood on her face. Traffic is completely stopped in both directions. I think 
            I heard a child crying from one of the cars. Please send help fast!""",
            "location": "Highway 101, Exit 42, Northbound lanes"
        },
        "healthcare": {
            "title": "Emergency Room Walk-in - Chest Pain",
            "text": """Patient: 67-year-old male, arrived by private vehicle complaining of severe chest pain 
            radiating to the left arm, started approximately 45 minutes ago while gardening. Patient appears 
            diaphoretic and anxious. States he takes Metoprolol 50mg daily for hypertension and Warfarin for 
            atrial fibrillation. He's allergic to Penicillin (causes hives). Reports similar but milder episode 
            2 weeks ago that resolved on its own. Family history of MI — father died at age 62 of heart attack. 
            Patient is a former smoker (quit 5 years ago, 30 pack-year history). Vitals pending but 
            BP appears elevated on manual check. Patient also mentions taking aspirin 81mg daily and 
            occasional ibuprofen for knee pain.""",
            "location": "St. Mary's Hospital Emergency Department"
        },
        "disaster": {
            "title": "Flash Flooding in Cedar Valley Region",
            "text": """FIELD REPORT: Major flash flooding in Cedar Valley after 6 inches of rain in 3 hours. 
            The main bridge on Route 9 is underwater and impassable. At least 200 residents in the Riverside 
            mobile home park are trapped — water levels at 4 feet and rising. The Cedar Valley Elementary 
            School is being used as an emergency shelter but is at capacity (300 people). We've lost power 
            to the entire eastern grid. Cell towers are intermittent. The local hospital (Cedar Valley Medical) 
            reports backup generators are running but diesel supply is limited to 18 hours. 
            Water treatment plant was breached — DO NOT DRINK tap water advisory issued. We need 
            rescue boats, additional shelter capacity, potable water, and medical supplies urgently. 
            Weather service reports another storm cell approaching in 4-6 hours.""",
            "location": "Cedar Valley, State Route 9 corridor"
        }
    }
    return demos.get(vertical, demos["emergency"])
