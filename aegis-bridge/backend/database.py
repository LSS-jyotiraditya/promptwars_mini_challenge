"""
Aegis Bridge - Database Layer
SQLite database with tables for incidents, triage results, actions, and audit logs.
"""

import sqlite3
import os
import json
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "aegis_bridge.db")


def get_connection():
    """Get a database connection with row factory."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Initialize the database with all required tables."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            vertical TEXT NOT NULL CHECK(vertical IN ('emergency', 'healthcare', 'disaster')),
            status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'triaged', 'action_pending', 'approved', 'rejected', 'closed')),
            input_text TEXT,
            input_files TEXT,  -- JSON array of file paths
            location TEXT,
            reported_by TEXT DEFAULT 'Anonymous',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS triage_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id INTEGER NOT NULL UNIQUE,
            severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
            summary TEXT NOT NULL,
            structured_output TEXT NOT NULL,  -- JSON: FHIR-like / CAP-like payload
            recommended_actions TEXT NOT NULL,  -- JSON array of action objects
            citations TEXT,  -- JSON array of citation objects
            confidence_score REAL DEFAULT 0.0,
            gemini_raw_response TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (incident_id) REFERENCES incidents(id)
        );

        CREATE TABLE IF NOT EXISTS actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id INTEGER NOT NULL,
            action_type TEXT NOT NULL,
            description TEXT NOT NULL,
            priority TEXT NOT NULL CHECK(priority IN ('critical', 'high', 'medium', 'low')),
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'executed')),
            approved_by TEXT,
            approved_at TEXT,
            payload TEXT,  -- JSON: structured action payload
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (incident_id) REFERENCES incidents(id)
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id INTEGER,
            event_type TEXT NOT NULL,
            event_detail TEXT NOT NULL,
            actor TEXT DEFAULT 'system',
            metadata TEXT,  -- JSON
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (incident_id) REFERENCES incidents(id)
        );
    """)

    conn.commit()
    conn.close()
    print(f"[DB] Database initialized at {DB_PATH}")


# ── Helper Functions ──────────────────────────────────────────────

def insert_incident(title, vertical, input_text=None, input_files=None, location=None, reported_by="Anonymous"):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO incidents (title, vertical, input_text, input_files, location, reported_by)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (title, vertical, input_text, json.dumps(input_files or []), location, reported_by)
    )
    incident_id = cursor.lastrowid
    conn.commit()

    # Audit log
    cursor.execute(
        """INSERT INTO audit_log (incident_id, event_type, event_detail, actor)
           VALUES (?, ?, ?, ?)""",
        (incident_id, "incident_created", f"New {vertical} incident: {title}", reported_by)
    )
    conn.commit()
    conn.close()
    return incident_id


def insert_triage_result(incident_id, severity, summary, structured_output, recommended_actions, citations, confidence, raw_response):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO triage_results (incident_id, severity, summary, structured_output, recommended_actions, citations, confidence_score, gemini_raw_response)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (incident_id, severity, summary, json.dumps(structured_output), json.dumps(recommended_actions), json.dumps(citations), confidence, raw_response)
    )
    # Update incident status
    cursor.execute("UPDATE incidents SET status = 'action_pending', updated_at = datetime('now') WHERE id = ?", (incident_id,))

    # Audit log
    cursor.execute(
        """INSERT INTO audit_log (incident_id, event_type, event_detail, actor)
           VALUES (?, ?, ?, ?)""",
        (incident_id, "triage_completed", f"AI triage completed. Severity: {severity}, Confidence: {confidence:.0%}", "gemini-ai")
    )
    conn.commit()
    conn.close()


