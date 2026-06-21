from __future__ import annotations

import os
from typing import Any

from mcp.server.fastmcp import FastMCP

from .database import (
  apply_memory_patch as db_apply_memory_patch,
  apply_note_improvement as db_apply_note_improvement,
  create_note as db_create_note,
  create_relation as db_create_relation,
  create_task as db_create_task,
  delete_note as db_delete_note,
  delete_relation as db_delete_relation,
  delete_task as db_delete_task,
  get_memory_patch as db_get_memory_patch,
  get_note_by_id,
  get_project_context as db_get_project_context,
  init_database,
  insert_memory_patch,
  list_memory_patches as db_list_memory_patches,
  list_notes as db_list_notes,
  list_relations as db_list_relations,
  list_tasks as db_list_tasks,
  reject_memory_patch as db_reject_memory_patch,
  search_memory as db_search_memory,
  semantic_search_notes as db_vector_search,
  update_note as db_update_note,
  update_task as db_update_task,
)

# Base URL used to build citation links in ChatGPT search/fetch results.
APP_URL = os.getenv("NEURONOTES_PUBLIC_URL", "http://localhost:5173")

# Host/port matter only for the HTTP/SSE transport (used by ChatGPT). The
# stdio transport (Claude/Codex local) ignores them.
mcp = FastMCP(
  "neuronotes-2",
  host=os.getenv("NEURONOTES_MCP_HOST", "127.0.0.1"),
  port=int(os.getenv("NEURONOTES_MCP_PORT", "8788")),
)


@mcp.tool()
def search_memory(query: str, limit: int = 8) -> list[dict[str, Any]]:
  """Search notes, tasks, and decisions in Neuronotes memory."""
  return db_search_memory(query, limit)


@mcp.tool()
def vector_search(query: str, limit: int = 8, project_id: str | None = None) -> list[dict[str, Any]]:
  """Semantic vector search over note memory for RAG retrieval."""
  return db_vector_search(query, limit, project_id)


@mcp.tool()
def list_notes(project_id: str = "agent-memory-hub") -> list[dict[str, Any]]:
  """List notes for a project."""
  return db_list_notes(project_id)


@mcp.tool()
def get_project_context(
  project_id: str = "agent-memory-hub",
  target_agent: str = "Claude",
  goal: str = "Use the current project memory",
  token_budget: int = 3000,
) -> str:
  """Return compact canonical context for an agent."""
  return db_get_project_context(project_id, target_agent, goal, token_budget)


@mcp.tool()
def get_note(note_id: str) -> dict[str, Any]:
  """Read a note by id."""
  note = get_note_by_id(note_id)
  return note or {"error": "note_not_found", "id": note_id}


@mcp.tool()
def create_note(
  project_id: str,
  title: str,
  content: str = "",
  type: str = "Agent Draft",
  status: str = "draft",
  folder: str = "",
  category: str = "AI Notes",
  created_by_agent_id: str = "codex",
) -> dict[str, Any]:
  """Create a note in the shared brain."""
  return db_create_note(
    {
      "project_id": project_id,
      "title": title,
      "content": content,
      "type": type,
      "status": status,
      "folder": folder,
      "category": category,
      "created_by_agent_id": created_by_agent_id,
    }
  )


@mcp.tool()
def update_note(
  note_id: str,
  project_id: str,
  title: str,
  content: str = "",
  type: str = "Agent Draft",
  status: str = "draft",
  folder: str = "",
  category: str = "AI Notes",
  created_by_agent_id: str = "codex",
) -> dict[str, Any]:
  """Update a note in the shared brain."""
  return db_update_note(
    note_id,
    {
      "project_id": project_id,
      "title": title,
      "content": content,
      "type": type,
      "status": status,
      "folder": folder,
      "category": category,
      "created_by_agent_id": created_by_agent_id,
    },
  )


@mcp.tool()
def list_tasks(project_id: str = "agent-memory-hub") -> list[dict[str, Any]]:
  """List project tasks."""
  return db_list_tasks(project_id)


@mcp.tool()
def create_task(
  project_id: str,
  title: str,
  status: str = "open",
  source_note_id: str | None = None,
  source_agent_id: str = "codex",
) -> dict[str, Any]:
  """Create a task attached to a project and optionally a source note."""
  return db_create_task(
    {
      "project_id": project_id,
      "title": title,
      "status": status,
      "source_note_id": source_note_id,
      "source_agent_id": source_agent_id,
    }
  )


@mcp.tool()
def update_task(
  task_id: str,
  project_id: str,
  title: str,
  status: str = "open",
  source_note_id: str | None = None,
) -> dict[str, Any]:
  """Update a project task."""
  return db_update_task(
    task_id,
    {
      "project_id": project_id,
      "title": title,
      "status": status,
      "source_note_id": source_note_id,
    },
  )


@mcp.tool()
def list_relations(project_id: str = "agent-memory-hub") -> list[dict[str, Any]]:
  """List active relations between notes, tasks, and decisions."""
  return db_list_relations(project_id)


@mcp.tool()
def link_notes(
  from_note_id: str,
  to_note_id: str,
  relation_type: str = "related",
  created_by_agent_id: str = "codex",
) -> dict[str, Any]:
  """Create a relation between two notes."""
  return db_create_relation(
    {
      "from_type": "note",
      "from_id": from_note_id,
      "to_type": "note",
      "to_id": to_note_id,
      "relation_type": relation_type,
      "created_by_agent_id": created_by_agent_id,
      "status": "active",
    }
  )


