# Neuronotes 2.0

Local-first desktop MVP for notes, projects, and shared memory between humans and AI agents.

The app is intentionally Notion-like: quiet project sidebar, focused Markdown notes, project tasks, visual note map, compact context export, and visible agent provenance. It is not a chatbot-first product.

## Documentation

- Deep project documentation: `docs/PROJECT_DOCUMENTATION.md`
- Routes and filesystem paths: `docs/ROUTES_AND_PATHS.md`
- Agent operating rules: `AGENTS.md`

## Stack

- Desktop: Electron
- Frontend: React, Vite, TypeScript
- Backend: FastAPI
- Storage: SQLite
- Search: basic SQLite `LIKE` search across notes, tasks, and decisions
- Local model: Qwen 4B through configurable Ollama or LM Studio endpoint
- MCP scaffold: `backend/app/mcp_server.py`

## MVP Scope

Included:

- Three main modes: Notes, Map, LLM
- Notes-first interface with a cleaner Notion-like writing surface
- Light/dark mode toggle persisted locally
- Create/edit projects
- Create/edit Markdown notes
- Improve note action powered by local Qwen with deterministic local fallback
- Project tasks that can be created manually or extracted from improved notes
- Visual memory map for notes, tasks, and relations
- Manual relation linking between notes
- Search with suggestions across notes, tasks, and decisions
- Qwen-powered note improvement for structure, type, status, tasks, and relations
- Human-reviewed memory patch apply flow: selected notes, tasks, and decisions become project memory
- Agent colors for Usuario, Claude, Codex, and Qwen
- Context Compiler with `AGENTS.md` and `docs/context.md` export
- SQLite models: Agent, Project, Note, Task, Decision, Relation, AgentRun

Not included:

- Cloud sync
- Mobile app
- Multi-user collaboration
- Canvas/graph editor
- Complex block editor

## Setup

```powershell
cd "D:\Neuronotes 2.0"
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements.txt
npm install
npm --prefix frontend install
```

Pull the default local model:

```powershell
ollama pull qwen3:4b
```

## Run In Browser

```powershell
npm run dev
```

Backend: http://127.0.0.1:8787

Vite prints the frontend URL. It defaults to http://localhost:5173, but may use another port if 5173 is already busy.

## Run As Desktop App

```powershell
npm run desktop
```

This builds the React app, starts the local FastAPI backend, and opens Electron.

## Model Settings

Default:

- Provider: `ollama`
- Base URL: `http://localhost:11434`
- Model: `qwen3:4b`

LM Studio/OpenAI-compatible mode:

- Provider: `lmstudio`
- Base URL: usually `http://localhost:1234`
- Model: the loaded model name shown by LM Studio

You can edit these from Settings in the app.

## Useful Commands

```powershell
npm run build
npm run mcp
```

## Agent Access

Neuronotes exposes shared memory without binding it to one LLM vendor.

- MCP server: `npm run mcp`
- REST base: `http://127.0.0.1:8787`
- Search: `GET /api/search?query=...`
- Project notes: `GET /api/notes?project_id=...`
- Create note: `POST /api/notes`
- Update note: `PUT /api/notes/{note_id}`
- Improve note: `POST /api/notes/{note_id}/improve`
- Relations: `GET/POST /api/relations`
- Tasks: `GET/POST/PUT /api/tasks`
- Context handoff: `POST /api/context/compile`
- Proposed writeback: `POST /api/memory-patches`

Agents should search first, prefer approved/canonical items, keep source attribution, create or update durable notes, link related notes, and create tasks from actionable work.

## Exported Context

Context Compiler writes files to:

```text
exports/codex/AGENTS.md
exports/codex/docs/context.md
exports/codex/docs/decisions.md
exports/codex/docs/tasks.md
```
