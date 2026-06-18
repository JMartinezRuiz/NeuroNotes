from __future__ import annotations

import os
import secrets
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.requests import Request
from starlette.responses import JSONResponse

from .database import (
  apply_memory_patch,
  apply_note_improvement,
  create_note,
  create_project,
  create_relation,
  create_task,
  export_codex_context,
  get_settings,
  get_dashboard,
  get_memory_patch,
  get_note_by_id,
  get_project_context,
  init_database,
  insert_inbox_item,
  insert_agent_run,
  insert_memory_patch,
  list_activity,
  list_notes,
  list_projects,
  list_relations,
  list_tasks,
  rebuild_note_vectors,
  search_memory,
  semantic_search_notes,
  update_note,
  update_project,
  update_settings,
  update_task,
  vector_memory_map,
)
from .ollama_client import ask_qwen_json, get_model_health, model_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
  init_database()
  yield


app = FastAPI(title="Neuronotes 2.0 API", version="0.1.0", lifespan=lifespan)

# Optional shared-secret token. When NEURONOTES_API_TOKEN is set (the desktop
# app sets it automatically), every mutating request must present it. Read-only
# GET requests stay open. This is defense-in-depth on top of the CORS lockdown.
API_TOKEN = os.getenv("NEURONOTES_API_TOKEN", "").strip()
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def enforce_api_token(request: Request, call_next):
  if API_TOKEN and request.method not in _SAFE_METHODS:
    provided = ""
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
      provided = authorization[7:].strip()
    if not provided:
      provided = request.headers.get("x-neuronotes-token", "").strip()
    if not provided or not secrets.compare_digest(provided, API_TOKEN):
      return JSONResponse({"detail": "Missing or invalid API token."}, status_code=401)
  return await call_next(request)


# Lock CORS down to local origins so an arbitrary website the user visits cannot
# issue cross-origin writes to the local memory API. Override with a comma-
# separated NEURONOTES_ALLOWED_ORIGINS when serving from a custom origin. The
# "null" origin keeps the packaged Electron (file://) renderer working.
_allowed_origins_env = os.getenv("NEURONOTES_ALLOWED_ORIGINS", "").strip()
if _allowed_origins_env:
  app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _allowed_origins_env.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
  )
else:
  app.add_middleware(
    CORSMiddleware,
    allow_origins=["null"],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
  )


class AnalyzeRequest(BaseModel):
  content: str = Field(min_length=1)
  project_id: str = "agent-memory-hub"
  source_agent: str | None = None


class CompileRequest(BaseModel):
  project_id: str = "agent-memory-hub"
  target_agent: str = "Codex"
  goal: str = "Continue the MVP"
  token_budget: int = Field(default=2500, ge=400, le=20000)


class PatchRequest(BaseModel):
  project_id: str = "agent-memory-hub"
  agent_id: str = "qwen"
  payload: dict[str, Any]


class ApplyMemoryRequest(BaseModel):
  project_id: str = "agent-memory-hub"
  agent_id: str = "qwen"
  proposal: dict[str, Any] = Field(default_factory=dict)
  patch_id: str | None = None
  approved: bool = False


class ProjectRequest(BaseModel):
  name: str = Field(min_length=1)
  goal: str = ""
  status: str = "active"
  summary: str = ""
  tags: list[str] = []


class NoteRequest(BaseModel):
  project_id: str
  title: str = Field(min_length=1)
  content: str = ""
  type: str = "Human Note"
  status: str = "draft"
  folder: str = ""
  category: str = "General"
  created_by_agent_id: str = "user"


class TaskRequest(BaseModel):
  project_id: str
  title: str = Field(min_length=1)
  status: str = "open"
  source_note_id: str | None = None
  source_agent_id: str = "user"


class RelationRequest(BaseModel):
  from_type: str = "note"
  from_id: str
  to_type: str = "note"
  to_id: str
  relation_type: str = "related"
  created_by_agent_id: str = "user"
  status: str = "active"


