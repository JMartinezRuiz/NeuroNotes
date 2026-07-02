# NeuroNotes — reglas para agentes

NeuroNotes es el cerebro compartido del usuario: notas locales convertidas a
embeddings. Tú (Claude, Codex, ChatGPT, Qwen…) te conectas por MCP
(`npm run mcp` stdio · `npm run mcp:http` SSE en :8788).

## Herramientas MCP (10)

- `search(query)` / `fetch(id)` — búsqueda semántica + lectura (contrato ChatGPT).
- `list_notes(tag?, limit?)` · `get_note(note_id)`
- `create_note(title?, content?, tags?, created_by)` — pon tu nombre en `created_by`
  (claude/codex/chatgpt/qwen); título y etiquetas se derivan si los omites.
- `update_note(note_id, …)` — parcial: pasa SOLO lo que cambias.
- `delete_note(note_id)`
- `related_notes(note_id)` — vecinas por significado (no hay enlaces manuales).
- `ask_brain(question)` — recuperación con contenido para responder preguntas.
- `rebuild_vectors()` — re-embeber todo (tras cambiar el modelo de embeddings).

## Reglas

1. **Busca antes de afirmar** nada sobre el conocimiento del usuario (`search`/`ask_brain`).
2. **Escribe conocimiento durable** cuando lo produzcas (`create_note` con tu `created_by`).
3. No dupliques: si existe una nota cercana, `update_note` en vez de crear otra.
4. Etiquetas: 2-4, minúsculas, temas — no frases.
5. Los datos son privados y locales; no los exportes fuera sin que el usuario lo pida.

## Arquitectura (si tocas código)

- Backend FastAPI + SQLite: `backend/app/{database,main,mcp_server,ollama_client}.py`
  (3 tablas: notes, note_vectors, app_settings; embeddings nomic-embed-text 768d
  vía Ollama con fallback hash; PCA a 3D para el mapa).
- Frontend React+Vite: `frontend/src/` (Sidebar, Editor, MapView/Scene3D,
  AskPanel, AiCard). Identidad "Synapse": acento teal único, serif editorial,
  colores de procedencia por agente.
- Verifica siempre: `python -m py_compile` en backend + `npm run build` en frontend.
