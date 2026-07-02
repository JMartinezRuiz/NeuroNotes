"""NeuroNotes store — one table of notes, real embeddings, everything else computed.

The AI-first bet: the user only writes notes. Organization (tags), connections
(related notes) and layout (the 3D map) are DERIVED from the note embeddings,
never curated by hand. Local-first: SQLite on disk + a local embedding model
(Ollama), with a deterministic hash fallback so nothing ever breaks offline.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sqlite3
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx

ROOT_DIR = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.getenv("NEURONOTES_DB_PATH", str(ROOT_DIR / "data" / "neuronotes.db")))
VECTOR_DIMENSIONS = 256
VECTOR_MODEL = "local-hash-v2"
SCHEMA_VERSION = 3
_DB_INITIALIZED = False
DATA_IMAGE_PATTERN = re.compile(r"!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]+\)", re.IGNORECASE)
MARKDOWN_IMAGE_PATTERN = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")

KNOWN_AGENTS = {"user", "claude", "codex", "qwen", "chatgpt"}

# Minimal es+en stopword set for the heuristic tagger (no model required).
_STOPWORDS = {
  "para", "como", "esta", "este", "esto", "pero", "porque", "cuando", "donde", "entre", "desde",
  "hasta", "sobre", "tiene", "tienen", "hacer", "puede", "pueden", "debe", "deben", "cada", "todo",
  "toda", "todos", "todas", "unos", "unas", "otro", "otra", "otros", "otras", "ellos", "ellas",
  "nosotros", "usted", "ustedes", "tambien", "también", "más", "menos", "muy", "solo", "sólo",
  "sin", "con", "una", "uno", "los", "las", "del", "que", "por", "sus", "son", "ser", "fue",
  "hay", "nota", "notas",
  "the", "and", "for", "that", "this", "with", "from", "have", "has", "was", "were", "will",
  "would", "could", "should", "there", "their", "about", "which", "when", "where", "what",
  "into", "over", "under", "then", "than", "them", "they", "your", "some", "note", "notes",
}


def utc_now() -> str:
  return datetime.now(timezone.utc).isoformat()


def make_id(text: str | None = None) -> str:
  if text:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:42]
    if slug:
      return f"note-{slug}-{uuid4().hex[:8]}"
  return f"note-{uuid4().hex[:12]}"


def estimate_tokens(text: str) -> int:
  words = re.findall(r"\S+", text or "")
  return max(1, int(len(words) * 1.35))


def connect() -> sqlite3.Connection:
  DB_PATH.parent.mkdir(parents=True, exist_ok=True)
  connection = sqlite3.connect(DB_PATH, timeout=5.0)
  connection.row_factory = sqlite3.Row
  connection.execute("PRAGMA foreign_keys = ON")
  connection.execute("PRAGMA journal_mode = WAL")
  connection.execute("PRAGMA busy_timeout = 5000")
  return connection


def init_database() -> None:
  global _DB_INITIALIZED
  if _DB_INITIALIZED:
    return
  with connect() as connection:
    connection.executescript(
      """
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        created_by TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS note_vectors (
        note_id TEXT PRIMARY KEY,
        vector TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        model TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      """
    )
    defaults = {
      "model_provider": os.getenv("MODEL_PROVIDER", "ollama"),
      "model_base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
      "model_name": os.getenv("QWEN_MODEL", "qwen3:4b"),
      "embedding_model": os.getenv("NEURONOTES_EMBED_MODEL", "nomic-embed-text"),
      "privacy_mode": "local_first",
    }
    now = utc_now()
    for key, value in defaults.items():
      connection.execute(
        "INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)",
        (key, value, now),
      )
    connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
    connection.commit()
  _DB_INITIALIZED = True


# ---------------------------------------------------------------------------
# Settings


def get_settings() -> dict[str, str]:
  init_database()
  with connect() as connection:
    rows = connection.execute("SELECT key, value FROM app_settings").fetchall()
  settings = {row["key"]: row["value"] for row in rows}
  return {
    "model_provider": settings.get("model_provider", "ollama"),
    "model_base_url": settings.get("model_base_url", "http://localhost:11434"),
    "model_name": settings.get("model_name", "qwen3:4b"),
    "embedding_model": settings.get("embedding_model", "nomic-embed-text"),
    "privacy_mode": settings.get("privacy_mode", "local_first"),
  }


def update_settings(data: dict[str, Any]) -> dict[str, str]:
  init_database()
  allowed = {"model_provider", "model_base_url", "model_name", "embedding_model", "privacy_mode"}
  now = utc_now()
  with connect() as connection:
    for key, value in data.items():
      if key not in allowed:
        continue
      connection.execute(
        """
        INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """,
        (key, str(value), now),
      )
    connection.commit()
  _EMBEDDER_CACHE["value"] = None
  return get_settings()


# ---------------------------------------------------------------------------
# Text helpers


def clean_vector_text(text: str) -> str:
  without_embedded_images = DATA_IMAGE_PATTERN.sub(lambda match: f"image {match.group(1)}", text)
  with_image_context = MARKDOWN_IMAGE_PATTERN.sub(lambda match: f"{match.group(1)} {match.group(2)}", without_embedded_images)
  return re.sub(r"\s+", " ", with_image_context).strip()


def excerpt_of(text: str, limit: int = 220) -> str:
  return clean_vector_text(text)[:limit]


def source_hash(text: str) -> str:
  return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def vector_tokens(text: str) -> list[str]:
  words = re.findall(r"[^\W_]+", text.lower())
  tokens = [word for word in words if len(word) > 2]
  tokens.extend(f"{left}_{right}" for left, right in zip(tokens, tokens[1:]) if left != right)
  return tokens


def parse_tags(raw: Any) -> list[str]:
  if isinstance(raw, list):
    values = raw
  else:
    try:
      values = json.loads(raw or "[]")
    except (TypeError, ValueError):
      values = []
  seen: list[str] = []
  for value in values:
    tag = str(value).strip().lower()
    if tag and tag not in seen:
      seen.append(tag)
  return seen[:8]


def derive_title(content: str) -> str:
  for line in (content or "").splitlines():
    cleaned = re.sub(r"^[#>\-*\s\d.]+", "", line).strip()
    if cleaned:
      return cleaned[:60]
  return "Sin título"


def suggest_tags(title: str, content: str, limit: int = 3) -> list[str]:
  """Heuristic tags — instant and offline. The model-based enrich can refine."""
  words = re.findall(r"[^\W\d_]+", f"{title}\n{clean_vector_text(content)}".lower())
  counts = Counter(
    word for word in words if len(word) > 3 and word not in _STOPWORDS
  )
  return [word for word, _ in counts.most_common(limit)]


# ---------------------------------------------------------------------------
# Embeddings (ported intact from v2 — proven with nomic-embed-text 768-dim)


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


def l2_normalize(vector: list[float]) -> list[float]:
  length = math.sqrt(sum(value * value for value in vector))
  if length == 0:
    return [0.0] * len(vector)
  return [round(value / length, 6) for value in vector]


def _is_loopback(base_url: str) -> bool:
  lowered = base_url.lower()
  return any(host in lowered for host in ("127.0.0.1", "localhost", "::1", "0.0.0.0"))


def fetch_remote_embedding(
  text: str, model: str, base_url: str, provider: str, timeout: float = 20.0
) -> list[float] | None:
  base = base_url.rstrip("/")
  try:
    with httpx.Client(timeout=timeout) as client:
      if provider == "lmstudio":
        response = client.post(f"{base}/v1/embeddings", json={"model": model, "input": text})
        response.raise_for_status()
        vector = response.json()["data"][0]["embedding"]
      else:
        response = client.post(f"{base}/api/embed", json={"model": model, "input": text})
        response.raise_for_status()
        payload = response.json()
        vector = None
        if isinstance(payload.get("embeddings"), list) and payload["embeddings"]:
          vector = payload["embeddings"][0]
        elif isinstance(payload.get("embedding"), list):
          vector = payload["embedding"]
      if not vector:
        return None
      return l2_normalize([float(value) for value in vector])
  except Exception:
    return None


_EMBEDDER_CACHE: dict[str, Any] = {"at": 0.0, "value": None}
_EMBEDDER_TTL_SECONDS = 30.0


def resolve_embedder(force: bool = False) -> tuple[str, int, Any]:
  """Return (model_tag, dimensions, embed_fn) — neural model with hash fallback.

  privacy_mode=local_first BLOCKS embedding calls to any non-loopback endpoint,
  so note text never leaves this machine."""
  now = time.monotonic()
  cached = _EMBEDDER_CACHE["value"]
  if cached is not None and not force and (now - _EMBEDDER_CACHE["at"]) < _EMBEDDER_TTL_SECONDS:
    return cached

  settings = get_settings()
  embedding_model = (settings.get("embedding_model") or "").strip()
  base_url = settings.get("model_base_url", "http://localhost:11434")
  provider = settings.get("model_provider", "ollama").lower()
  privacy_mode = settings.get("privacy_mode", "local_first")

  resolved: tuple[str, int, Any] = (VECTOR_MODEL, VECTOR_DIMENSIONS, local_embedding)
  privacy_block = privacy_mode == "local_first" and not _is_loopback(base_url)
  if embedding_model and not privacy_block:
    probe = fetch_remote_embedding("neuronotes embedding probe", embedding_model, base_url, provider, timeout=12.0)
    if probe:
      dims = len(probe)

      def embed_fn(
        text: str, _model=embedding_model, _base=base_url, _provider=provider, _dims=dims
      ) -> list[float]:
        # Retry once: the local runner can 500/timeout transiently under GPU
        # pressure, and a hash vector mislabeled as neural poisons similarity.
        for attempt in range(2):
          vector = fetch_remote_embedding(text, _model, _base, _provider)
          if vector and len(vector) == _dims:
            return vector
          if attempt == 0:
            time.sleep(1.2)
        return local_embedding(text, _dims)

      resolved = (embedding_model, dims, embed_fn)

  _EMBEDDER_CACHE["value"] = resolved
  _EMBEDDER_CACHE["at"] = now
  return resolved


def dot_product(left: list[float], right: list[float]) -> float:
  return sum(a * b for a, b in zip(left, right))


def pca_project_3d(vectors: list[list[float]]) -> list[tuple[float, float, float]]:
  """PCA to 3D (power iteration, no deps): distance in the map = distance in
  embedding space — how an LLM 'sees' the notes near/far. Deterministic."""
  count = len(vectors)
  if count == 0:
    return []
  dim = max((len(vector) for vector in vectors), default=0)
  if dim == 0 or count == 1:
    return [(0.0, 0.0, 0.0) for _ in range(count)]
  vectors = [vector if len(vector) == dim else vector + [0.0] * (dim - len(vector)) for vector in vectors]

  mean = [0.0] * dim
  for vector in vectors:
    for i in range(dim):
      mean[i] += vector[i]
  for i in range(dim):
    mean[i] /= count
  centered = [[vector[i] - mean[i] for i in range(dim)] for vector in vectors]

  data = [row[:] for row in centered]
  components: list[list[float]] = []
  iterations = 40 if count <= 80 else 22
  for axis in range(3):
    component = [math.sin((i + 1) * (axis + 1) * 0.7) + 0.001 for i in range(dim)]
    norm = math.sqrt(sum(value * value for value in component)) or 1.0
    component = [value / norm for value in component]
    for _ in range(iterations):
      projected = [sum(data[r][i] * component[i] for i in range(dim)) for r in range(count)]
      accum = [0.0] * dim
      for r in range(count):
        weight = projected[r]
        row = data[r]
        for i in range(dim):
          accum[i] += row[i] * weight
      norm = math.sqrt(sum(value * value for value in accum)) or 1.0
      component = [value / norm for value in accum]
    components.append(component)
    for r in range(count):
      score = sum(data[r][i] * component[i] for i in range(dim))
      row = data[r]
      for i in range(dim):
        row[i] -= score * component[i]

  coords = [[sum(centered[r][i] * components[axis][i] for i in range(dim)) for axis in range(3)] for r in range(count)]
  for axis in range(3):
    values = [coord[axis] for coord in coords]
    low = min(values)
    span = (max(values) - low) or 1.0
    for coord in coords:
      coord[axis] = (coord[axis] - low) / span * 2 - 1
  return [(round(c[0], 5), round(c[1], 5), round(c[2], 5)) for c in coords]


# ---------------------------------------------------------------------------
# Vectors per note


def vector_source(row: sqlite3.Row | dict[str, Any]) -> str:
  def field(name: str) -> str:
    if isinstance(row, dict):
      return str(row.get(name, ""))
    return str(row[name] if name in row.keys() else "")

  tags = " ".join(parse_tags(field("tags")))
  return clean_vector_text("\n".join([field("title"), tags, field("content")]))


def upsert_note_vector(
  connection: sqlite3.Connection, row: sqlite3.Row, embedder: tuple[str, int, Any] | None = None
) -> dict[str, Any]:
  if embedder is None:
    embedder = resolve_embedder()
  model_tag, _dims_hint, embed_fn = embedder
  source = vector_source(row)
  fingerprint = source_hash(source)
  existing = connection.execute(
    "SELECT * FROM note_vectors WHERE note_id = ? AND source_hash = ? AND model = ?",
    (row["id"], fingerprint, model_tag),
  ).fetchone()
  if existing is not None:
    return {"vector": json.loads(existing["vector"]), "model": existing["model"], "dimensions": existing["dimensions"]}

  vector = embed_fn(source)
  connection.execute(
    """
    INSERT INTO note_vectors (note_id, vector, dimensions, model, source_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(note_id) DO UPDATE SET
      vector = excluded.vector,
      dimensions = excluded.dimensions,
      model = excluded.model,
      source_hash = excluded.source_hash,
      updated_at = excluded.updated_at
    """,
    (row["id"], json.dumps(vector), len(vector), model_tag, fingerprint, utc_now()),
  )
  return {"vector": vector, "model": model_tag, "dimensions": len(vector)}


def read_or_embed_vector(
  connection: sqlite3.Connection, row: sqlite3.Row, embedder: tuple[str, int, Any] | None = None
) -> dict[str, Any]:
  """Read the stored vector WITHOUT writing; embed only never-vectorized content
  (keeps GETs read-only — no write-lock storms)."""
  fingerprint = source_hash(vector_source(row))
  existing = connection.execute(
    "SELECT * FROM note_vectors WHERE note_id = ? AND source_hash = ?",
    (row["id"], fingerprint),
  ).fetchone()
  if existing is not None:
    return {"vector": json.loads(existing["vector"]), "model": existing["model"], "dimensions": existing["dimensions"]}
  return upsert_note_vector(connection, row, embedder)


def rebuild_note_vectors() -> dict[str, Any]:
  init_database()
  embedder = resolve_embedder(force=True)
  model_tag, dims_hint, _embed_fn = embedder
  with connect() as connection:
    # A true rebuild: drop every stored vector first so notes re-embed even when
    # the stored (note_id, source_hash, model) looks current — this is the repair
    # path for vectors written during an embedder outage.
    connection.execute("DELETE FROM note_vectors")
    rows = connection.execute("SELECT * FROM notes").fetchall()
    for row in rows:
      upsert_note_vector(connection, row, embedder)
    connection.commit()
  return {"rebuilt": len(rows), "dimensions": dims_hint, "model": model_tag}


# ---------------------------------------------------------------------------
# Notes CRUD


def note_from_row(row: sqlite3.Row) -> dict[str, Any]:
  return {
    "id": row["id"],
    "title": row["title"],
    "content": row["content"],
    "tags": parse_tags(row["tags"]),
    "created_by": row["created_by"],
    "created_at": row["created_at"],
    "updated_at": row["updated_at"],
    "excerpt": excerpt_of(row["content"]),
    "tokens": estimate_tokens(row["content"]),
  }


def list_notes(tag: str | None = None, limit: int = 500) -> list[dict[str, Any]]:
  init_database()
  with connect() as connection:
    rows = connection.execute(
      "SELECT * FROM notes ORDER BY updated_at DESC LIMIT ?", (max(1, min(limit, 2000)),)
    ).fetchall()
  notes = [note_from_row(row) for row in rows]
  if tag:
    wanted = tag.strip().lower()
    notes = [note for note in notes if wanted in note["tags"]]
  return notes


def get_note(note_id: str) -> dict[str, Any] | None:
  init_database()
  with connect() as connection:
    row = connection.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
  return note_from_row(row) if row else None


def create_note(data: dict[str, Any]) -> dict[str, Any]:
  init_database()
  content = str(data.get("content") or "")
  title = str(data.get("title") or "").strip() or derive_title(content)
  tags = parse_tags(data.get("tags"))
  if not tags:
    tags = suggest_tags(title, content)
  created_by = str(data.get("created_by") or "user").strip().lower()
  if created_by not in KNOWN_AGENTS:
    created_by = "user"
  now = utc_now()
  note_id = make_id(title)
  with connect() as connection:
    connection.execute(
      "INSERT INTO notes (id, title, content, tags, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      (note_id, title, content, json.dumps(tags), created_by, now, now),
    )
    row = connection.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    upsert_note_vector(connection, row)
    connection.commit()
  return note_from_row(row)


def update_note(note_id: str, data: dict[str, Any]) -> dict[str, Any]:
  """Partial update — only the provided fields change."""
  init_database()
  with connect() as connection:
    current = connection.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if current is None:
      raise ValueError("Note not found")
    content = str(data["content"]) if "content" in data and data["content"] is not None else current["content"]
    if "title" in data and data["title"] is not None and str(data["title"]).strip():
      title = str(data["title"]).strip()
    else:
      title = current["title"] if current["title"].strip() else derive_title(content)
    tags = parse_tags(data["tags"]) if "tags" in data and data["tags"] is not None else parse_tags(current["tags"])
    connection.execute(
      "UPDATE notes SET title = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?",
      (title, content, json.dumps(tags), utc_now(), note_id),
    )
    row = connection.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    upsert_note_vector(connection, row)
    connection.commit()
  return note_from_row(row)


def delete_note(note_id: str) -> dict[str, Any]:
  init_database()
  with connect() as connection:
    row = connection.execute("SELECT id FROM notes WHERE id = ?", (note_id,)).fetchone()
    if row is None:
      raise ValueError("Note not found")
    connection.execute("DELETE FROM note_vectors WHERE note_id = ?", (note_id,))
    connection.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    connection.commit()
  return {"deleted": note_id}


def all_tags(limit: int = 12) -> list[dict[str, Any]]:
  init_database()
  counts: Counter[str] = Counter()
  for note in list_notes():
    counts.update(note["tags"])
  return [{"tag": tag, "count": count} for tag, count in counts.most_common(limit)]


# ---------------------------------------------------------------------------
# Semantic retrieval — search, related, map, ask


def _scored_notes(query: str, limit: int) -> list[dict[str, Any]]:
  embedder = resolve_embedder()
  model_tag, _dims, embed_fn = embedder
  query_vector = embed_fn(query)
  query_terms = set(vector_tokens(query))
  with connect() as connection:
    rows = connection.execute("SELECT * FROM notes ORDER BY updated_at DESC").fetchall()
    payloads = [(row, read_or_embed_vector(connection, row, embedder)) for row in rows]
    connection.commit()
  is_neural = model_tag != VECTOR_MODEL
  lexical_weight = 0.3 if is_neural else 0.85
  vector_weight = 0.7 if is_neural else 0.15
  results = []
  for row, payload in payloads:
    doc_terms = set(vector_tokens(vector_source(row)))
    lexical_score = 0.0
    if query_terms and doc_terms:
      lexical_score = len(query_terms & doc_terms) / math.sqrt(len(query_terms) * len(doc_terms))
    vector_score = (
      dot_product(query_vector, payload["vector"]) if len(payload["vector"]) == len(query_vector) else 0.0
    )
    item = note_from_row(row)
    item.pop("content")
    item["score"] = round(lexical_score * lexical_weight + vector_score * vector_weight, 4)
    item["vector_score"] = round(vector_score, 4)
    item["lexical_score"] = round(lexical_score, 4)
    results.append(item)
  results.sort(key=lambda item: item["score"], reverse=True)
  return results[: max(1, min(limit, 50))]


def search_notes(query: str, limit: int = 12) -> list[dict[str, Any]]:
  init_database()
  return _scored_notes(query, limit)


def related_notes(note_id: str, limit: int = 5) -> list[dict[str, Any]]:
  """The AI-first replacement for manual links: nearest notes in embedding space."""
  init_database()
  embedder = resolve_embedder()
  with connect() as connection:
    anchor = connection.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if anchor is None:
      return []
    anchor_vector = read_or_embed_vector(connection, anchor, embedder)["vector"]
    rows = connection.execute("SELECT * FROM notes WHERE id != ?", (note_id,)).fetchall()
    payloads = [(row, read_or_embed_vector(connection, row, embedder)) for row in rows]
    connection.commit()
  results = []
  for row, payload in payloads:
    if len(payload["vector"]) != len(anchor_vector):
      continue
    score = dot_product(anchor_vector, payload["vector"])
    item = note_from_row(row)
    item.pop("content")
    item["score"] = round(score, 4)
    results.append(item)
  results.sort(key=lambda item: item["score"], reverse=True)
  return results[: max(1, min(limit, 20))]


def memory_map() -> dict[str, Any]:
  init_database()
  embedder = resolve_embedder()
  model_tag, dims_hint, _embed_fn = embedder
  with connect() as connection:
    rows = connection.execute("SELECT * FROM notes ORDER BY updated_at DESC").fetchall()
    payloads = [(row, read_or_embed_vector(connection, row, embedder)) for row in rows]
    connection.commit()

  vectors = [payload["vector"] for _row, payload in payloads]
  projection = pca_project_3d(vectors)
  nodes = []
  for index, (row, _payload) in enumerate(payloads):
    node = note_from_row(row)
    node.pop("content")
    x, y, z = projection[index] if index < len(projection) else (0.0, 0.0, 0.0)
    node["x"], node["y"], node["z"] = x, y, z
    nodes.append(node)

  # Semantic edges: top-3 neighbors per note above a similarity floor; the
  # single best neighbor is marked "strong" (drawn in teal). Skipped above
  # ~140 notes — at that scale edges are an illegible hairball and the PCA
  # positions already convey proximity.
  semantic_threshold = 0.55 if model_tag != VECTOR_MODEL else 0.18
  edges: list[dict[str, Any]] = []
  seen_pairs: set[str] = set()
  if len(nodes) <= 140:
    for left_index in range(len(vectors)):
      scores: list[tuple[float, int]] = []
      for right_index in range(len(vectors)):
        if left_index == right_index or len(vectors[left_index]) != len(vectors[right_index]):
          continue
        score = dot_product(vectors[left_index], vectors[right_index])
        if score >= semantic_threshold:
          scores.append((score, right_index))
      scores.sort(reverse=True)
      for rank, (score, right_index) in enumerate(scores[:3]):
        key = "::".join(sorted((nodes[left_index]["id"], nodes[right_index]["id"])))
        if key in seen_pairs:
          continue
        seen_pairs.add(key)
        edges.append(
          {
            "id": f"sem-{key}",
            "from_id": nodes[left_index]["id"],
            "to_id": nodes[right_index]["id"],
            "score": round(score, 4),
            "source": "strong" if rank == 0 else "semantic",
          }
        )

  return {
    "nodes": nodes,
    "edges": edges[: max(80, len(nodes) * 2)],
    "dimensions": dims_hint,
    "model": model_tag,
  }


def ask_context(question: str, limit: int = 6) -> list[dict[str, Any]]:
  """Retrieval half of ask-your-brain: the top notes for a question, with content."""
  init_database()
  hits = _scored_notes(question, limit)
  ids = [hit["id"] for hit in hits]
  with connect() as connection:
    rows = {
      row["id"]: row
      for row in connection.execute(
        f"SELECT * FROM notes WHERE id IN ({','.join('?' * len(ids))})", ids
      ).fetchall()
    } if ids else {}
  for hit in hits:
    row = rows.get(hit["id"])
    hit["content"] = row["content"] if row else ""
  return hits