@mcp.tool()
def submit_memory_patch(
  project_id: str,
  agent_id: str,
  payload: dict[str, Any],
) -> dict[str, str]:
  """Submit a structured memory patch for human approval."""
  patch_id = insert_memory_patch(project_id, agent_id, payload)
  return {"id": patch_id, "status": "pending"}


@mcp.tool()
def improve_note(
  note_id: str,
  title: str | None = None,
  content: str | None = None,
  category: str | None = None,
  folder: str | None = None,
  status: str = "review",
  tasks: list[str] | None = None,
  related_note_ids: list[str] | None = None,
  relation_type: str = "related",
  created_by_agent_id: str = "codex",
) -> dict[str, Any]:
  """Apply an agent-authored improvement to an existing note.

  Non-destructive by default: the note lands as 'review' for human sign-off.
  Read the note first with get_note, then pass ONLY the fields you changed;
  omitted fields keep their current value. Optionally attach follow-up tasks
  and links to related notes.
  """
  improvement: dict[str, Any] = {"status": status, "relation_type": relation_type}
  if title is not None:
    improvement["title"] = title
  if content is not None:
    improvement["content"] = content
  if category is not None:
    improvement["category"] = category
  if folder is not None:
    improvement["folder"] = folder
  if tasks:
    improvement["tasks"] = tasks
  if related_note_ids:
    improvement["related_note_ids"] = related_note_ids
  return db_apply_note_improvement(note_id, improvement, created_by_agent_id)


@mcp.tool()
def delete_note(note_id: str) -> dict[str, Any]:
  """Delete a note and clean up its vectors, relations, and task/decision links."""
  try:
    return db_delete_note(note_id)
  except ValueError as error:
    return {"error": "not_found", "id": note_id, "detail": str(error)}


@mcp.tool()
def delete_task(task_id: str) -> dict[str, Any]:
  """Delete a task and its relations."""
  try:
    return db_delete_task(task_id)
  except ValueError as error:
    return {"error": "not_found", "id": task_id, "detail": str(error)}


@mcp.tool()
def delete_relation(relation_id: str) -> dict[str, Any]:
  """Delete a single relation (link) by id."""
  try:
    return db_delete_relation(relation_id)
  except ValueError as error:
    return {"error": "not_found", "id": relation_id, "detail": str(error)}


@mcp.tool()
def list_memory_patches(status: str = "pending", project_id: str | None = None) -> list[dict[str, Any]]:
  """List submitted memory patches awaiting review. Filter by status (pending/applied/rejected) and project."""
  return db_list_memory_patches(status or None, project_id)


@mcp.tool()
def reject_memory_patch(patch_id: str) -> dict[str, Any]:
  """Reject a pending memory patch so it is never applied."""
  try:
    return db_reject_memory_patch(patch_id)
  except ValueError as error:
    return {"error": "invalid", "id": patch_id, "detail": str(error)}


@mcp.tool()
def approve_memory_patch(patch_id: str) -> dict[str, Any]:
  """Approve and apply a pending memory patch, writing its notes/tasks/decisions into the brain."""
  patch = db_get_memory_patch(patch_id)
  if patch is None:
    return {"error": "not_found", "id": patch_id}
  if patch["status"] != "pending":
    return {"error": "not_pending", "id": patch_id, "status": patch["status"]}
  try:
    return db_apply_memory_patch(
      patch["project_id"], patch["agent_id"], patch["payload"], source_patch_id=patch["id"]
    )
  except ValueError as error:
    return {"error": "invalid", "id": patch_id, "detail": str(error)}


@mcp.tool()
def search(query: str) -> dict[str, Any]:
  """Search the Neuronotes brain by meaning and return matching notes.

  ChatGPT connector / deep-research entry point. Returns {results: [{id, title, url}]}.
  Use the returned id with the `fetch` tool to read the full note.
  """
  hits = db_vector_search(query, 10, None)
  results = [
    {
      "id": hit["id"],
      "title": hit.get("title") or "(sin título)",
      "url": f"{APP_URL}/?note={hit['id']}",
    }
    for hit in hits
  ]
  return {"results": results}


@mcp.tool()
def fetch(id: str) -> dict[str, Any]:
  """Fetch the full text of one note by id.

  ChatGPT connector / deep-research entry point. Returns {id, title, text, url, metadata}.
  """
  note = get_note_by_id(id)
  if note is None:
    return {"id": id, "title": "(no encontrada)", "text": "", "url": "", "metadata": None}
  return {
    "id": note["id"],
    "title": note.get("title") or "(sin título)",
    "text": note.get("content") or "",
    "url": f"{APP_URL}/?note={note['id']}",
    "metadata": {
      "project_id": note.get("project_id"),
      "category": note.get("category"),
      "folder": note.get("folder"),
      "status": note.get("status"),
      "agent": note.get("created_by_agent_id"),
    },
  }


if __name__ == "__main__":
  init_database()
  # Default stdio (Claude/Codex local). Set NEURONOTES_MCP_TRANSPORT=sse for
  # ChatGPT (remote): serves the SSE endpoint at /sse on NEURONOTES_MCP_PORT.
  transport = os.getenv("NEURONOTES_MCP_TRANSPORT", "stdio").lower()
  if transport == "sse":
    mcp.run(transport="sse")
  elif transport in ("http", "streamable-http"):
    mcp.run(transport="streamable-http")
  else:
    mcp.run()