class ImproveNoteRequest(BaseModel):
  agent_id: str = "qwen"
  mode: str = "format"
  goal: str = "Format and polish this quick note without adding new information."


class SettingsRequest(BaseModel):
  model_provider: str = "ollama"
  model_base_url: str = "http://localhost:11434"
  model_name: str = "qwen3:4b"
  embedding_model: str = ""
  privacy_mode: str = "local_first"


@app.get("/api/health")
async def health() -> dict[str, str]:
  return {"status": "ok", "app": "Neuronotes 2.0"}


@app.get("/api/health/model")
async def model_health() -> dict[str, Any]:
  return await get_model_health()


@app.get("/api/dashboard")
def dashboard(project_id: str | None = None) -> dict[str, Any]:
  try:
    return get_dashboard(project_id)
  except ValueError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/projects")
def projects() -> list[dict[str, Any]]:
  return list_projects()


@app.post("/api/projects")
def create_project_endpoint(request: ProjectRequest) -> dict[str, Any]:
  return create_project(request.model_dump())


@app.put("/api/projects/{project_id}")
def update_project_endpoint(project_id: str, request: ProjectRequest) -> dict[str, Any]:
  try:
    return update_project(project_id, request.model_dump())
  except ValueError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/notes")
def notes(
  project_id: str | None = None,
  folder: str | None = None,
  category: str | None = None,
) -> list[dict[str, Any]]:
  return list_notes(project_id, folder, category)


@app.post("/api/notes")
def create_note_endpoint(request: NoteRequest) -> dict[str, Any]:
  return create_note(request.model_dump())


@app.put("/api/notes/{note_id}")
def update_note_endpoint(note_id: str, request: NoteRequest) -> dict[str, Any]:
  try:
    return update_note(note_id, request.model_dump())
  except ValueError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/api/notes/{note_id}/improve")
async def improve_note_endpoint(note_id: str, request: ImproveNoteRequest) -> dict[str, Any]:
  note = get_note_by_id(note_id)
  if note is None:
    raise HTTPException(status_code=404, detail="Note not found")
  sibling_notes = [item for item in list_notes(note["project_id"]) if item["id"] != note_id]
  project_catalog = list_projects()
  existing_notes = list_notes()
  folders = sorted({item.get("folder", "") for item in existing_notes if item.get("folder")})
  categories = sorted({item.get("category", "General") for item in existing_notes if item.get("category")})
  mode = request.mode if request.mode in {"format", "grammar", "clean", "categorize"} else "format"
  mode_rules = {
    "format": "Improve formatting, casing, punctuation and scannability. Do not add new information.",
    "grammar": "Only correct grammar, spelling, punctuation and casing. Preserve structure and length.",
    "clean": "Turn the quick note into a clean version with concise headings or bullets when useful. Do not invent facts.",
    "categorize": "Prioritize project_id, folder, category and type assignment. Keep content almost unchanged except obvious typos.",
  }[mode]
  system_prompt = """
You format and polish quick notes for Neuronotes 2.0.
Return strict JSON:
{
  "project_id": string,
  "folder": string,
  "category": string,
  "title": string,
  "content": string,
  "type": "Human Note" | "Project Note" | "Research" | "Decision" | "Meeting" | "Task Source" | "Agent Draft",
  "status": "draft" | "review" | "canonical",
  "tasks": [{"title": string}],
  "related_note_ids": string[],
  "relation_type": string
}
Rules:
- Preserve the user's meaning and facts.
- Do not add new claims, examples, analysis, or filler.
- Keep the note close to the original length unless formatting requires short headings or bullets.
- Correct grammar, spelling, punctuation, casing, and messy phrasing.
- Use clean Spanish Markdown.
- Add headings only when they make the existing note easier to scan.
- Extract tasks only when the original note clearly contains action items.
- Choose a better project_id, folder, and category only if the existing options make the assignment obvious.
"""
  system_prompt += f"\nMode: {mode}\nMode-specific rule: {mode_rules}\n"
  related_catalog = "\n".join(f"- {item['id']}: {item['title']} :: {item['excerpt']}" for item in sibling_notes[:16])
  project_options = "\n".join(f"- {project['id']}: {project['name']} :: {project['summary']}" for project in project_catalog)
  user_prompt = f"""
Goal: {request.goal}

Candidate projects:
{project_options}

Existing folders:
{", ".join(folders) or "none"}

Existing categories:
{", ".join(categories) or "General"}

Current note:
Title: {note['title']}
Type: {note['type']}
Status: {note['status']}
Folder: {note.get('folder', '')}
Category: {note.get('category', 'General')}
Content:
{note['content']}

Candidate related notes:
{related_catalog}
"""
  try:
    improvement = await ask_qwen_json(system_prompt, user_prompt)
    improvement["local_fallback"] = False
    improvement["used_model"] = model_settings()["model"]
  except Exception:
    improvement = heuristic_note_improvement(note, sibling_notes)

  improvement = normalize_improvement(improvement, note)
  valid_project_ids = {project["id"] for project in project_catalog}
  if improvement.get("project_id") not in valid_project_ids:
    improvement["project_id"] = note["project_id"]
  if improvement.get("folder") is None:
    improvement["folder"] = note.get("folder", "")
  if not str(improvement.get("category") or "").strip():
    improvement["category"] = note.get("category", "General")
  try:
    result = apply_note_improvement(note_id, improvement, request.agent_id)
  except ValueError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error
  result["proposal"] = improvement
  return result


