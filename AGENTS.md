# Neuronotes 2.0

## Product Direction
Neuronotes 2.0 is a local-first desktop workspace where humans and AI agents share structured project memory.

The product should feel comfortable and Notion-like: quiet sidebar navigation, document-first project pages, compact tables, clear provenance, and a right-side agent panel. Avoid a giant chatbot as the primary interface. The center of the app is knowledge.

## Local Agent
- Default local model: `qwen3:4b`
- Runtime: Ollama at `http://localhost:11434`
- Use Qwen locally for categorization, tagging, summaries, task extraction, relation suggestions, and context compression.
- Do not send private notes to external APIs unless the user explicitly approves it.

## MVP Priorities
1. Projects
2. Markdown notes
3. Inbox
4. Qwen 4B classification and summarization
5. Agent colors and provenance
6. Agent Activity Log
7. Context Compiler
8. AGENTS.md / context.md export
9. Manual import of agent outputs
10. Basic read-only MCP surface

## Memory Rules
- Agent writes should arrive as structured memory patches.
- Important writes require human approval before becoming canonical.
- Canonical memory should be compact and reusable.
- Preserve old notes but mark superseded decisions clearly.

## Current Stack
- Desktop: Electron
- Frontend: React + Vite + TypeScript
- Backend: FastAPI + SQLite
- Local model: configurable Ollama or LM Studio endpoint, default `qwen3:4b`
- MCP: Python server scaffold in `backend/app/mcp_server.py`

## Explicit Non-Goals For MVP
- No cloud sync.
- No mobile app.
- No multi-user collaboration.
- No canvas/graph editor.
- No complex block editor; Markdown textarea is enough.
