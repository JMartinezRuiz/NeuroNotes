"""NeuroNotes API — notes in, intelligence out.

Minimal surface: note CRUD, semantic search, related notes, the 3D map,
ask-your-brain, AI enrich (tags/title), settings and health. Everything runs
locally; privacy_mode=local_first blocks any non-loopback model call.
"""

from __future__ import annotations

import asyncio
import os
import secrets
import socket
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.requests import Request
from starlette.responses import JSONResponse

from .database import (
  all_tags,
  ask_context,
  create_note,
  delete_note,
  get_note,
  get_settings,
  init_database,
  list_notes,
  memory_map,
  rebuild_note_vectors,
  related_notes,
  search_notes,
  suggest_tags,
  update_note,
  update_settings,
)
from .ollama_client import ask_model_json, ask_model_text, get_model_health


@asynccontextmanager
async def lifespan(_: FastAPI):
  init_database()
  yield


app = FastAPI(title="NeuroNotes API", version="3.0.0", lifespan=lifespan)

# Optional shared-secret token. When NEURONOTES_API_TOKEN is set (the desktop
# app sets it automatically), every mutating request must present it. Read-only
# GET requests stay open. Defense-in-depth on top of the CORS lockdown.
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


# CORS locked to local origins; "null" keeps the packaged Electron renderer working.
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


class NoteRequest(BaseModel):
  title: str = ""
  content: str = ""
  tags: list[str] | None = None
  created_by: str = "user"


class NoteUpdateRequest(BaseModel):
  title: str | None = None
  content: str | None = None
  tags: list[str] | None = None


class AskRequest(BaseModel):
  question: str = Field(min_length=2)


class SettingsRequest(BaseModel):
  model_provider: str | None = None
  model_base_url: str | None = None
  model_name: str | None = None
  embedding_model: str | None = None
  privacy_mode: str | None = None


@app.get("/api/health")
async def health() -> dict[str, str]:
  return {"status": "ok", "app": "NeuroNotes"}


@app.get("/api/health/model")
async def model_health() -> dict[str, Any]:
  return await get_model_health()


@app.get("/api/mcp/status")
def mcp_status() -> dict[str, Any]:
  """Status of the remote (HTTP/SSE) MCP server used by ChatGPT."""
  host = os.getenv("NEURONOTES_MCP_HOST", "127.0.0.1")
  port = int(os.getenv("NEURONOTES_MCP_PORT", "8788"))
  running = False
  try:
    with socket.create_connection((host, port), timeout=0.4):
      running = True
  except OSError:
    running = False
  # Tool count via a fresh loop (this sync handler runs in the threadpool).
  tools: int | None = None
  try:
    from .mcp_server import mcp as _mcp

    tools = len(asyncio.run(_mcp.list_tools()))
  except Exception:
    tools = None
  return {
    "running": running,
    "transport": "sse",
    "host": host,
    "port": port,
    "endpoint": f"http://{host}:{port}/sse",
    "auth": "none",
    "tools": tools,
    "start_command": "npm run mcp:http",
  }


@app.get("/api/notes")
def notes_endpoint(
  q: str | None = None,
  tag: str | None = None,
  limit: int = Query(default=100, ge=1, le=500),
) -> list[dict[str, Any]]:
  if q and q.strip():
    return search_notes(q.strip(), limit)
  return list_notes(tag=tag, limit=limit)


@app.post("/api/notes")
def create_note_endpoint(request: NoteRequest) -> dict[str, Any]:
  if not request.title.strip() and not request.content.strip():
    raise HTTPException(status_code=400, detail="La nota necesita título o contenido.")
  return create_note(request.model_dump())


@app.get("/api/notes/{note_id}")
def get_note_endpoint(note_id: str) -> dict[str, Any]:
  note = get_note(note_id)
  if note is None:
    raise HTTPException(status_code=404, detail="Note not found")
  return note


@app.put("/api/notes/{note_id}")
def update_note_endpoint(note_id: str, request: NoteUpdateRequest) -> dict[str, Any]:
  try:
    return update_note(note_id, request.model_dump(exclude_unset=True))
  except ValueError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error


@app.delete("/api/notes/{note_id}")
def delete_note_endpoint(note_id: str) -> dict[str, Any]:
  try:
    return delete_note(note_id)
  except ValueError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/notes/{note_id}/related")
def related_endpoint(note_id: str, limit: int = Query(default=5, ge=1, le=20)) -> list[dict[str, Any]]:
  return related_notes(note_id, limit)


@app.get("/api/tags")
def tags_endpoint() -> list[dict[str, Any]]:
  return all_tags()


@app.get("/api/map")
def map_endpoint() -> dict[str, Any]:
  return memory_map()


@app.post("/api/vectors/rebuild")
def rebuild_endpoint() -> dict[str, Any]:
  return rebuild_note_vectors()


@app.post("/api/ask")
async def ask_endpoint(request: AskRequest) -> dict[str, Any]:
  """Ask your brain: retrieve the closest notes; answer with the local model when
  it is available, otherwise return the sources alone (retrieval never breaks)."""
  question = request.question.strip()
  sources = ask_context(question, limit=6)
  strong_sources = [source for source in sources if source["score"] >= 0.3][:4] or sources[:2]

  answer: str | None = None
  local_fallback = True
  health = await get_model_health()
  if health.get("online") and strong_sources:
    context = "\n\n".join(
      f"[{index + 1}] {source['title']}\n{source['content'][:1200]}"
      for index, source in enumerate(strong_sources)
    )
    try:
      answer = await ask_model_text(
        "Eres la memoria personal del usuario. Responde SOLO con la información de las notas dadas, "
        "en español, breve y directo. Cita las notas como [1], [2]... Si las notas no contienen la "
        "respuesta, dilo claramente.",
        f"Pregunta: {question}\n\nNotas:\n{context}",
      )
      local_fallback = False
    except Exception:
      answer = None

  for source in sources:
    source.pop("content", None)
  return {
    "question": question,
    "answer": answer,
    "sources": sources,
    "local_fallback": local_fallback,
    "model": health.get("model"),
  }


@app.post("/api/notes/{note_id}/enrich")
async def enrich_endpoint(note_id: str) -> dict[str, Any]:
  """AI organize: suggest a better title + tags for the note (never auto-applies)."""
  note = get_note(note_id)
  if note is None:
    raise HTTPException(status_code=404, detail="Note not found")
  suggestion = {
    "title": note["title"] if note["title"] != "Sin título" else "",
    "tags": suggest_tags(note["title"], note["content"], limit=4),
    "local_fallback": True,
  }
  health = await get_model_health()
  if health.get("online"):
    try:
      result = await ask_model_json(
        'Organizas notas personales. Devuelve JSON estricto: {"title": string, "tags": string[]}. '
        "El título: corto (máx 8 palabras), en el idioma de la nota, fiel al contenido. "
        "tags: 2-4 temas en minúsculas, una o dos palabras cada uno.",
        f"Título actual: {note['title']}\n\nNota:\n{note['content'][:2400]}",
      )
      title = str(result.get("title") or "").strip()
      tags = [str(tag).strip().lower() for tag in result.get("tags", []) if str(tag).strip()][:4]
      if title or tags:
        suggestion = {"title": title or note["title"], "tags": tags or suggestion["tags"], "local_fallback": False}
    except Exception:
      pass
  return suggestion


@app.get("/api/settings")
def settings_endpoint() -> dict[str, str]:
  return get_settings()


@app.put("/api/settings")
def update_settings_endpoint(request: SettingsRequest) -> dict[str, str]:
  return update_settings(request.model_dump(exclude_unset=True))