@app.get("/api/tasks")
def tasks(project_id: str | None = None) -> list[dict[str, Any]]:
  return list_tasks(project_id)


@app.post("/api/tasks")
def create_task_endpoint(request: TaskRequest) -> dict[str, Any]:
  return create_task(request.model_dump())


@app.put("/api/tasks/{task_id}")
def update_task_endpoint(task_id: str, request: TaskRequest) -> dict[str, Any]:
  try:
    return update_task(task_id, request.model_dump())
  except ValueError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/relations")
def relations(project_id: str | None = None) -> list[dict[str, Any]]:
  return list_relations(project_id)


@app.post("/api/relations")
def create_relation_endpoint(request: RelationRequest) -> dict[str, Any]:
  return create_relation(request.model_dump())


@app.get("/api/activity")
def activity(project_id: str | None = None) -> list[dict[str, Any]]:
  return list_activity(project_id)


@app.get("/api/settings")
def settings() -> dict[str, str]:
  return get_settings()


@app.put("/api/settings")
def save_settings(request: SettingsRequest) -> dict[str, str]:
  return update_settings(request.model_dump())


@app.get("/api/search")
def search(query: str, limit: int = 8, project_id: str | None = None) -> list[dict[str, Any]]:
  return search_memory(query, limit, project_id)


@app.post("/api/vectors/rebuild")
def rebuild_vectors(project_id: str | None = None) -> dict[str, Any]:
  return rebuild_note_vectors(project_id)


@app.get("/api/vectors/search")
def vector_search(query: str, limit: int = 8, project_id: str | None = None) -> list[dict[str, Any]]:
  if len(query.strip()) < 2:
    return []
  return semantic_search_notes(query, limit, project_id)


@app.get("/api/vectors/map")
def vectors_map(
  project_id: str | None = None,
  folder: str | None = None,
  category: str | None = None,
) -> dict[str, Any]:
  return vector_memory_map(project_id, folder, category)


@app.get("/api/notes/{note_id}")
def note(note_id: str) -> dict[str, Any]:
  result = get_note_by_id(note_id)
  if result is None:
    raise HTTPException(status_code=404, detail="Note not found")
  return result


