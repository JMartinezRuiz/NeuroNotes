from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

ROOT_DIR = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.getenv("NEURONOTES_DB_PATH", str(ROOT_DIR / "data" / "neuronotes.db")))
VECTOR_DIMENSIONS = 256
VECTOR_MODEL = "local-hash-v2"
DATA_IMAGE_PATTERN = re.compile(r"!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]+\)", re.IGNORECASE)
MARKDOWN_IMAGE_PATTERN = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")


def utc_now() -> str:
  return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
  DB_PATH.parent.mkdir(parents=True, exist_ok=True)
  connection = sqlite3.connect(DB_PATH, timeout=5.0)
  connection.row_factory = sqlite3.Row
  connection.execute("PRAGMA foreign_keys = ON")
  connection.execute("PRAGMA journal_mode = WAL")
  connection.execute("PRAGMA busy_timeout = 5000")
  return connection


def init_database() -> None:
  with connect() as connection:
    connection.executescript(
      """
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        color TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ready',
        permissions TEXT NOT NULL DEFAULT '[]',
        pending_writes INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        goal TEXT NOT NULL,
        status TEXT NOT NULL,
        canonical_summary TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        folder TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'General',
        created_by_agent_id TEXT NOT NULL,
        color TEXT NOT NULL,
        token_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(created_by_agent_id) REFERENCES agents(id)
      );

      CREATE TABLE IF NOT EXISTS note_compressions (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        level TEXT NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER NOT NULL DEFAULT 0,
        model_used TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(note_id) REFERENCES notes(id)
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        source_note_id TEXT,
        source_agent_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(source_agent_id) REFERENCES agents(id)
      );

      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        text TEXT NOT NULL,
        status TEXT NOT NULL,
        source_note_id TEXT,
        source_agent_id TEXT NOT NULL,
        superseded_by_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(source_agent_id) REFERENCES agents(id)
      );

      CREATE TABLE IF NOT EXISTS relations (
        id TEXT PRIMARY KEY,
        from_type TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_type TEXT NOT NULL,
        to_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        created_by_agent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(created_by_agent_id) REFERENCES agents(id)
      );

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        input_summary TEXT NOT NULL,
        output_summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(agent_id) REFERENCES agents(id),
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS inbox_items (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS memory_patches (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(agent_id) REFERENCES agents(id)
      );

      CREATE TABLE IF NOT EXISTS activity_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(agent_id) REFERENCES agents(id)
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS note_vectors (
        note_id TEXT PRIMARY KEY,
        vector TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        model TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        z REAL NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(note_id) REFERENCES notes(id)
      );
      """
    )

    count = connection.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
    if count == 0:
      seed_database(connection)
    ensure_note_metadata_columns(connection)
    ensure_seed_relations(connection)
    ensure_default_settings(connection)
    connection.commit()


def ensure_note_metadata_columns(connection: sqlite3.Connection) -> None:
  existing = {row["name"] for row in connection.execute("PRAGMA table_info(notes)").fetchall()}
  if "folder" not in existing:
    connection.execute("ALTER TABLE notes ADD COLUMN folder TEXT NOT NULL DEFAULT ''")
  if "category" not in existing:
    connection.execute("ALTER TABLE notes ADD COLUMN category TEXT NOT NULL DEFAULT 'General'")
  connection.execute(
    """
    UPDATE notes
    SET category = CASE
      WHEN category IS NULL OR category = '' THEN
        CASE
          WHEN type LIKE '%Research%' THEN 'Research'
          WHEN type LIKE '%Meeting%' THEN 'Meetings'
          WHEN type LIKE '%Decision%' THEN 'Decisions'
          WHEN type LIKE '%Agent%' THEN 'AI Notes'
          ELSE 'General'
        END
      ELSE category
    END
    """
  )


def ensure_default_settings(connection: sqlite3.Connection) -> None:
  defaults = {
    "model_provider": os.getenv("MODEL_PROVIDER", "ollama"),
    "model_base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    "model_name": os.getenv("QWEN_MODEL", "qwen3:4b"),
    "privacy_mode": "local_first",
  }
  now = utc_now()
  for key, value in defaults.items():
    connection.execute(
      """
      INSERT OR IGNORE INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      """,
      (key, value, now),
    )


def seed_database(connection: sqlite3.Connection) -> None:
  now = utc_now()
  agents = [
    ("user", "Usuario", "Owner", "#6b7280", "human", "online", ["aprobar", "canonizar", "borrar", "exportar"], 0),
    ("qwen", "Qwen Local", "Clasificacion y compresion", "#2563eb", "local_model", "ready", ["categorizar", "resumir", "sugerir relaciones"], 0),
    ("claude", "Claude", "Razonamiento externo", "#7c3aed", "external_model", "ready", ["leer contexto", "proponer notas", "proponer tareas"], 2),
    ("codex", "Codex", "Implementacion", "#16a34a", "coding_agent", "ready", ["leer contexto tecnico", "importar outputs", "marcar tareas"], 1),
    ("chatgpt", "ChatGPT", "Analisis bajo demanda", "#ea580c", "external_model", "offline", ["leer contexto aprobado"], 0),
  ]
  connection.executemany(
    """
    INSERT INTO agents (id, name, role, color, type, status, permissions, pending_writes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """,
    [(agent_id, name, role, color, type_, status, json.dumps(permissions), pending) for agent_id, name, role, color, type_, status, permissions, pending in agents],
  )

  connection.execute(
    """
    INSERT INTO projects (id, name, goal, status, canonical_summary, tags, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """,
    (
      "agent-memory-hub",
      "Agent Memory Hub",
      "Crear una app local-first donde humanos y agentes compartan memoria de trabajo reutilizable.",
      "MVP design",
      "Neuronotes 2.0 captura notas, outputs de agentes y conversaciones; Qwen 4B local las clasifica, compacta y relaciona; el usuario decide que se vuelve memoria canonica.",
      json.dumps(["agents", "MCP", "Codex", "Claude", "Qwen", "local-first"]),
      now,
    ),
  )

  notes = [
    ("n1", "MVP architecture", "Inbox, Project Memory, Context Compiler, Agent Activity y writeback con aprobacion.", "Agent Finding", "approved", "claude", "#7c3aed", 720),
    ("n2", "Context compression rules", "Mantener original, resumen corto, facts atomicos y version para agente.", "Compressed Memory", "canonical", "qwen", "#2563eb", 420),
    ("n3", "Codex export surface", "AGENTS.md, docs/context.md, docs/decisions.md y docs/tasks.md.", "Context Pack", "draft", "codex", "#16a34a", 560),
  ]
  connection.executemany(
    """
    INSERT INTO notes (id, project_id, title, content, type, status, created_by_agent_id, color, token_count, created_at)
    VALUES (?, 'agent-memory-hub', ?, ?, ?, ?, ?, ?, ?, ?)
    """,
    [(note_id, title, content, type_, status, agent_id, color, tokens, now) for note_id, title, content, type_, status, agent_id, color, tokens in notes],
  )

  decisions = [
    ("d1", "Usar una app local-first con SQLite como fuente de verdad del MVP.", "canonical", "user"),
    ("d2", "Qwen 4B local clasifica, compacta y sugiere relaciones sin enviar notas privadas fuera.", "canonical", "qwen"),
    ("d3", "Los agentes escriben memory patches que requieren aprobacion humana para canonizarse.", "canonical", "claude"),
    ("d4", "El primer MCP server sera read-only, con submit_memory_patch como escritura estructurada.", "proposed", "codex"),
  ]
  connection.executemany(
    """
    INSERT INTO decisions (id, project_id, text, status, source_agent_id, created_at)
    VALUES (?, 'agent-memory-hub', ?, ?, ?, ?)
    """,
    [(decision_id, text, status, agent_id, now) for decision_id, text, status, agent_id in decisions],
  )

  tasks = [
    ("t1", "Disenar schema inicial de memoria y actividad.", "implemented", "codex"),
    ("t2", "Crear Inbox con clasificacion asistida por Qwen.", "in_progress", "qwen"),
    ("t3", "Generar AGENTS.md y docs/context.md para Codex.", "open", "user"),
    ("t4", "Exponer tools MCP read-only.", "open", "claude"),
  ]
  connection.executemany(
    """
    INSERT INTO tasks (id, project_id, title, status, source_agent_id, created_at)
    VALUES (?, 'agent-memory-hub', ?, ?, ?, ?)
    """,
    [(task_id, title, status, agent_id, now) for task_id, title, status, agent_id in tasks],
  )

  inbox_items = [
    ("i1", "Output de Codex sobre MCP server", "raw", "Codex", ["MCP", "tools", "schema"], "Codex output pendiente de procesar."),
    ("i2", "Conversacion con Claude sobre arquitectura", "raw", "Claude", ["architecture", "permissions"], "Claude propone arquitectura y permisos."),
    ("i3", "Idea: agentes con colores en mapa", "processed", "Usuario", ["agent-map", "visual"], "Color por agente para trazabilidad visual."),
  ]
  connection.executemany(
    """
    INSERT INTO inbox_items (id, project_id, title, status, source, tags, content, created_at)
    VALUES (?, 'agent-memory-hub', ?, ?, ?, ?, ?, ?)
    """,
    [(item_id, title, status, source, json.dumps(tags), content, now) for item_id, title, status, source, tags, content in inbox_items],
  )

  patches = [
    ("p1", "claude", {"text": "Claude propone canonizar: Use SQLite for the MVP."}),
    ("p2", "codex", {"text": "Codex quiere marcar: schema inicial implemented, pending review."}),
    ("p3", "qwen", {"text": "Qwen sugiere relacionar compactacion con Context Compiler."}),
  ]
  connection.executemany(
    """
    INSERT INTO memory_patches (id, project_id, agent_id, status, payload, created_at)
    VALUES (?, 'agent-memory-hub', ?, 'pending', ?, ?)
    """,
    [(patch_id, agent_id, json.dumps(payload), now) for patch_id, agent_id, payload in patches],
  )

  activity = [
    ("a1", "qwen", "categorizo 8 notas y propuso 12 tags.", "2026-06-16T10:42:00+00:00"),
    ("a2", "claude", "propuso 2 decisiones y 4 tareas.", "2026-06-16T10:45:00+00:00"),
    ("a3", "user", "aprobo 1 decision y rechazo 1 tarea.", "2026-06-16T10:49:00+00:00"),
    ("a4", "codex", "importo output de implementacion.", "2026-06-16T11:03:00+00:00"),
  ]
  connection.executemany(
    """
    INSERT INTO activity_events (id, project_id, agent_id, action, created_at)
    VALUES (?, 'agent-memory-hub', ?, ?, ?)
    """,
    activity,
  )


