# NeuroNotes

Un segundo cerebro **local-first y AI-first**: tú escribes, la IA organiza.

No hay carpetas, proyectos ni enlaces manuales. Cada nota se convierte en un
vector (embeddings locales) y de ahí se deriva todo:

- **Buscar por significado** — encuentra la nota aunque no compartas ni una palabra.
- **Notas cercanas** — las conexiones aparecen solas, calculadas por cercanía semántica.
- **Mapa 3D** — tu mente como constelación: la distancia entre notas ES su parecido de significado (PCA de los vectores).
- **Pregunta a tu cerebro** — respuesta con citas usando solo tus notas (RAG local).
- **Etiquetas y título automáticos** — al vuelo (heurística) o con el modelo local (botón ✨).
- **Cualquier LLM se conecta** — servidor MCP (Claude, Codex y ChatGPT vía SSE con `search`/`fetch`).

**Privado de verdad:** SQLite en disco + modelos por Ollama en loopback;
`privacy_mode=local_first` bloquea cualquier llamada fuera de tu equipo.

## Stack

- Frontend: React 19 + Vite + TypeScript (+ three.js para el mapa, lazy)
- Backend: FastAPI + SQLite (3 tablas: `notes`, `note_vectors`, `app_settings`)
- Embeddings: `nomic-embed-text` (768d) vía Ollama, con fallback hash offline
- Chat local: `qwen3:4b` (opcional — todo funciona sin él)
- Escritorio: Electron · Agentes: MCP (`backend/app/mcp_server.py`)

## Arrancar

```bash
npm run dev        # backend (8787) + frontend (5173)
npm run desktop    # app de escritorio (Electron)
npm run mcp        # MCP stdio (Claude / Codex)
npm run mcp:http   # MCP SSE en :8788 (ChatGPT — túnel HTTPS + /sse)
```

Requisitos: Python 3.12 (`.venv` en la raíz), Node 20+, y [Ollama](https://ollama.com)
con `ollama pull nomic-embed-text` (y opcionalmente `ollama pull qwen3:4b`).

## API

`GET/POST/PUT/DELETE /api/notes` · `GET /api/notes?q=` (semántica) ·
`GET /api/notes/{id}/related` · `GET /api/map` · `POST /api/ask` ·
`POST /api/notes/{id}/enrich` · `GET /api/tags` · `POST /api/vectors/rebuild` ·
`GET/PUT /api/settings` · `GET /api/health/model` · `GET /api/mcp/status`

---

*La versión anterior (proyectos/carpetas/tareas/parches de memoria) quedó
archivada en el tag `v2-synapse-legacy`.*