@app.post("/api/inbox/analyze")
async def analyze_inbox(request: AnalyzeRequest) -> dict[str, Any]:
  system_prompt = """
You classify raw memory for Neuronotes 2.0.
Return strict JSON with this shape:
{
  "project_suggested": string,
  "type": string,
  "author": string,
  "tags": string[],
  "summary": string,
  "proposed_notes": [{"title": string, "type": string, "content": string}],
  "proposed_decisions": [{"decision": string, "reason": string}],
  "proposed_tasks": [{"title": string, "priority": "low" | "medium" | "high"}]
}
Use concise Spanish without markdown.
"""
  user_prompt = f"""
Project id: {request.project_id}
Source agent hint: {request.source_agent or "unknown"}

Raw content:
{request.content}
"""

  try:
    proposal = await ask_qwen_json(system_prompt, user_prompt)
    proposal["used_model"] = model_settings()["model"]
    proposal["local_fallback"] = False
  except Exception:
    proposal = heuristic_proposal(request.content, request.source_agent)

  proposal = normalize_proposal(proposal)
  summary = str(proposal.get("summary", "Generated memory patch."))
  insert_inbox_item(
    request.project_id,
    title=summary[:80] or "Inbox capture",
    source=request.source_agent or proposal.get("author", "Unknown"),
    content=request.content,
    tags=proposal.get("tags", []),
    status="processed",
  )
  insert_agent_run("qwen", request.project_id, request.content, summary)
  insert_memory_patch(request.project_id, "qwen", proposal)
  return proposal


@app.post("/api/context/compile")
def compile_context(request: CompileRequest) -> dict[str, Any]:
  content = get_project_context(
    project_id=request.project_id,
    target_agent=request.target_agent,
    goal=request.goal,
    token_budget=request.token_budget,
  )
  return {
    "target_agent": request.target_agent,
    "token_budget": request.token_budget,
    "content": content,
  }


@app.post("/api/context/export-codex")
def export_context(request: CompileRequest) -> dict[str, Any]:
  files = export_codex_context(
    project_id=request.project_id,
    target_agent=request.target_agent,
    goal=request.goal,
    token_budget=request.token_budget,
  )
  return {"files": files}


@app.post("/api/memory-patches")
def submit_patch(request: PatchRequest) -> dict[str, str]:
  patch_id = insert_memory_patch(request.project_id, request.agent_id, request.payload)
  return {"id": patch_id, "status": "pending"}


@app.post("/api/memory/apply")
def apply_patch(request: ApplyMemoryRequest) -> dict[str, Any]:
  # Preferred path: approve a stored, human-reviewed patch by id.
  if request.patch_id:
    patch = get_memory_patch(request.patch_id)
    if patch is None:
      raise HTTPException(status_code=404, detail="Memory patch not found")
    if patch["status"] != "pending":
      raise HTTPException(status_code=409, detail=f"Patch already {patch['status']}")
    if not request.approved:
      raise HTTPException(status_code=403, detail="Patch requires explicit human approval (approved=true).")
    try:
      return apply_memory_patch(
        patch["project_id"], patch["agent_id"], patch["payload"], source_patch_id=patch["id"]
      )
    except ValueError as error:
      raise HTTPException(status_code=400, detail=str(error)) from error
  # Legacy inline path: still allowed, but now requires an explicit approval flag.
  if not request.approved:
    raise HTTPException(
      status_code=403,
      detail="Inline memory apply requires explicit approval (approved=true). Prefer submitting a patch and approving it by id.",
    )
  try:
    return apply_memory_patch(request.project_id, request.agent_id, request.proposal)
  except ValueError as error:
    raise HTTPException(status_code=400, detail=str(error)) from error


