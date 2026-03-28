"""
Aegis Bridge - Knowledge Service
Handles long-term memory (Vector DB via ChromaDB) and relational reasoning (Graph via Neo4j).
"""

import os
import json
import uuid
import numpy as np
import asyncio
import chromadb
from typing import List, Dict, Any, Optional
from datetime import datetime
from neo4j import GraphDatabase
from dotenv import load_dotenv, find_dotenv
from concurrent.futures import ThreadPoolExecutor

# Load from project root OR backend folder
load_dotenv(find_dotenv())
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Pre-import heavy libs
try:
    import torch
    from chromadb.utils import embedding_functions
except ImportError:
    torch = None
    embedding_functions = None

load_dotenv()

# ── Configuration ──────────────────────────────────────────────

CHROMA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "chroma")
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")

os.makedirs(CHROMA_PATH, exist_ok=True)
_executor = ThreadPoolExecutor(max_workers=10)

# ── Clients ────────────────────────────────────────────────────

_chroma_client = None
_neo4j_driver = None
_embedding_fn = None
_executor = ThreadPoolExecutor(max_workers=10)

def get_chroma():
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
    return _chroma_client

def get_embedding_fn():
    """Returns a GPU-enabled embedding function if available (cached)."""
    global _embedding_fn
    if _embedding_fn is not None:
        return _embedding_fn
        
    try:
        if embedding_functions is None: return None
        # Default to CUDA if torch says it's available
        device = "cuda" if (torch and torch.cuda.is_available()) else "cpu"
        print(f"📦 Intelligence Core: Initializing embedding on {device}")
        _embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2",
            device=device
        )
        return _embedding_fn
    except Exception as e:
        print(f"⚠️ Custom embedding failed: {e}. Falling back to default.")
        return None

def get_neo4j():
    global _neo4j_driver
    # We use -1 as a sentinel to mean 'connection failed previously' to avoid retries
    if _neo4j_driver is None:
        try:
            print("🔗 Checking Knowledge Graph connectivity...")
            _neo4j_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
            # Set a low timeout for connectivity check
            _neo4j_driver.verify_connectivity()
            print("✅ Neo4j connection established.")
        except Exception as e:
            print(f"⚠️ Neo4j Knowledge Graph unavailable: {e}")
            _neo4j_driver = -1 # Mark as failed to prevent retries
            return None
            
    if _neo4j_driver == -1:
        return None
    return _neo4j_driver

# ── Vector DB Operations (RAG) ────────────────────────────────

async def upsert_incident_embedding(incident_id: int, text: str, metadata: Dict[str, Any]):
    """Embed and store incident text for future retrieval (running in separate thread)."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(_executor, _sync_upsert, incident_id, text, metadata)

def _sync_upsert(incident_id: int, text: str, metadata: Dict[str, Any]):
    client = get_chroma()
    ef = get_embedding_fn()
    collection = client.get_or_create_collection(name="incidents", embedding_function=ef)
    collection.add(
        documents=[text],
        metadatas=[metadata],
        ids=[str(incident_id)]
    )

async def query_related_incidents(query_text: str, n_results: int = 3) -> List[Dict[str, Any]]:
    """Retrieve similar past incidents to provide context for AI triage (non-blocking)."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _sync_query, query_text, n_results)

def _sync_query(query_text: str, n_results: int = 3):
    try:
        client = get_chroma()
        ef = get_embedding_fn()
        collection = client.get_collection(name="incidents", embedding_function=ef)
        results = collection.query(
            query_texts=[query_text],
            n_results=n_results
        )
        
        formatted = []
        if results['documents']:
            for i in range(len(results['documents'][0])):
                formatted.append({
                    "text": results['documents'][0][i],
                    "metadata": results['metadatas'][0][i],
                    "distance": results['distances'][0][i] if 'distances' in results else 0
                })
        return formatted
    except:
        return []

# ── Knowledge Graph Operations (Neo4j) ───────────────────────

async def sync_incident_to_graph(incident_id: int, data: Dict[str, Any]):
    """Create or update nodes/relationships in Neo4j (non-blocking)."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(_executor, _sync_graph, incident_id, data)

def _sync_graph(incident_id: int, data: Dict[str, Any]):
    """Create or update nodes/relationships in Neo4j for an incident."""
    driver = get_neo4j()
    if not driver: return

    with driver.session() as session:
        # Create Incident node
        session.execute_write(_create_incident_node, incident_id, data)
        
        # Extract and link entities (e.g., locations, phone numbers, entities)
        vertical = data.get("vertical", "emergency")
        if vertical == "emergency":
            location = data.get("location")
            if location:
                session.execute_write(_link_location, incident_id, location)
        
        # You can add more complex extraction here later

def _create_incident_node(tx, incident_id: int, data: Dict[str, Any]):
    query = (
        "MERGE (i:Incident {id: $id}) "
        "SET i.title = $title, i.vertical = $vertical, i.severity = $severity, i.created_at = $created_at "
        "RETURN i"
    )
    tx.run(query, id=incident_id, title=data.get("title"), 
           vertical=data.get("vertical"), severity=data.get("severity", "unknown"),
           created_at=str(datetime.now()))

def _link_location(tx, incident_id: int, location: str):
    query = (
        "MATCH (i:Incident {id: $id}) "
        "MERGE (l:Location {name: $loc_name}) "
        "MERGE (i)-[:OCCURRED_AT]->(l) "
        "RETURN i, l"
    )
    tx.run(query, id=incident_id, loc_name=location)

def get_related_graph_entities(incident_id: int) -> List[Dict[str, Any]]:
    """Find related incidents via shared entities in the graph."""
    driver = get_neo4j()
    if not driver: return []

    with driver.session() as session:
        query = (
            "MATCH (i:Incident {id: $id})-[:OCCURRED_AT]->(l:Location)<-[:OCCURRED_AT]-(other:Incident) "
            "WHERE other.id <> $id "
            "RETURN other.id as id, other.title as title, other.severity as severity, l.name as location "
            "LIMIT 5"
        )
        result = session.run(query, id=incident_id)
        return [dict(record) for record in result]
