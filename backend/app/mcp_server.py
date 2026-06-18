from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from .database import (
  create_note as db_create_note,
  create_relation as db_create_relation,
  create_task as db_create_task,
  get_note_by_id,
  get_project_context as db_get_project_context,
  init_database,
  insert_memory_patch,
  list_notes as db_list_notes,
  list_relations as db_list_relations,
  list_tasks as db_list_tasks,
  search_memory as db_search_memory,
  semantic_search_notes as db_vector_search,
  update_note as db_update_note,
  update_task as db_update_task,
)

mcp = FastMCP("neuronotes-2")


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


if __name__ == "__main__":
  init_database()
  mcp.run()
