# Neuronotes

Neuronotes is a local-first desktop notes app for Windows first, with a path to macOS packaging. It captures quick notes, summarizes them, assigns categories and tags, and links related notes.

## Stack

- Electron + React + TypeScript
- Local JSON storage in the Electron `userData` folder
- Ollama adapter using `qwen3.5:0.8b` by default
- Lightweight local retrieval for related-note context before calling Qwen

## Local setup

```powershell
npm install
ollama pull qwen3.5:0.8b
npm run dev
```

Install Ollama first if the `ollama` command is not available: <https://ollama.com/download>.

If Ollama is not running, Neuronotes still saves notes and uses a local fallback analyzer. When Ollama is available, analysis status shows `Qwen`.

Title and editor changes are saved automatically after a short pause. The manual save button remains available for explicit saves.

Use the category chips in the sidebar to move through automatically categorized notes while search remains scoped to the selected category.

Use the `Red` workspace view to inspect the local graph around the selected note, including direct links, backlinks, and total library connections.

The inspector lets users correct the selected note category and tags manually without marking the note as pending Qwen analysis.

Related notes can also be linked or unlinked manually from the inspector; manual links still participate in the reciprocal local graph.

Settings include library export/import actions for JSON backups. Import merges notes by ID and keeps local settings intact.

The local database is written atomically and mirrored to `neuronotes.json.bak` inside Electron `userData` so the app can recover from an interrupted or corrupted write.

Individual notes can also be exported as Markdown from the editor.

Neuronotes checks both Ollama and the configured model from the app header. In settings, use the local engine action to start an installed Ollama runtime, open the Ollama download page if it is not installed, or pull the configured Qwen model when Ollama is already running.

Settings also include a Qwen diagnostic action that runs a temporary in-memory note through the configured model and reports whether the result came from Qwen or the local fallback.

When a note is analyzed, Neuronotes normalizes duplicate links and adds reciprocal links to connected notes so the note base behaves like a small local knowledge graph.

Each analyzed note keeps a compact audit trail with the provider used, model name, elapsed time, timestamp, and retrieved note IDs used as RAG context.

If notes were created while Qwen was unavailable, the header shows a pending-analysis action once there are notes that have not been processed by the configured model.

When automatic analysis is enabled, Neuronotes retries one pending batch automatically after Qwen becomes ready. It records the attempted batch so a failing local runtime does not create a retry loop.

## Build

```powershell
npm run icons
npm test
npm run dist:win
```

The Windows installer is emitted under `release/`.

The app icon source is `build/icon.svg`; `npm run icons` regenerates `build/icon.ico` for Windows packaging.

The development build is currently unsigned. For public distribution, add a Windows signing certificate and remove `signExecutable: false` from the Electron Builder config.