def insert_action(incident_id, action_type, description, priority, payload=None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO actions (incident_id, action_type, description, priority, payload)
           VALUES (?, ?, ?, ?, ?)""",
        (incident_id, action_type, description, priority, json.dumps(payload or {}))
    )
    action_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return action_id


def approve_action(action_id, approved_by="operator"):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """UPDATE actions SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?""",
        (approved_by, action_id)
    )
    # Get incident_id for audit
    cursor.execute("SELECT incident_id, description FROM actions WHERE id = ?", (action_id,))
    row = cursor.fetchone()
    if row:
        cursor.execute(
            """INSERT INTO audit_log (incident_id, event_type, event_detail, actor)
               VALUES (?, ?, ?, ?)""",
            (row["incident_id"], "action_approved", f"Action approved: {row['description']}", approved_by)
        )
        # Check if all actions for this incident are resolved
        cursor.execute("SELECT COUNT(*) as pending FROM actions WHERE incident_id = ? AND status = 'pending'", (row["incident_id"],))
        if cursor.fetchone()["pending"] == 0:
            cursor.execute("UPDATE incidents SET status = 'approved', updated_at = datetime('now') WHERE id = ?", (row["incident_id"],))
    conn.commit()
    conn.close()


def reject_action(action_id, approved_by="operator"):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """UPDATE actions SET status = 'rejected', approved_by = ?, approved_at = datetime('now') WHERE id = ?""",
        (approved_by, action_id)
    )
    cursor.execute("SELECT incident_id, description FROM actions WHERE id = ?", (action_id,))
    row = cursor.fetchone()
    if row:
        cursor.execute(
            """INSERT INTO audit_log (incident_id, event_type, event_detail, actor)
               VALUES (?, ?, ?, ?)""",
            (row["incident_id"], "action_rejected", f"Action rejected: {row['description']}", approved_by)
        )
        cursor.execute("SELECT COUNT(*) as pending FROM actions WHERE incident_id = ? AND status = 'pending'", (row["incident_id"],))
        if cursor.fetchone()["pending"] == 0:
            cursor.execute("UPDATE incidents SET status = 'rejected', updated_at = datetime('now') WHERE id = ?", (row["incident_id"],))
    conn.commit()
    conn.close()


def get_incidents(limit=50, offset=0, vertical=None, status=None):
    conn = get_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM incidents WHERE 1=1"
    params = []
    if vertical:
        query += " AND vertical = ?"
        params.append(vertical)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def get_incident_detail(incident_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,))
    incident = cursor.fetchone()
    if not incident:
        conn.close()
        return None
    incident = dict(incident)

    cursor.execute("SELECT * FROM triage_results WHERE incident_id = ?", (incident_id,))
    triage = cursor.fetchone()
    incident["triage"] = dict(triage) if triage else None
    if incident["triage"]:
        for field in ["structured_output", "recommended_actions", "citations"]:
            if incident["triage"].get(field):
                incident["triage"][field] = json.loads(incident["triage"][field])

    cursor.execute("SELECT * FROM actions WHERE incident_id = ? ORDER BY created_at", (incident_id,))
    incident["actions"] = [dict(r) for r in cursor.fetchall()]
    for action in incident["actions"]:
        if action.get("payload"):
            action["payload"] = json.loads(action["payload"])

    if incident.get("input_files"):
        incident["input_files"] = json.loads(incident["input_files"])

    conn.close()
    return incident

def get_actions_for_incident(incident_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM actions WHERE incident_id = ? ORDER BY created_at", (incident_id,))
    actions = [dict(r) for r in cursor.fetchall()]
    for a in actions:
        if a.get("payload"):
            a["payload"] = json.loads(a["payload"])
    conn.close()
    return actions


def get_pending_actions():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.*, i.title as incident_title, i.vertical
        FROM actions a
        JOIN incidents i ON a.incident_id = i.id
        WHERE a.status = 'pending'
        ORDER BY
            CASE a.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
            a.created_at
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    for row in rows:
        if row.get("payload"):
            row["payload"] = json.loads(row["payload"])
    conn.close()
    return rows


def get_audit_log(limit=100, incident_id=None):
    conn = get_connection()
    cursor = conn.cursor()
    if incident_id:
        cursor.execute(
            "SELECT * FROM audit_log WHERE incident_id = ? ORDER BY created_at DESC LIMIT ?",
            (incident_id, limit)
        )
    else:
        cursor.execute("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def get_dashboard_stats():
    conn = get_connection()
    cursor = conn.cursor()

    stats = {}

    cursor.execute("SELECT COUNT(*) as total FROM incidents")
    stats["total_incidents"] = cursor.fetchone()["total"]

    cursor.execute("SELECT vertical, COUNT(*) as count FROM incidents GROUP BY vertical")
    stats["by_vertical"] = {row["vertical"]: row["count"] for row in cursor.fetchall()}

    cursor.execute("SELECT status, COUNT(*) as count FROM incidents GROUP BY status")
    stats["by_status"] = {row["status"]: row["count"] for row in cursor.fetchall()}

    cursor.execute("SELECT COUNT(*) as count FROM actions WHERE status = 'pending'")
    stats["pending_actions"] = cursor.fetchone()["count"]

    cursor.execute("""
        SELECT t.severity, COUNT(*) as count
        FROM triage_results t
        GROUP BY t.severity
    """)
    stats["by_severity"] = {row["severity"]: row["count"] for row in cursor.fetchall()}

    cursor.execute("SELECT * FROM incidents ORDER BY created_at DESC LIMIT 5")
    stats["recent_incidents"] = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return stats
