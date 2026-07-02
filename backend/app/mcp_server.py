"""NeuroNotes MCP — any LLM plugs into the shared brain.

Nine tools: the ChatGPT connector pair (search/fetch), note CRUD, semantic
related notes and ask-your-brain retrieval. Transport picked by env:
stdio (default, Claude/Codex local) or SSE/streamable-http for ChatGPT.
"""

from __future__ import annotations

import os
from typing import Any

from mcp.server.fastmcp import FastMCP

from .database import (
  ask_context,
  create_note as db_create_note,
  delete_note as db_delete_note,
  get_note as db_get_note,
  init_database,
  list_notes as db_list_notes,
  related_notes as db_related_notes,
  rebuild_note_vectors,
  search_notes as db_search_notes,
  update_note as db_update_note,
)

# Base URL used to build citation links in ChatGPT search/fetch results.
APP_URL = os.getenv("NEURONOTES_PUBLIC_URL", "http://localhost:5173")

mcp = FastMCP(
  "neuronotes",
  host=os.getenv("NEURONOTES_MCP_HOST", "127.0.0.1"),
  port=int(os.getenv("NEURONOTES_MCP_PORT", "8788")),
)


def _note_url(note_id: str) -> str:
  return f"{APP_URL}/?nota={note_id}"


@mcp.tool()
def search(query: str) -> dict[str, Any]:
  """Search the brain by meaning. ChatGPT connector entry point.

  Returns {results: [{id, title, url}]}. Use `fetch` with an id for the full note.
  """
  hits = db_search_notes(query, 10)
  return {
    "results": [
      {"id": hit["id"], "title": hit["title"] or "(sin título)", "url": _note_url(hit["id"])}
      for hit in hits
    ]
  }


@mcp.tool()
def fetch(id: str) -> dict[str, Any]:
  """Fetch one note's full text by id. ChatGPT connector entry point."""
  note = db_get_note(id)
  if note is None:
    return {"id": id, "title": "(no encontrada)", "text": "", "url": "", "metadata": None}
  return {
    "id": note["id"],
    "title": note["title"],
    "text": note["content"],
    "url": _note_url(note["id"]),
    "metadata": {"tags": note["tags"], "created_by": note["created_by"], "updated_at": note["updated_at"]},
  }


@mcp.tool()
def list_notes(tag: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
  """List notes (newest first), optionally filtered by tag. Content excluded — use get_note."""
  notes = db_list_notes(tag=tag, limit=limit)
  return [{key: value for key, value in note.items() if key != "content"} for note in notes]


@mcp.tool()
def get_note(note_id: str) -> dict[str, Any]:
  """Read a full note by id."""
  note = db_get_note(note_id)
  return note or {"error": "not_found", "id": note_id}


@mcp.tool()
def create_note(
  title: str = "",
  content: str = "",
  tags: list[str] | None = None,
  created_by: str = "codex",
) -> dict[str, Any]:
  """Create a note. Empty title derives from content; empty tags are auto-suggested."""
  if not title.strip() and not content.strip():
    return {"error": "empty", "detail": "La nota necesita título o contenido."}
  return db_create_note({"title": title, "content": content, "tags": tags, "created_by": created_by})


@mcp.tool()
def update_note(
  note_id: str,
  title: str | None = None,
  content: str | None = None,
  tags: list[str] | None = None,
) -> dict[str, Any]:
  """Partially update a note — pass ONLY the fields you change."""
  data: dict[str, Any] = {}
  if title is not None:
    data["title"] = title
  if content is not None:
    data["content"] = content
  if tags is not None:
    data["tags"] = tags
  try:
    return db_update_note(note_id, data)
  except ValueError as error:
    return {"error": "not_found", "id": note_id, "detail": str(error)}


@mcp.tool()
def delete_note(note_id: str) -> dict[str, Any]:
  """Delete a note and its vector."""
  try:
    return db_delete_note(note_id)
  except ValueError as error:
    return {"error": "not_found", "id": note_id, "detail": str(error)}


@mcp.tool()
def related_notes(note_id: str, limit: int = 5) -> list[dict[str, Any]]:
  """Nearest notes in embedding space — the brain's computed connections."""
  return db_related_notes(note_id, limit)


@mcp.tool()
def ask_brain(question: str, limit: int = 6) -> list[dict[str, Any]]:
  """Retrieve the most relevant notes (with content) to answer a question."""
  return ask_context(question, limit)


@mcp.tool()
def rebuild_vectors() -> dict[str, Any]:
  """Re-embed every note with the configured embedding model."""
  return rebuild_note_vectors()


if __name__ == "__main__":
  init_database()
  transport = os.getenv("NEURONOTES_MCP_TRANSPORT", "stdio").lower()
  if transport == "sse":
    mcp.run(transport="sse")
  elif transport in ("http", "streamable-http"):
    mcp.run(transport="streamable-http")
  else:
    mcp.run()
