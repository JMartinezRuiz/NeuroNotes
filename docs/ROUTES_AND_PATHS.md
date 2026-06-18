# Neuronotes 2.0 - Rutas del proyecto

Ultima revision local: 2026-06-17.

## Rutas principales en disco

La ruta real del proyecto activo es:

```text
D:\Neuronotes 2.0
```

El workspace mostrado por Codex en esta sesion existe pero esta vacio:

```text
C:\Users\Gigabyte\OneDrive\Documentos\NeuroNotes
```

Usa `D:\Neuronotes 2.0` para trabajar sobre la app actual.

## Estructura de carpetas

```text
D:\Neuronotes 2.0
|-- .venv\
|-- backend\
|-- data\
|-- electron\
|-- frontend\
|-- node_modules\
|-- scripts\
|-- docs\
|-- AGENTS.md
|-- README.md
|-- package.json
|-- package-lock.json
```

## Archivos fuente clave

### Backend

```text
D:\Neuronotes 2.0\backend\app\main.py
D:\Neuronotes 2.0\backend\app\database.py
D:\Neuronotes 2.0\backend\app\ollama_client.py
D:\Neuronotes 2.0\backend\app\mcp_server.py
D:\Neuronotes 2.0\backend\requirements.txt
```

### Frontend

```text
D:\Neuronotes 2.0\frontend\src\App.tsx
D:\Neuronotes 2.0\frontend\src\app.css
D:\Neuronotes 2.0\frontend\src\main.tsx
D:\Neuronotes 2.0\frontend\package.json
D:\Neuronotes 2.0\frontend\vite.config.ts
D:\Neuronotes 2.0\frontend\dist\
```

### Desktop

```text
D:\Neuronotes 2.0\electron\main.cjs
D:\Neuronotes 2.0\electron\preload.cjs
```

### Datos

```text
D:\Neuronotes 2.0\data\neuronotes.db
```

### Scripts

```text
D:\Neuronotes 2.0\scripts\load_demo_data.py
```

### Documentacion

```text
D:\Neuronotes 2.0\README.md
D:\Neuronotes 2.0\AGENTS.md
D:\Neuronotes 2.0\docs\PROJECT_DOCUMENTATION.md
D:\Neuronotes 2.0\docs\ROUTES_AND_PATHS.md
```

### Exports generados

Estos se crean al llamar `POST /api/context/export-codex`:

```text
D:\Neuronotes 2.0\exports\codex\AGENTS.md
D:\Neuronotes 2.0\exports\codex\docs\context.md
D:\Neuronotes 2.0\exports\codex\docs\decisions.md
D:\Neuronotes 2.0\exports\codex\docs\tasks.md
```

## URLs locales

Frontend Vite:

```text
http://localhost:5173/
```

Backend FastAPI:

```text
http://127.0.0.1:8787
```

Health:

```text
http://127.0.0.1:8787/api/health
```

OpenAPI:

```text
http://127.0.0.1:8787/docs
```

## Rutas de UI

La UI es una SPA sin React Router. La URL se mantiene como `/`; la navegacion interna cambia `mode`:

```text
notes
map
llm
```

Scopes internos:

```text
all
project
folder
category
loose
```

## Rutas API REST

Base:

```text
http://127.0.0.1:8787
```

### Health

```text
GET /api/health
GET /api/health/model
```

### Dashboard y proyectos

```text
GET  /api/dashboard
GET  /api/dashboard?project_id={project_id}
GET  /api/projects
POST /api/projects
PUT  /api/projects/{project_id}
```

### Notas

```text
GET  /api/notes
GET  /api/notes?project_id={project_id}
GET  /api/notes?folder={folder}
GET  /api/notes?category={category}
GET  /api/notes/{note_id}
POST /api/notes
PUT  /api/notes/{note_id}
POST /api/notes/{note_id}/improve
```

### Tareas

```text
GET  /api/tasks
GET  /api/tasks?project_id={project_id}
POST /api/tasks
PUT  /api/tasks/{task_id}
```

### Relaciones

```text
GET  /api/relations
GET  /api/relations?project_id={project_id}
POST /api/relations
```

### Actividad y settings

```text
GET /api/activity
GET /api/activity?project_id={project_id}
GET /api/settings
PUT /api/settings
```

### Busqueda y vectores

```text
GET  /api/search?query={query}&limit={limit}
GET  /api/search?query={query}&project_id={project_id}
GET  /api/vectors/search?query={query}&limit={limit}
GET  /api/vectors/search?query={query}&project_id={project_id}
GET  /api/vectors/map
GET  /api/vectors/map?project_id={project_id}
GET  /api/vectors/map?folder={folder}
GET  /api/vectors/map?category={category}
POST /api/vectors/rebuild
POST /api/vectors/rebuild?project_id={project_id}
```

### Contexto y memoria

```text
POST /api/context/compile
POST /api/context/export-codex
POST /api/memory-patches
POST /api/memory/apply
POST /api/inbox/analyze
```

## MCP

Comando:

```powershell
cd "D:\Neuronotes 2.0"
npm run mcp
```

Archivo:

```text
D:\Neuronotes 2.0\backend\app\mcp_server.py
```

Tools:

```text
search_memory
vector_search
list_notes
get_project_context
get_note
create_note
update_note
list_tasks
create_task
update_task
list_relations
link_notes
submit_memory_patch
```

## Comandos por ruta

Instalar dependencias:

```powershell
cd "D:\Neuronotes 2.0"
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements.txt
npm install
npm --prefix frontend install
```

Ejecutar app web:

```powershell
cd "D:\Neuronotes 2.0"
npm run dev
```

Ejecutar desktop:

```powershell
cd "D:\Neuronotes 2.0"
npm run desktop
```

Build:

```powershell
cd "D:\Neuronotes 2.0"
npm run build
```

Validar backend:

```powershell
cd "D:\Neuronotes 2.0"
.\.venv\Scripts\python.exe -m compileall backend\app scripts
```

Validar frontend:

```powershell
cd "D:\Neuronotes 2.0"
npm --prefix frontend run build
```

## Puertos

```text
5173 - Vite frontend
8787 - FastAPI backend
11434 - Ollama por defecto
1234 - LM Studio por defecto, si se usa
```

