# Neuronotes

Neuronotes is a Windows-first desktop notes app for capturing quick thoughts and turning them into a connected local knowledge base. The product direction is a minimal Notion/OneNote-like workspace powered by local AI: notes are summarized, categorized, tagged, and linked to related notes automatically.

This repository is now centered on the Codex-built Electron desktop app. The previous PWA/Flask prototype remains in Git history, but `main` is intended to track the desktop product going forward.

## Product Direction

Neuronotes is being built as:

- A local-first notes app with fast capture and a quiet, minimal interface.
- A local AI workspace using Qwen 0.8B as the default model through Ollama.
- A RAG-assisted note graph that retrieves nearby notes before asking the model to summarize, categorize, tag, and suggest links.
- A future MCP-capable assistant surface for advanced local automations over notes, files, tools, and connected workflows.

The current code uses a lightweight in-app retrieval/ranking layer for RAG context. It does not currently use LangChain; if LangChain or another orchestration layer is added later, it should be documented here and wired into tests.

## Current App

- Electron + React + TypeScript desktop app.
- Windows installer via Electron Builder, with macOS packaging configured for later.
- Local JSON database in Electron `userData`, written atomically with a backup file.
- Main window size, position, and maximized state are restored between launches.
- Quick note capture, auto-save editor, search, category filters, and metadata editing.
- Native desktop menu with keyboard shortcuts for capture, search, save, analysis, export, settings, and note/network views.
- Native confirmation before deleting notes.
- Automatic and manual note analysis.
- Ollama integration with `qwen3.5:0.8b` as the default Qwen 0.8B model.
- Health checks, Ollama start attempt, model pull action, and Qwen diagnostics.
- Local fallback analyzer when Ollama/Qwen is unavailable.
- Manual pending-note analysis can use the local fallback even before Qwen is ready.
- RAG context generation from locally related notes before Qwen analysis, with TF-IDF-style scoring, phrase/tag/title signals, stored excerpts, and scores for auditability.
- Automatic summaries, categories, tags, and related-note suggestions.
- Suggested action intents that can later map to MCP tools such as tasks, reminders, research, or workflows.
- Local action plan: users can save suggested actions, mark them done, delete them, and carry them through library/Markdown export.
- MCP handoff JSON export for open local actions, including tool hints and source-note context without executing external tools.
- Reciprocal note graph synchronization.
- Manual link and unlink controls.
- Graph view for direct links, backlinks, and library connection counts.
- Analysis audit metadata: provider, model, elapsed time, timestamp, retrieved RAG note IDs, scores, and excerpts.
- RAG audit view in the inspector showing the context snippets used during analysis.
- Auto retry of pending notes once Qwen becomes ready, guarded to avoid retry loops.
- JSON library export/import and per-note Markdown export.

## AI Architecture

The analysis flow is:

1. A note is created or selected for analysis.
2. Neuronotes ranks nearby notes locally using TF-IDF-style lexical similarity, phrase overlap, tag overlap, title matches, and category signals.
3. The strongest matches are serialized as RAG context with score, reason, tags, and excerpt.
4. Qwen 0.8B is called through Ollama with a strict JSON prompt.
5. The response is sanitized and merged with local related-note ranking.
6. Suggested action intents are stored locally without executing external tools.
7. The user can promote suggested actions into a local note plan before any future MCP tool execution is allowed.
8. Open local actions can be exported as a Neuronotes MCP handoff JSON file for a future user-approved tool layer.
9. If Qwen is unavailable, the app uses local fallback categorization, summary, tags, links, and action hints.
10. The note stores an audit record of the analysis run, including the retrieved RAG snippets.

Default model:

```text
qwen3.5:0.8b
```

Default Ollama endpoint:

```text
http://127.0.0.1:11434
```

## MCP Roadmap

MCP tool execution is not wired into the shipped app yet. The intended direction is to let Neuronotes expose or consume MCP tools for advanced workflows such as:

- Creating tasks, reminders, or calendar actions from notes.
- Searching local documents and attaching findings to note context.
- Running structured automations over selected notes.
- Connecting a local assistant to user-approved tools while keeping note data local-first.

When MCP lands, it should be added as a separate integration layer with clear permissions, tests, and UI indicators showing what data is being sent to a tool.

The app already stores action intents with an optional `toolHint` field and lets the user save them into a local action plan. It can export open local actions as `neuronotes.mcp-handoff.v1` JSON with source-note context, model metadata, and manual-approval flags. That handoff is intentionally inert today; it is the bridge for future MCP execution once permissions and tool routing are implemented.

## Local Setup

Install dependencies:

```powershell
npm install
```

Install Ollama and pull the model:

```powershell
ollama pull qwen3.5:0.8b
```

Verify the local Qwen runtime from the repo:

```powershell
npm run verify:qwen
```

If Ollama is running but the model is missing, the verifier can pull it first:

```powershell
npm run verify:qwen:pull
```

For machine-readable output:

```powershell
npm run verify:qwen:json
```

Run the desktop app:

```powershell
npm run dev
```

Install Ollama first if the `ollama` command is not available: <https://ollama.com/download>.

If Ollama is not running, Neuronotes still saves notes and uses the local fallback analyzer. When Ollama and the configured model are ready, analysis status shows `Qwen`.

## Build And Test

Run tests:

```powershell
npm test
```

Run type checks:

```powershell
npm run typecheck
```

Build the app:

```powershell
npm run build
```

Build the Windows installer:

```powershell
npm run dist:win
```

The Windows installer is emitted under `release/`.

## Development Notes

- The app icon source is `build/icon.svg`; `npm run icons` regenerates `build/icon.ico`.
- The development build is currently unsigned.
- For public Windows distribution, add a signing certificate and remove `signExecutable: false` from the Electron Builder config.
- Real Qwen inference requires Ollama installed locally and the `qwen3.5:0.8b` model pulled. Use `npm run verify:qwen` to prove the local runtime can generate a valid Neuronotes analysis.