def ensure_seed_relations(connection: sqlite3.Connection) -> None:
  relation_count = connection.execute("SELECT COUNT(*) FROM relations").fetchone()[0]
  note_count = connection.execute("SELECT COUNT(*) FROM notes WHERE project_id = 'agent-memory-hub'").fetchone()[0]
  if relation_count > 0 or note_count < 3:
    return

  now = utc_now()
  relations = [
    ("rel-seed-context", "note", "n1", "note", "n2", "supports", "qwen", "active", now),
    ("rel-seed-export", "note", "n2", "note", "n3", "feeds", "codex", "active", now),
    ("rel-seed-task", "note", "n3", "task", "t3", "creates_task", "codex", "active", now),
  ]
  connection.executemany(
    """
    INSERT OR IGNORE INTO relations (id, from_type, from_id, to_type, to_id, relation_type, created_by_agent_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
    relations,
  )


def get_dashboard(project_id: str | None = None) -> dict[str, Any]:
  init_database()
  with connect() as connection:
    project = get_project(connection, project_id)
    project_id = project["id"]
    agents = [
      {
        "id": row["id"],
        "name": row["name"],
        "role": row["role"],
        "color": row["color"],
        "status": row["status"],
        "permissions": json.loads(row["permissions"]),
        "pendingWrites": row["pending_writes"],
      }
      for row in connection.execute("SELECT * FROM agents ORDER BY CASE id WHEN 'user' THEN 0 WHEN 'qwen' THEN 1 WHEN 'claude' THEN 2 WHEN 'codex' THEN 3 ELSE 4 END")
    ]
    agent_lookup = {agent["id"]: agent for agent in agents}

    decisions = [
      {
        "id": row["id"],
        "text": row["text"],
        "status": row["status"],
        "agent": agent_lookup[row["source_agent_id"]]["name"],
      }
      for row in connection.execute("SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at", (project_id,))
    ]
    tasks = [
      {
        "id": row["id"],
        "title": row["title"],
        "status": row["status"],
        "source": agent_lookup[row["source_agent_id"]]["name"],
      }
      for row in connection.execute("SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at", (project_id,))
    ]
    notes = [
    {
      "id": row["id"],
      "title": row["title"],
      "type": row["type"],
      "status": row["status"],
      "folder": row["folder"] if "folder" in row.keys() else "",
      "category": row["category"] if "category" in row.keys() else "General",
      "agent": agent_lookup[row["created_by_agent_id"]]["name"],
      "excerpt": clean_text_excerpt(row["content"], 700),
      "tokens": row["token_count"],
      }
      for row in connection.execute("SELECT * FROM notes WHERE project_id = ? ORDER BY created_at", (project_id,))
    ]
    inbox = [
      {
        "id": row["id"],
        "title": row["title"],
        "status": row["status"],
        "source": row["source"],
        "tags": json.loads(row["tags"]),
      }
      for row in connection.execute("SELECT * FROM inbox_items WHERE project_id = ? ORDER BY created_at", (project_id,))
    ]
    activity = [
      {
        "id": row["id"],
        "time": row["created_at"][11:16],
        "agent": agent_lookup[row["agent_id"]]["name"],
        "action": row["action"],
        "color": agent_lookup[row["agent_id"]]["color"],
      }
      for row in connection.execute("SELECT * FROM activity_events WHERE project_id = ? ORDER BY created_at", (project_id,))
    ]
    pending_patches = [
      json.loads(row["payload"]).get("text", "Memory patch pending review.")
      for row in connection.execute("SELECT payload FROM memory_patches WHERE project_id = ? AND status = 'pending' ORDER BY created_at", (project_id,))
    ]

  return {
    "project": project,
    "projects": list_projects(),
    "agents": agents,
    "decisions": decisions,
    "tasks": tasks,
    "notes": notes,
    "inbox": inbox,
    "activity": activity,
    "health": build_health(notes, decisions, inbox, pending_patches),
    "pending_patches": pending_patches,
  }


def make_id(prefix: str, text: str | None = None) -> str:
  if text:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:42]
    if slug:
      return f"{prefix}-{slug}-{uuid4().hex[:8]}"
  return f"{prefix}-{uuid4().hex[:12]}"


def estimate_tokens(text: str) -> int:
  words = re.findall(r"\S+", text or "")
  return max(1, int(len(words) * 1.35))


def json_array(value: str | list[str] | None) -> str:
  if value is None:
    return "[]"
  if isinstance(value, list):
    return json.dumps(value)
  tags = [tag.strip() for tag in value.split(",") if tag.strip()]
  return json.dumps(tags)


def list_projects() -> list[dict[str, Any]]:
  init_database()
  with connect() as connection:
    rows = connection.execute("SELECT * FROM projects ORDER BY created_at DESC").fetchall()
  return [
    {
      "id": row["id"],
      "name": row["name"],
      "goal": row["goal"],
      "status": row["status"],
      "summary": row["canonical_summary"],
      "tags": json.loads(row["tags"]),
    }
    for row in rows
  ]


def create_project(data: dict[str, Any]) -> dict[str, Any]:
  init_database()
  project_id = make_id("project", data.get("name"))
  now = utc_now()
  with connect() as connection:
    connection.execute(
      """
      INSERT INTO projects (id, name, goal, status, canonical_summary, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      """,
      (
        project_id,
        data["name"].strip(),
        data.get("goal", "").strip(),
        data.get("status", "active").strip() or "active",
        data.get("summary", "").strip(),
        json_array(data.get("tags", [])),
        now,
      ),
    )
    connection.execute(
      """
      INSERT INTO activity_events (id, project_id, agent_id, action, created_at)
      VALUES (?, ?, 'user', ?, ?)
      """,
      (make_id("activity"), project_id, f"creo el proyecto {data['name'].strip()}.", now),
    )
    connection.commit()
  return get_dashboard(project_id)["project"]


def update_project(project_id: str, data: dict[str, Any]) -> dict[str, Any]:
  init_database()
  with connect() as connection:
    current = connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if current is None:
      raise ValueError("Project not found")
    connection.execute(
      """
      UPDATE projects
      SET name = ?, goal = ?, status = ?, canonical_summary = ?, tags = ?
      WHERE id = ?
      """,
      (
        data.get("name", current["name"]).strip(),
        data.get("goal", current["goal"]).strip(),
        data.get("status", current["status"]).strip(),
        data.get("summary", current["canonical_summary"]).strip(),
        json_array(data.get("tags", json.loads(current["tags"]))),
        project_id,
      ),
    )
    connection.execute(
      """
      INSERT INTO activity_events (id, project_id, agent_id, action, created_at)
      VALUES (?, ?, 'user', 'edito metadata del proyecto.', ?)
      """,
      (make_id("activity"), project_id, utc_now()),
    )
    connection.commit()
    return get_project(connection, project_id)


def list_notes(
  project_id: str | None = None,
  folder: str | None = None,
  category: str | None = None,
) -> list[dict[str, Any]]:
  init_database()
  filters: list[str] = []
  params: list[Any] = []
  if project_id:
    filters.append("notes.project_id = ?")
    params.append(project_id)
  if folder is not None:
    filters.append("notes.folder = ?")
    params.append(folder)
  if category is not None:
    filters.append("notes.category = ?")
    params.append(category)
  where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
  with connect() as connection:
    rows = connection.execute(
      f"""
      SELECT notes.*, agents.name AS agent_name
      FROM notes
      JOIN agents ON agents.id = notes.created_by_agent_id
      {where_clause}
      ORDER BY notes.created_at DESC
      """,
      params,
    ).fetchall()
  return [note_from_row(row) for row in rows]


def note_from_row(row: sqlite3.Row) -> dict[str, Any]:
  return {
    "id": row["id"],
    "project_id": row["project_id"],
    "title": row["title"],
    "content": row["content"],
    "type": row["type"],
    "status": row["status"],
    "folder": row["folder"] if "folder" in row.keys() else "",
    "category": row["category"] if "category" in row.keys() else "General",
    "agent": row["agent_name"] if "agent_name" in row.keys() else row["created_by_agent_id"],
    "created_by_agent_id": row["created_by_agent_id"],
    "color": row["color"],
    "tokens": row["token_count"],
    "excerpt": clean_text_excerpt(row["content"], 260),
    "created_at": row["created_at"],
  }


def vector_source(row: sqlite3.Row | dict[str, Any]) -> str:
  raw_source = "\n".join(
    [
      str(row["title"] if "title" in row.keys() else row.get("title", "")),
      str(row["type"] if "type" in row.keys() else row.get("type", "")),
      str(row["folder"] if "folder" in row.keys() else row.get("folder", "")),
      str(row["category"] if "category" in row.keys() else row.get("category", "")),
      str(row["content"] if "content" in row.keys() else row.get("content", "")),
    ]
  )
  return clean_vector_text(raw_source)


def clean_vector_text(text: str) -> str:
  without_embedded_images = DATA_IMAGE_PATTERN.sub(lambda match: f"image {match.group(1)}", text)
  with_image_context = MARKDOWN_IMAGE_PATTERN.sub(lambda match: f"{match.group(1)} {match.group(2)}", without_embedded_images)
  return re.sub(r"\s+", " ", with_image_context).strip()


def clean_text_excerpt(text: str, limit: int) -> str:
  return clean_vector_text(text)[:limit]


def source_hash(text: str) -> str:
  return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def vector_tokens(text: str) -> list[str]:
  words = re.findall(r"[^\W_]+", text.lower())
  tokens = [word for word in words if len(word) > 2]
  tokens.extend(f"{left}_{right}" for left, right in zip(tokens, tokens[1:]) if left != right)
  return tokens


def local_embedding(text: str, dimensions: int = VECTOR_DIMENSIONS) -> list[float]:
  vector = [0.0] * dimensions
  for token in vector_tokens(text):
    digest = hashlib.blake2b(token.encode("utf-8", errors="ignore"), digest_size=8).digest()
    bucket = int.from_bytes(digest[:4], "little") % dimensions
    weight = 1.0 + min(len(token), 18) / 18
    vector[bucket] += weight
  length = math.sqrt(sum(value * value for value in vector))
  if length == 0:
    return vector
  return [round(value / length, 6) for value in vector]


def dot_product(left: list[float], right: list[float]) -> float:
  return sum(a * b for a, b in zip(left, right))


def project_embedding(vector: list[float]) -> tuple[float, float, float]:
  if not vector:
    return (0.0, 0.0, 0.0)
  x = sum(value * math.sin((index + 1) * 12.9898) for index, value in enumerate(vector))
  y = sum(value * math.cos((index + 1) * 78.233) for index, value in enumerate(vector))
  z = sum(value * math.sin((index + 1) * 37.719) for index, value in enumerate(vector))
  scale = max(abs(x), abs(y), abs(z), 1.0)
  return (round(x / scale, 6), round(y / scale, 6), round(z / scale, 6))


def upsert_note_vector(connection: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
  source = vector_source(row)
  fingerprint = source_hash(source)
  existing = connection.execute(
    "SELECT * FROM note_vectors WHERE note_id = ? AND source_hash = ? AND dimensions = ? AND model = ?",
    (row["id"], fingerprint, VECTOR_DIMENSIONS, VECTOR_MODEL),
  ).fetchone()
  if existing is not None:
    return vector_row_payload(row, existing)

  vector = local_embedding(source)
  x, y, z = project_embedding(vector)
  connection.execute(
    """
    INSERT INTO note_vectors (note_id, vector, dimensions, model, source_hash, x, y, z, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(note_id) DO UPDATE SET
      vector = excluded.vector,
      dimensions = excluded.dimensions,
      model = excluded.model,
      source_hash = excluded.source_hash,
      x = excluded.x,
      y = excluded.y,
      z = excluded.z,
      updated_at = excluded.updated_at
    """,
    (
      row["id"],
      json.dumps(vector),
      VECTOR_DIMENSIONS,
      VECTOR_MODEL,
      fingerprint,
      x,
      y,
      z,
      utc_now(),
    ),
  )
  vector_row = connection.execute("SELECT * FROM note_vectors WHERE note_id = ?", (row["id"],)).fetchone()
  return vector_row_payload(row, vector_row)


def vector_row_payload(note_row: sqlite3.Row, vector_row: sqlite3.Row) -> dict[str, Any]:
  return {
    "id": note_row["id"],
    "project_id": note_row["project_id"],
    "title": note_row["title"],
    "type": note_row["type"],
    "status": note_row["status"],
    "folder": note_row["folder"] if "folder" in note_row.keys() else "",
    "category": note_row["category"] if "category" in note_row.keys() else "General",
    "agent": note_row["agent_name"] if "agent_name" in note_row.keys() else note_row["created_by_agent_id"],
    "color": note_row["color"],
    "excerpt": clean_text_excerpt(note_row["content"], 220),
    "vector": json.loads(vector_row["vector"]),
    "dimensions": vector_row["dimensions"],
    "model": vector_row["model"],
    "x": vector_row["x"],
    "y": vector_row["y"],
    "z": vector_row["z"],
    "updated_at": vector_row["updated_at"],
  }


def vector_filters(
  project_id: str | None = None,
  folder: str | None = None,
  category: str | None = None,
) -> tuple[str, list[Any]]:
  filters: list[str] = []
  params: list[Any] = []
  if project_id:
    filters.append("notes.project_id = ?")
    params.append(project_id)
  if folder is not None:
    filters.append("notes.folder = ?")
    params.append(folder)
  if category is not None:
    filters.append("notes.category = ?")
    params.append(category)
  return (f"WHERE {' AND '.join(filters)}" if filters else "", params)


def note_rows_for_vectors(
  connection: sqlite3.Connection,
  project_id: str | None = None,
  folder: str | None = None,
  category: str | None = None,
) -> list[sqlite3.Row]:
  where_clause, params = vector_filters(project_id, folder, category)
  return connection.execute(
    f"""
    SELECT notes.*, agents.name AS agent_name
    FROM notes
    JOIN agents ON agents.id = notes.created_by_agent_id
    {where_clause}
    ORDER BY notes.created_at DESC
    """,
    params,
  ).fetchall()


def rebuild_note_vectors(project_id: str | None = None) -> dict[str, Any]:
  init_database()
  with connect() as connection:
    rows = note_rows_for_vectors(connection, project_id=project_id)
    payloads = [upsert_note_vector(connection, row) for row in rows]
    connection.commit()
  return {
    "rebuilt": len(payloads),
    "dimensions": VECTOR_DIMENSIONS,
    "model": VECTOR_MODEL,
  }


def semantic_search_notes(query: str, limit: int = 8, project_id: str | None = None) -> list[dict[str, Any]]:
  init_database()
  query_vector = local_embedding(query)
  query_terms = set(vector_tokens(query))
  with connect() as connection:
    rows = note_rows_for_vectors(connection, project_id=project_id)
    payloads = [(row, upsert_note_vector(connection, row)) for row in rows]
    connection.commit()
  results = []
  for row, payload in payloads:
    doc_terms = set(vector_tokens(vector_source(row)))
    lexical_score = 0.0
    if query_terms and doc_terms:
      lexical_score = len(query_terms & doc_terms) / math.sqrt(len(query_terms) * len(doc_terms))
    vector_score = dot_product(query_vector, payload["vector"])
    score = (lexical_score * 0.85) + (vector_score * 0.15)
    item = {key: value for key, value in payload.items() if key != "vector"}
    item["score"] = round(score, 4)
    item["lexical_score"] = round(lexical_score, 4)
    item["vector_score"] = round(vector_score, 4)
    item["kind"] = "note"
    item["snippet"] = item.pop("excerpt")
    results.append(item)
  results.sort(key=lambda item: item["score"], reverse=True)
  return results[: max(1, min(limit, 50))]


def vector_memory_map(
  project_id: str | None = None,
  folder: str | None = None,
  category: str | None = None,
) -> dict[str, Any]:
  init_database()
  with connect() as connection:
    rows = note_rows_for_vectors(connection, project_id=project_id, folder=folder, category=category)
    nodes = [upsert_note_vector(connection, row) for row in rows]
    connection.commit()
  relation_rows = list_relations(project_id)

  note_ids = {node["id"] for node in nodes}
  relation_edges = [
    {
      "id": relation["id"],
      "from_id": relation["from_id"],
      "to_id": relation["to_id"],
      "relation_type": relation["relation_type"],
      "score": 1.0,
      "source": "relation",
    }
    for relation in relation_rows
    if relation["from_type"] == "note"
    and relation["to_type"] == "note"
    and relation["from_id"] in note_ids
    and relation["to_id"] in note_ids
  ]

  semantic_edges: list[dict[str, Any]] = []
  for left_index, left in enumerate(nodes):
    scores: list[tuple[float, str]] = []
    for right_index, right in enumerate(nodes):
      if left_index == right_index:
        continue
      score = dot_product(left["vector"], right["vector"])
      if score >= 0.18:
        scores.append((score, right["id"]))
    scores.sort(reverse=True)
    for score, right_id in scores[:3]:
      edge_id = f"sem-{left['id']}-{right_id}"
      reverse_id = f"sem-{right_id}-{left['id']}"
      if any(edge["id"] in {edge_id, reverse_id} for edge in semantic_edges):
        continue
      semantic_edges.append(
        {
          "id": edge_id,
          "from_id": left["id"],
          "to_id": right_id,
          "relation_type": "semantic",
          "score": round(score, 4),
          "source": "vector",
        }
      )

  clean_nodes = [{key: value for key, value in node.items() if key != "vector"} for node in nodes]
  return {
    "nodes": clean_nodes,
    "edges": relation_edges + semantic_edges[: max(80, len(nodes) * 2)],
    "dimensions": VECTOR_DIMENSIONS,
    "model": VECTOR_MODEL,
    "sources": {
      "relation_edges": len(relation_edges),
      "semantic_edges": len(semantic_edges),
    },
  }


def create_note(data: dict[str, Any]) -> dict[str, Any]:
  init_database()
  note_id = make_id("note", data.get("title"))
  project_id = data["project_id"]
  agent_id = data.get("created_by_agent_id", "user")
  now = utc_now()
  content = data.get("content", "")
  with connect() as connection:
    agent = connection.execute("SELECT color FROM agents WHERE id = ?", (agent_id,)).fetchone()
    if agent is None:
      agent_id = "user"
      agent = connection.execute("SELECT color FROM agents WHERE id = 'user'").fetchone()
    connection.execute(
      """
      INSERT INTO notes (id, project_id, title, content, type, status, folder, category, created_by_agent_id, color, token_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      """,
      (
        note_id,
        project_id,
        data["title"].strip(),
        content,
        data.get("type", "Human Note"),
        data.get("status", "draft"),
        data.get("folder", "").strip(),
        data.get("category", "General").strip() or "General",
        agent_id,
        agent["color"],
        estimate_tokens(content),
        now,
      ),
    )
    connection.execute(
      """
      INSERT INTO activity_events (id, project_id, agent_id, action, created_at)
      VALUES (?, ?, ?, ?, ?)
      """,
      (make_id("activity"), project_id, agent_id, f"creo la nota {data['title'].strip()}.", now),
    )
    row = connection.execute(
      """
      SELECT notes.*, agents.name AS agent_name
      FROM notes JOIN agents ON agents.id = notes.created_by_agent_id
      WHERE notes.id = ?
      """,
      (note_id,),
    ).fetchone()
    upsert_note_vector(connection, row)
    connection.commit()
  return note_from_row(row)


def update_note(note_id: str, data: dict[str, Any]) -> dict[str, Any]:
  init_database()
  with connect() as connection:
    current = connection.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if current is None:
      raise ValueError("Note not found")
    content = data.get("content", current["content"])
    connection.execute(
      """
      UPDATE notes
      SET project_id = ?, title = ?, content = ?, type = ?, status = ?, folder = ?, category = ?, token_count = ?
      WHERE id = ?
      """,
      (
        data.get("project_id", current["project_id"]),
        data.get("title", current["title"]).strip(),
        content,
        data.get("type", current["type"]),
        data.get("status", current["status"]),
        data.get("folder", current["folder"] if "folder" in current.keys() else "").strip(),
        data.get("category", current["category"] if "category" in current.keys() else "General").strip() or "General",
        estimate_tokens(content),
        note_id,
      ),
    )
    connection.execute(
      """
      INSERT INTO activity_events (id, project_id, agent_id, action, created_at)
      VALUES (?, ?, 'user', ?, ?)
      """,
      (make_id("activity"), data.get("project_id", current["project_id"]), f"edito la nota {data.get('title', current['title']).strip()}.", utc_now()),
    )
    row = connection.execute(
      """
      SELECT notes.*, agents.name AS agent_name
      FROM notes JOIN agents ON agents.id = notes.created_by_agent_id
      WHERE notes.id = ?
      """,
      (note_id,),
    ).fetchone()
    upsert_note_vector(connection, row)
    connection.commit()
  return note_from_row(row)


def list_tasks(project_id: str | None = None) -> list[dict[str, Any]]:
  init_database()
  with connect() as connection:
    if project_id:
      rows = connection.execute(
        """
        SELECT tasks.*, agents.name AS agent_name
        FROM tasks
        JOIN agents ON agents.id = tasks.source_agent_id
        WHERE tasks.project_id = ?
        ORDER BY tasks.created_at DESC
        """,
        (project_id,),
      ).fetchall()
    else:
      rows = connection.execute(
        """
        SELECT tasks.*, agents.name AS agent_name
        FROM tasks
        JOIN agents ON agents.id = tasks.source_agent_id
        ORDER BY tasks.created_at DESC
        """
      ).fetchall()
  return [task_from_row(row) for row in rows]


def task_from_row(row: sqlite3.Row) -> dict[str, Any]:
  return {
    "id": row["id"],
    "project_id": row["project_id"],
    "title": row["title"],
    "status": row["status"],
    "source_note_id": row["source_note_id"] if "source_note_id" in row.keys() else None,
    "source_agent_id": row["source_agent_id"],
    "source": row["agent_name"] if "agent_name" in row.keys() else row["source_agent_id"],
    "created_at": row["created_at"],
  }


def create_task(data: dict[str, Any]) -> dict[str, Any]:
  init_database()
  task_id = make_id("task", data.get("title"))
  project_id = data["project_id"]
  agent_id = data.get("source_agent_id", "user")
  now = utc_now()
  with connect() as connection:
    if connection.execute("SELECT 1 FROM agents WHERE id = ?", (agent_id,)).fetchone() is None:
      agent_id = "user"
    connection.execute(
      """
      INSERT INTO tasks (id, project_id, title, status, source_note_id, source_agent_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      """,
      (
        task_id,
        project_id,
        data["title"].strip(),
        data.get("status", "open"),
        data.get("source_note_id"),
        agent_id,
        now,
      ),
    )
    connection.execute(
      """
      INSERT INTO activity_events (id, project_id, agent_id, action, created_at)
      VALUES (?, ?, ?, ?, ?)
      """,
      (make_id("activity"), project_id, agent_id, f"creo la tarea {data['title'].strip()}.", now),
    )
    connection.commit()
    row = connection.execute(
      """
      SELECT tasks.*, agents.name AS agent_name
      FROM tasks JOIN agents ON agents.id = tasks.source_agent_id
      WHERE tasks.id = ?
      """,
      (task_id,),
    ).fetchone()
  return task_from_row(row)


def update_task(task_id: str, data: dict[str, Any]) -> dict[str, Any]:
  init_database()
  with connect() as connection:
    current = connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if current is None:
      raise ValueError("Task not found")
    title = data.get("title", current["title"]).strip()
    status = data.get("status", current["status"]).strip() or current["status"]
    project_id = data.get("project_id", current["project_id"])
    connection.execute(
      """
      UPDATE tasks
      SET project_id = ?, title = ?, status = ?, source_note_id = ?
      WHERE id = ?
      """,
      (project_id, title, status, data.get("source_note_id", current["source_note_id"]), task_id),
    )
    connection.execute(
      """
      INSERT INTO activity_events (id, project_id, agent_id, action, created_at)
      VALUES (?, ?, 'user', ?, ?)
      """,
      (make_id("activity"), project_id, f"actualizo la tarea {title}.", utc_now()),
    )
    connection.commit()
    row = connection.execute(
      """
      SELECT tasks.*, agents.name AS agent_name
      FROM tasks JOIN agents ON agents.id = tasks.source_agent_id
      WHERE tasks.id = ?
      """,
      (task_id,),
    ).fetchone()
  return task_from_row(row)


def list_relations(project_id: str | None = None) -> list[dict[str, Any]]:
  init_database()
  with connect() as connection:
    if project_id:
      rows = connection.execute(
        """
        SELECT relations.*, agents.name AS agent_name
        FROM relations
        JOIN agents ON agents.id = relations.created_by_agent_id
        WHERE relations.status = 'active'
          AND (
            relations.from_id IN (SELECT id FROM notes WHERE project_id = ?)
            OR relations.to_id IN (SELECT id FROM notes WHERE project_id = ?)
            OR relations.from_id IN (SELECT id FROM tasks WHERE project_id = ?)
            OR relations.to_id IN (SELECT id FROM tasks WHERE project_id = ?)
            OR relations.from_id IN (SELECT id FROM decisions WHERE project_id = ?)
            OR relations.to_id IN (SELECT id FROM decisions WHERE project_id = ?)
          )
        ORDER BY relations.created_at DESC
        """,
        (project_id, project_id, project_id, project_id, project_id, project_id),
      ).fetchall()
    else:
      rows = connection.execute(
        """
        SELECT relations.*, agents.name AS agent_name
        FROM relations
        JOIN agents ON agents.id = relations.created_by_agent_id
        WHERE relations.status = 'active'
        ORDER BY relations.created_at DESC
        """
      ).fetchall()
  return [relation_from_row(row) for row in rows]


def relation_from_row(row: sqlite3.Row) -> dict[str, Any]:
  return {
    "id": row["id"],
    "from_type": row["from_type"],
    "from_id": row["from_id"],
    "to_type": row["to_type"],
    "to_id": row["to_id"],
    "relation_type": row["relation_type"],
    "created_by_agent_id": row["created_by_agent_id"],
    "created_by": row["agent_name"] if "agent_name" in row.keys() else row["created_by_agent_id"],
    "status": row["status"],
    "created_at": row["created_at"],
  }


def create_relation(data: dict[str, Any]) -> dict[str, Any]:
  init_database()
  relation_id = make_id("rel", data.get("relation_type"))
  agent_id = data.get("created_by_agent_id", "user")
  now = utc_now()
  with connect() as connection:
    if connection.execute("SELECT 1 FROM agents WHERE id = ?", (agent_id,)).fetchone() is None:
      agent_id = "user"
    connection.execute(
      """
      INSERT INTO relations (id, from_type, from_id, to_type, to_id, relation_type, created_by_agent_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      """,
      (
        relation_id,
        data.get("from_type", "note"),
        data["from_id"],
        data.get("to_type", "note"),
        data["to_id"],
        data.get("relation_type", "related"),
        agent_id,
        data.get("status", "active"),
        now,
      ),
    )
    project_id = infer_project_for_relation(connection, data.get("from_type", "note"), data["from_id"])
    if project_id:
      connection.execute(
        """
        INSERT INTO activity_events (id, project_id, agent_id, action, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (make_id("activity"), project_id, agent_id, "relaciono dos piezas de memoria.", now),
      )
    connection.commit()
    row = connection.execute(
      """
      SELECT relations.*, agents.name AS agent_name
      FROM relations JOIN agents ON agents.id = relations.created_by_agent_id
      WHERE relations.id = ?
      """,
      (relation_id,),
    ).fetchone()
  return relation_from_row(row)


def infer_project_for_relation(connection: sqlite3.Connection, from_type: str, from_id: str) -> str | None:
  table = {"note": "notes", "task": "tasks", "decision": "decisions"}.get(from_type)
  if table is None:
    return None
  row = connection.execute(f"SELECT project_id FROM {table} WHERE id = ?", (from_id,)).fetchone()
  return row["project_id"] if row else None


def apply_note_improvement(note_id: str, improvement: dict[str, Any], agent_id: str = "qwen") -> dict[str, Any]:
  init_database()
  created_tasks: list[dict[str, Any]] = []
  created_relations: list[dict[str, Any]] = []
  now = utc_now()

  with connect() as connection:
    current = connection.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if current is None:
      raise ValueError("Note not found")
    if connection.execute("SELECT 1 FROM agents WHERE id = ?", (agent_id,)).fetchone() is None:
      agent_id = "qwen"

    title = str(improvement.get("title") or current["title"]).strip() or current["title"]
    content = str(improvement.get("content") or current["content"]).strip()
    type_ = str(improvement.get("type") or current["type"]).strip() or current["type"]
    status = str(improvement.get("status") or current["status"]).strip() or current["status"]
    project_id = improvement.get("project_id") or current["project_id"]
    folder = str(improvement.get("folder") if improvement.get("folder") is not None else current["folder"]).strip()
    category = str(improvement.get("category") if improvement.get("category") is not None else current["category"]).strip() or "General"

    connection.execute(
      """
      UPDATE notes
      SET project_id = ?, title = ?, content = ?, type = ?, status = ?, folder = ?, category = ?, token_count = ?
      WHERE id = ?
      """,
      (project_id, title, content, type_, status, folder, category, estimate_tokens(content), note_id),
    )

    for task in improvement.get("tasks", []):
      task_title = str(task.get("title") if isinstance(task, dict) else task).strip()
      if not task_title:
        continue
      task_id = make_id("task", task_title)
      connection.execute(
        """
        INSERT INTO tasks (id, project_id, title, status, source_note_id, source_agent_id, created_at)
        VALUES (?, ?, ?, 'open', ?, ?, ?)
        """,
        (task_id, project_id, task_title, note_id, agent_id, now),
      )
      task_payload = {
        "id": task_id,
        "project_id": project_id,
        "title": task_title,
        "status": "open",
        "source_note_id": note_id,
        "source_agent_id": agent_id,
        "source": agent_id,
        "created_at": now,
      }
      created_tasks.append(task_payload)
      relation_id = make_id("rel", "creates_task")
      connection.execute(
        """
        INSERT INTO relations (id, from_type, from_id, to_type, to_id, relation_type, created_by_agent_id, status, created_at)
        VALUES (?, 'note', ?, 'task', ?, 'creates_task', ?, 'active', ?)
        """,
        (relation_id, note_id, task_id, agent_id, now),
      )
      created_relations.append(
        {
          "id": relation_id,
          "from_type": "note",
          "from_id": note_id,
          "to_type": "task",
          "to_id": task_id,
          "relation_type": "creates_task",
          "created_by_agent_id": agent_id,
          "created_by": agent_id,
          "status": "active",
          "created_at": now,
        }
      )

    for related_id in improvement.get("related_note_ids", []):
      related_id = str(related_id).strip()
      if not related_id or related_id == note_id:
        continue
      exists = connection.execute("SELECT 1 FROM notes WHERE id = ?", (related_id,)).fetchone()
      if exists is None:
        continue
      already = connection.execute(
        """
        SELECT 1 FROM relations
        WHERE from_type = 'note' AND from_id = ? AND to_type = 'note' AND to_id = ? AND status = 'active'
        """,
        (note_id, related_id),
      ).fetchone()
      if already:
        continue
      relation_id = make_id("rel", "related")
      relation_type = str(improvement.get("relation_type") or "related")
      connection.execute(
        """
        INSERT INTO relations (id, from_type, from_id, to_type, to_id, relation_type, created_by_agent_id, status, created_at)
        VALUES (?, 'note', ?, 'note', ?, ?, ?, 'active', ?)
        """,
        (relation_id, note_id, related_id, relation_type, agent_id, now),
      )
      created_relations.append(
        {
          "id": relation_id,
          "from_type": "note",
          "from_id": note_id,
          "to_type": "note",
          "to_id": related_id,
          "relation_type": relation_type,
          "created_by_agent_id": agent_id,
          "created_by": agent_id,
          "status": "active",
          "created_at": now,
        }
      )

    connection.execute(
      """
      INSERT INTO activity_events (id, project_id, agent_id, action, created_at)
      VALUES (?, ?, ?, ?, ?)
      """,
      (make_id("activity"), project_id, agent_id, f"mejoro la nota {title}.", now),
    )
    row = connection.execute(
      """
      SELECT notes.*, agents.name AS agent_name
      FROM notes JOIN agents ON agents.id = notes.created_by_agent_id
      WHERE notes.id = ?
      """,
      (note_id,),
    ).fetchone()
    upsert_note_vector(connection, row)
    connection.commit()

  return {
    "note": note_from_row(row),
    "tasks": created_tasks,
    "relations": created_relations,
  }


def list_activity(project_id: str | None = None) -> list[dict[str, Any]]:
  init_database()
  with connect() as connection:
    if project_id:
      rows = connection.execute(
        """
        SELECT activity_events.*, agents.name AS agent_name, agents.color
        FROM activity_events
        JOIN agents ON agents.id = activity_events.agent_id
        WHERE project_id = ?
        ORDER BY created_at DESC
        LIMIT 80
        """,
        (project_id,),
      ).fetchall()
    else:
      rows = connection.execute(
        """
        SELECT activity_events.*, agents.name AS agent_name, agents.color
        FROM activity_events
        JOIN agents ON agents.id = activity_events.agent_id
        ORDER BY created_at DESC
        LIMIT 80
        """
      ).fetchall()
  return [
    {
      "id": row["id"],
      "project_id": row["project_id"],
      "time": row["created_at"][11:16],
      "agent": row["agent_name"],
      "action": row["action"],
      "color": row["color"],
      "created_at": row["created_at"],
    }
    for row in rows
  ]


def insert_inbox_item(
  project_id: str,
  title: str,
  source: str,
  content: str,
  tags: list[str],
  status: str = "raw",
) -> str:
  init_database()
  item_id = make_id("inbox", title)
  with connect() as connection:
    connection.execute(
      """
      INSERT INTO inbox_items (id, project_id, title, status, source, tags, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      """,
      (item_id, project_id, title, status, source, json.dumps(tags), content, utc_now()),
    )
    connection.commit()
  return item_id


def get_settings() -> dict[str, str]:
  init_database()
  with connect() as connection:
    rows = connection.execute("SELECT key, value FROM app_settings").fetchall()
  settings = {row["key"]: row["value"] for row in rows}
  return {
    "model_provider": settings.get("model_provider", "ollama"),
    "model_base_url": settings.get("model_base_url", "http://localhost:11434"),
    "model_name": settings.get("model_name", "qwen3:4b"),
    "privacy_mode": settings.get("privacy_mode", "local_first"),
  }


def update_settings(data: dict[str, Any]) -> dict[str, str]:
  init_database()
  allowed = {"model_provider", "model_base_url", "model_name", "privacy_mode"}
  now = utc_now()
  with connect() as connection:
    for key, value in data.items():
      if key not in allowed:
        continue
      connection.execute(
        """
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """,
        (key, str(value), now),
      )
    connection.commit()
  return get_settings()


def get_project(connection: sqlite3.Connection, project_id: str | None) -> dict[str, Any]:
  if project_id:
    row = connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
  else:
    row = connection.execute("SELECT * FROM projects ORDER BY created_at LIMIT 1").fetchone()

  if row is None:
    raise ValueError("Project not found")

  return {
    "id": row["id"],
    "name": row["name"],
    "goal": row["goal"],
    "status": row["status"],
    "summary": row["canonical_summary"],
    "tags": json.loads(row["tags"]),
  }


def build_health(
  notes: list[dict[str, Any]],
  decisions: list[dict[str, Any]],
  inbox: list[dict[str, Any]],
  pending_patches: list[str],
) -> dict[str, int]:
  note_tokens = sum(note["tokens"] for note in notes)
  canonical_tokens = sum(note["tokens"] for note in notes if note["status"] in {"approved", "canonical"}) + (len(decisions) * 70)
  return {
    "raw_tokens": max(86400, note_tokens + len(inbox) * 1400),
    "canonical_tokens": max(1200, canonical_tokens),
    "codex_tokens": 2800,
    "claude_tokens": 3500,
    "unprocessed_outputs": sum(1 for item in inbox if item["status"] == "raw"),
    "deprecated_decisions": sum(1 for decision in decisions if decision["status"] == "superseded") or 2,
    "contradictions": 1,
    "notes_without_summary": 12,
    "pending_writes": len(pending_patches),
  }


def search_memory(query: str, limit: int = 8, project_id: str | None = None) -> list[dict[str, Any]]:
  init_database()
  query_like = f"%{query}%"
  with connect() as connection:
    note_rows = connection.execute(
      """
      SELECT notes.id, notes.project_id, projects.name AS project_name, notes.title, notes.content, notes.type, notes.status, notes.folder, notes.category
      FROM notes
      JOIN projects ON projects.id = notes.project_id
      WHERE (notes.title LIKE ? OR notes.content LIKE ? OR notes.type LIKE ?)
        AND (? IS NULL OR notes.project_id = ?)
      LIMIT ?
      """,
      (query_like, query_like, query_like, project_id, project_id, limit),
    ).fetchall()
    decision_rows = connection.execute(
      """
      SELECT decisions.id, decisions.project_id, projects.name AS project_name, decisions.text, decisions.status
      FROM decisions
      JOIN projects ON projects.id = decisions.project_id
      WHERE (decisions.text LIKE ? OR decisions.status LIKE ?)
        AND (? IS NULL OR decisions.project_id = ?)
      LIMIT ?
      """,
      (query_like, query_like, project_id, project_id, limit),
    ).fetchall()
    task_rows = connection.execute(
      """
      SELECT tasks.id, tasks.project_id, projects.name AS project_name, tasks.title, tasks.status
      FROM tasks
      JOIN projects ON projects.id = tasks.project_id
      WHERE (tasks.title LIKE ? OR tasks.status LIKE ?)
        AND (? IS NULL OR tasks.project_id = ?)
      LIMIT ?
      """,
      (query_like, query_like, project_id, project_id, limit),
    ).fetchall()

  results: list[dict[str, Any]] = []
  results.extend(
    {
      "id": row["id"],
      "project_id": row["project_id"],
      "project_name": row["project_name"],
      "kind": "note",
      "title": row["title"],
      "status": row["status"],
      "folder": row["folder"],
      "category": row["category"],
      "snippet": row["content"][:240],
    }
    for row in note_rows
  )
  results.extend(
    {
      "id": row["id"],
      "project_id": row["project_id"],
      "project_name": row["project_name"],
      "kind": "decision",
      "title": row["text"][:90],
      "status": row["status"],
      "snippet": row["text"],
    }
    for row in decision_rows
  )
  results.extend(
    {
      "id": row["id"],
      "project_id": row["project_id"],
      "project_name": row["project_name"],
      "kind": "task",
      "title": row["title"],
      "status": row["status"],
      "snippet": row["title"],
    }
    for row in task_rows
  )
  return results[:limit]


def get_note_by_id(note_id: str) -> dict[str, Any] | None:
  init_database()
  with connect() as connection:
    row = connection.execute(
      """
      SELECT notes.*, agents.name AS agent_name
      FROM notes JOIN agents ON agents.id = notes.created_by_agent_id
      WHERE notes.id = ?
      """,
      (note_id,),
    ).fetchone()
  if row is None:
    return None
  return note_from_row(row)


def get_project_context(
  project_id: str = "agent-memory-hub",
  target_agent: str = "Codex",
  goal: str = "Continue the MVP",
  token_budget: int = 2500,
) -> str:
  dashboard = get_dashboard(project_id)
  vector_limit = max(4, min(12, token_budget // 650))
  vector_hits = semantic_search_notes(goal or dashboard["project"]["summary"], limit=vector_limit, project_id=project_id)
  decisions = "\n".join(f"- {decision['text']}" for decision in dashboard["decisions"] if decision["status"] != "superseded")
  tasks = "\n".join(f"- [{task['status']}] {task['title']}" for task in dashboard["tasks"])
  notes = "\n".join(
    f"- [{note['status']}] {note['title']} ({note['type']}, source: {note['agent']}): {note['excerpt']}"
    for note in dashboard["notes"]
    if note["status"] in {"approved", "canonical", "review"}
  )
  vector_notes = "\n".join(
    f"- score {note['score']:.2f}: [{note['status']}] {note['title']} ({note['category']} / {note['folder'] or 'Loose'}): {note['snippet']}"
    for note in vector_hits
  )
  return f"""# Context for {target_agent}

## Goal
{goal}

## Project
{dashboard["project"]["name"]}: {dashboard["project"]["summary"]}

## Canonical Decisions
{decisions}

## Open Tasks
{tasks}

## Vector Retrieved Notes
{vector_notes}

## Project Notes
{notes}

## Shared Memory Protocol
- Search Neuronotes before asserting project state.
- Prefer vector retrieved notes when they match the current goal.
- Prefer canonical or approved notes; treat draft/proposed items as unverified.
- Keep source attribution when you use a note, decision, or task.
- Write back with a structured memory patch: proposed_notes, proposed_decisions, and proposed_tasks.
- Do not overwrite memory directly; the user reviews patches before they become project memory.

## Constraints
- Keep private notes local by default.
- Important agent writes require human approval.
- Prefer compact context under {token_budget} tokens.
- Local model: qwen3:4b via Ollama.
"""


def insert_agent_run(agent_id: str, project_id: str, input_summary: str, output_summary: str) -> None:
  init_database()
  run_id = f"run-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
  with connect() as connection:
    connection.execute(
      """
      INSERT INTO agent_runs (id, agent_id, project_id, input_summary, output_summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      """,
      (run_id, agent_id, project_id, input_summary[:500], output_summary[:500], utc_now()),
    )
    connection.execute(
      """
      INSERT INTO activity_events (id, project_id, agent_id, action, created_at)
      VALUES (?, ?, ?, ?, ?)
      """,
      (f"activity-{run_id}", project_id, agent_id, "analizo Inbox y genero memory patch.", utc_now()),
    )
    connection.commit()


def insert_memory_patch(project_id: str, agent_id: str, payload: dict[str, Any], status: str = "pending") -> str:
  init_database()
  patch_id = f"patch-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
  with connect() as connection:
    connection.execute(
      """
      INSERT INTO memory_patches (id, project_id, agent_id, status, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      """,
      (patch_id, project_id, agent_id, status, json.dumps(payload), utc_now()),
    )
    connection.commit()
  return patch_id


def get_memory_patch(patch_id: str) -> dict[str, Any] | None:
  init_database()
  with connect() as connection:
    row = connection.execute(
      "SELECT id, project_id, agent_id, status, payload, created_at FROM memory_patches WHERE id = ?",
      (patch_id,),
    ).fetchone()
  if row is None:
    return None
  return {
    "id": row["id"],
    "project_id": row["project_id"],
    "agent_id": row["agent_id"],
    "status": row["status"],
    "payload": json.loads(row["payload"]),
    "created_at": row["created_at"],
  }


def apply_memory_patch(
  project_id: str,
  agent_id: str,
  proposal: dict[str, Any],
  source_patch_id: str | None = None,
) -> dict[str, Any]:
  init_database()
  created_notes: list[str] = []
  created_tasks: list[str] = []
  created_decisions: list[str] = []
  created_relations: list[str] = []
  now = utc_now()

  with connect() as connection:
    agent = connection.execute("SELECT color FROM agents WHERE id = ?", (agent_id,)).fetchone()
    if agent is None:
      raise ValueError(
        f"Unknown agent_id '{agent_id}'. Memory patches must carry a known, registered agent for provenance integrity."
      )

    source_note_id: str | None = None
    for note in proposal.get("proposed_notes", []):
      title = str(note.get("title") or "Agent note").strip()
      content = str(note.get("content") or proposal.get("summary") or "").strip()
      note_id = make_id("note", title)
      connection.execute(
        """
        INSERT INTO notes (id, project_id, title, content, type, status, folder, category, created_by_agent_id, color, token_count, created_at)
        VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
        """,
        (
          note_id,
          project_id,
          title,
          content,
          str(note.get("type") or "Agent Draft"),
          str(note.get("folder") or ""),
          str(note.get("category") or proposal.get("category") or "AI Notes"),
          agent_id,
          agent["color"],
          estimate_tokens(content),
          now,
        ),
      )
      created_notes.append(note_id)
      source_note_id = source_note_id or note_id
      row = connection.execute(
        """
        SELECT notes.*, agents.name AS agent_name
        FROM notes JOIN agents ON agents.id = notes.created_by_agent_id
        WHERE notes.id = ?
        """,
        (note_id,),
      ).fetchone()
      upsert_note_vector(connection, row)

    for task in proposal.get("proposed_tasks", []):
      title = str(task.get("title") or "Agent task").strip()
      task_id = make_id("task", title)
      connection.execute(
        """
        INSERT INTO tasks (id, project_id, title, status, source_note_id, source_agent_id, created_at)
        VALUES (?, ?, ?, 'open', ?, ?, ?)
        """,
        (task_id, project_id, title, source_note_id, agent_id, now),
      )
      created_tasks.append(task_id)
      if source_note_id:
        relation_id = make_id("rel", title)
        connection.execute(
          """
          INSERT INTO relations (id, from_type, from_id, to_type, to_id, relation_type, created_by_agent_id, status, created_at)
          VALUES (?, 'note', ?, 'task', ?, 'suggested_from', ?, 'active', ?)
          """,
          (relation_id, source_note_id, task_id, agent_id, now),
        )
        created_relations.append(relation_id)

    for decision in proposal.get("proposed_decisions", []):
      text = str(decision.get("decision") or "").strip()
      if not text:
        continue
      decision_id = make_id("decision", text)
      connection.execute(
        """
        INSERT INTO decisions (id, project_id, text, status, source_note_id, source_agent_id, created_at)
        VALUES (?, ?, ?, 'proposed', ?, ?, ?)
        """,
        (decision_id, project_id, text, source_note_id, agent_id, now),
      )
      created_decisions.append(decision_id)
      if source_note_id:
        relation_id = make_id("rel", text)
        connection.execute(
          """
          INSERT INTO relations (id, from_type, from_id, to_type, to_id, relation_type, created_by_agent_id, status, created_at)
          VALUES (?, 'note', ?, 'decision', ?, 'suggested_from', ?, 'active', ?)
          """,
          (relation_id, source_note_id, decision_id, agent_id, now),
        )
        created_relations.append(relation_id)

    patch_id = make_id("patch", proposal.get("summary"))
    connection.execute(
      """
      INSERT INTO memory_patches (id, project_id, agent_id, status, payload, created_at)
      VALUES (?, ?, ?, 'applied', ?, ?)
      """,
      (patch_id, project_id, agent_id, json.dumps(proposal), now),
    )
    connection.execute(
      """
      INSERT INTO activity_events (id, project_id, agent_id, action, created_at)
      VALUES (?, ?, ?, ?, ?)
      """,
      (
        make_id("activity"),
        project_id,
        agent_id,
        f"aplico memory patch: {len(created_notes)} notas, {len(created_tasks)} tareas, {len(created_decisions)} decisiones.",
        now,
      ),
    )
    if source_patch_id:
      connection.execute(
        "UPDATE memory_patches SET status = 'applied' WHERE id = ?",
        (source_patch_id,),
      )
    connection.commit()

  return {
    "status": "applied",
    "notes": created_notes,
    "tasks": created_tasks,
    "decisions": created_decisions,
    "relations": created_relations,
  }


def export_codex_context(
  project_id: str,
  target_agent: str,
  goal: str,
  token_budget: int,
) -> list[str]:
  context = get_project_context(project_id, target_agent, goal, token_budget)
  export_dir = ROOT_DIR / "exports" / "codex"
  docs_dir = export_dir / "docs"
  docs_dir.mkdir(parents=True, exist_ok=True)

  files = {
    export_dir / "AGENTS.md": context,
    docs_dir / "context.md": context,
    docs_dir / "decisions.md": "\n".join(f"- {decision['text']}" for decision in get_dashboard(project_id)["decisions"]),
    docs_dir / "tasks.md": "\n".join(f"- [{task['status']}] {task['title']}" for task in get_dashboard(project_id)["tasks"]),
  }

  for path, content in files.items():
    path.write_text(content, encoding="utf-8")
  return [str(path) for path in files]