def heuristic_proposal(content: str, source_agent: str | None) -> dict[str, Any]:
  lowered = content.lower()
  tags = ["agents", "context", "writeback"]
  if "mcp" in lowered:
    tags.append("MCP")
  if "sqlite" in lowered:
    tags.append("SQLite")
  if "codex" in lowered:
    tags.append("Codex")

  author = source_agent or ("Codex" if "codex" in lowered else "Claude")
  return {
    "project_suggested": "Agent Memory Hub",
    "type": "agent output",
    "author": author,
    "tags": tags,
    "summary": "El texto contiene memoria reutilizable para el proyecto y posibles acciones canonicas.",
    "proposed_notes": [
      {
        "title": "Agent output summary",
        "type": "technical_note",
        "content": content[:600],
      }
    ],
    "proposed_decisions": [
      {
        "decision": "Mantener SQLite y aprobacion humana para el MVP.",
        "reason": "Reduce riesgo y mantiene control local-first.",
      }
    ],
    "proposed_tasks": [
      {"title": "Crear memory patch review flow.", "priority": "high"},
      {"title": "Agregar export para Codex.", "priority": "medium"},
    ],
    "used_model": model_settings()["model"],
    "local_fallback": True,
  }


def heuristic_note_improvement(note: dict[str, Any], sibling_notes: list[dict[str, Any]]) -> dict[str, Any]:
  raw_content = str(note.get("content", "")).strip()
  title = str(note.get("title") or "").strip()
  metadata_text = f"{title} {raw_content}"
  first_line = next((line.strip("# ").strip() for line in raw_content.splitlines() if line.strip()), "")
  if not title or title.lower() == "untitled":
    title = first_line[:80] or "Nota mejorada"

  task_candidates: list[dict[str, str]] = []
  formatted_lines: list[str] = []
  for line in raw_content.splitlines():
    stripped = line.strip()
    cleaned = stripped.strip(" -[]\t")
    lowered = cleaned.lower()
    if not cleaned:
      if formatted_lines and formatted_lines[-1] != "":
        formatted_lines.append("")
      continue
    explicit_task = (
      lowered.startswith(("todo", "tarea", "pendiente", "hacer", "implementar"))
      or stripped.startswith(("- [ ]", "* [ ]", "[]"))
    )
    if explicit_task:
      task_candidates.append({"title": cleaned[:120]})
    formatted_lines.append(format_note_line(stripped))

  body = "\n".join(formatted_lines).strip() or "Sin contenido original."
  if len([line for line in formatted_lines if line.strip()]) > 4 and not body.lstrip().startswith("#"):
    improved = f"## {title}\n\n{body}"
  else:
    improved = body

  related_note_ids = find_related_note_ids(raw_content + " " + title, sibling_notes)
  inferred_category = infer_category(metadata_text)
  current_category = str(note.get("category") or "").strip()
  return {
    "project_id": note.get("project_id"),
    "folder": note.get("folder") or infer_folder(metadata_text),
    "category": current_category if current_category and current_category != "General" else inferred_category,
    "title": title,
    "content": improved,
    "type": note.get("type") or "Human Note",
    "status": "review",
    "tasks": task_candidates[:6],
    "related_note_ids": related_note_ids,
    "relation_type": "related",
    "used_model": model_settings()["model"],
    "local_fallback": True,
  }


def infer_folder(text: str) -> str:
  lowered = text.lower()
  buckets = [
    ("Producto", ("roadmap", "feedback", "prioridad", "usuario", "retencion", "feature", "producto")),
    ("Investigacion", ("paper", "papers", "research", "rag", "memoria", "evaluacion", "hipotesis")),
    ("Ingenieria", ("api", "backend", "frontend", "sqlite", "bug", "mcp", "codex", "deploy")),
    ("Reuniones", ("meeting", "reunion", "acuerdo", "stakeholder", "seguimiento", "sync")),
    ("Inbox", ("idea", "borrador", "captura", "quick", "nota suelta")),
  ]
  for folder, keywords in buckets:
    if any(keyword in lowered for keyword in keywords):
      return folder
  return ""


