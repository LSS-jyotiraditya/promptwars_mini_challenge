"""
Aegis Bridge - Triage Engine
Orchestrates crisis analysis workflow: ingestion → Gemini analysis → structured output → action creation.
"""

import os
import json
from typing import Optional
import backend.database as db
import backend.ai_service as ai_service


async def process_incident(
    incident_id: int,
    vertical: str,
    text_input: Optional[str] = None,
    image_data: Optional[list] = None,
    audio_transcript: Optional[str] = None,
    location: Optional[str] = None
):
    """
    Full triage pipeline for an incident with RAG & Knowledge Graph.
    1. Retrieval: Find similar past incidents (Vector DB) and related entities (Graph)
    2. Analysis: AI analysis with context
    3. Storage: Store results and sync to graph/vector DB
    """
    import backend.knowledge_service as ks
    
    try:
        # Step 1: Retrieval (RAG)
        context_query = f"{text_input or ''} {audio_transcript or ''} {location or ''}".strip()
        past_incidents = await ks.query_related_incidents(context_query, n_results=2)
        
        # Format context for AI
        context_str = ""
        if past_incidents:
            context_str = "\n\nRELATED PAST INCIDENTS (for context):\n"
            for p in past_incidents:
                severity = p['metadata'].get('severity', 'unknown')
                context_str += f"- [{severity.upper()}] {p['text'][:200]}...\n"

        # Step 2: AI Analysis
        result, raw_response = await ai_service.analyze_crisis(
            vertical=vertical,
            text_input=f"{text_input}\n{context_str}" if context_str else text_input,
            image_data=image_data,
            audio_transcript=audio_transcript,
            location=location
        )

        # Step 3: Extract fields
        severity = result.get("severity", "medium")
        confidence = result.get("confidence", 0.5)
        summary = result.get("summary", "Analysis completed.")
        
        # Build structured output based on vertical
        structured_output = _extract_structured_payload(result, vertical)
        recommended_actions = result.get("recommended_actions", [])
        citations = result.get("citations", [])

        # Step 4: Store triage result
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

        # Step 5: Sync to Knowledge Bases (Background/Async)
        await ks.upsert_incident_embedding(incident_id, context_query, {"severity": severity, "vertical": vertical})
        await ks.sync_incident_to_graph(incident_id, {"title": summary, "vertical": vertical, "severity": severity, "location": location})

        # Step 6: Create actionable items for human approval
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
        print(f"❌ Error during incident triage: {str(e)}")
        # Check if triage result already exists before attempting error record
        # In case it failed AFTER the first insert in Step 4
        existing = db.get_incident_detail(incident_id)
        if not (existing and existing.get("triage")):
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
        
        # Always try to insert a manual review action if no actions were created yet
        actions = db.get_actions_for_incident(incident_id) if incident_id else []
        if not actions:
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