def infer_category(text: str) -> str:
  lowered = text.lower()
  buckets = [
    ("Producto", ("roadmap", "feedback", "feature", "prioridad", "usuario", "retencion", "producto")),
    ("Investigacion", ("paper", "research", "rag", "vector", "memoria", "contexto", "evaluacion")),
    ("Desarrollo", ("api", "backend", "frontend", "sqlite", "bug", "mcp", "schema", "deploy")),
    ("Reuniones", ("meeting", "reunion", "acuerdo", "seguimiento", "stakeholder", "decision")),
    ("AI Notes", ("qwen", "llm", "codex", "claude", "chatgpt", "agente", "agent")),
  ]
  for category, keywords in buckets:
    if any(keyword in lowered for keyword in keywords):
      return category
  return "General"


def find_related_note_ids(text: str, sibling_notes: list[dict[str, Any]]) -> list[str]:
  words = {word for word in re_words(text) if len(word) > 4}
  scored: list[tuple[int, str]] = []
  for note in sibling_notes:
    note_text = f"{note.get('title', '')} {note.get('excerpt', '')}"
    note_words = {word for word in re_words(note_text) if len(word) > 4}
    overlap = len(words & note_words)
    if overlap > 0:
      scored.append((overlap, note["id"]))
  scored.sort(reverse=True)
  return [note_id for _, note_id in scored[:3]]


def re_words(text: str) -> list[str]:
  import re

  return re.findall(r"[^\W_]+", text.lower())


def format_note_line(line: str) -> str:
  replacements = {
    "q ": "que ",
    " xq ": " porque ",
    " pq ": " porque ",
    " tmb ": " tambien ",
    " tb ": " tambien ",
    " mejroar ": " mejorar ",
    " notra ": " nota ",
    " funcinamiento": "funcionamiento",
    " proporsito": "proposito",
  }
  prefix = ""
  body = line.strip()
  if body.startswith(("-", "*")):
    prefix = "- "
    body = body.lstrip("-* ").strip()
  lower_padded = f" {body.lower()} "
  for wrong, right in replacements.items():
    lower_padded = lower_padded.replace(wrong, right)
  body = lower_padded.strip()
  if body:
    body = body[0].upper() + body[1:]
  if body and body[-1] not in ".:;!?)]":
    body += "."
  return f"{prefix}{body}" if prefix else body


def normalize_improvement(improvement: dict[str, Any], note: dict[str, Any]) -> dict[str, Any]:
  fallback_text = f"{note.get('title', '')} {note.get('content', '')}"
  improvement.setdefault("project_id", note.get("project_id"))
  improvement.setdefault("folder", note.get("folder") or infer_folder(fallback_text))
  improvement.setdefault("category", note.get("category") or infer_category(fallback_text))
  improvement.setdefault("title", note.get("title") or "Nota")
  improvement.setdefault("content", note.get("content") or "")
  improvement.setdefault("type", note.get("type") or "Project Note")
  improvement.setdefault("status", "review")
  improvement.setdefault("tasks", [])
  improvement.setdefault("related_note_ids", [])
  improvement.setdefault("relation_type", "related")
  if not isinstance(improvement["tasks"], list):
    improvement["tasks"] = []
  if not isinstance(improvement["related_note_ids"], list):
    improvement["related_note_ids"] = []
  improvement["folder"] = str(improvement.get("folder") or "").strip()
  category = str(improvement.get("category") or "").strip()
  improvement["category"] = infer_category(fallback_text) if not category or category == "General" else category
  return improvement


def normalize_proposal(proposal: dict[str, Any]) -> dict[str, Any]:
  proposal.setdefault("project_suggested", "Agent Memory Hub")
  proposal.setdefault("type", "agent output")
  proposal.setdefault("author", "unknown")
  proposal.setdefault("tags", [])
  proposal.setdefault("summary", "")
  proposal.setdefault("proposed_notes", [])
  proposal.setdefault("proposed_decisions", [])
  proposal.setdefault("proposed_tasks", [])
  return proposal
