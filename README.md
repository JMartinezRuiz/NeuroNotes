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
- Single-instance desktop guard: launching Neuronotes again focuses the existing window instead of opening a second writer.
- Main window size, position, and maximized state are restored between launches.
- Quick note capture, auto-save editor, search, category filters, and metadata editing.
- Quick-captured notes seed a clean title, draft summary, tags, category, local action intents, and initial related-note links from inline hashtags and local signals before AI analysis finishes.
- Quick capture reports creation and automatic analysis status, including local fallback when Qwen is not ready.
- Note list rows show compact AI status badges for Qwen, local fallback, pending, and error states.
- Sidebar filters can narrow notes by AI status to find Qwen-ready notes, local fallback notes, pending notes, and errors.
- Sidebar filters can browse saved and AI-generated tags from quick capture, Qwen analysis, fallback analysis, imports, and MCP capture.
- Sidebar filters can also isolate notes pending fine-tuning approval and notes already approved for JSONL export.
- Search covers note text plus AI-generated and saved actions, related-note titles, tool hints, and stored RAG audit context.
- Accent-insensitive search and tag normalization for Spanish notes.
- Category aliases from Qwen, imports, and MCP capture are normalized across Spanish and English terms such as `project`, `health`, `work`, and `finanzas personales`.
- Native desktop menu with keyboard shortcuts for capture, search, save, analysis, export, settings, and note/network views.
- Quick capture can submit the current note with `Ctrl+Enter` or `Cmd+Enter` while plain Enter remains available for multiline notes.
- Native confirmation before deleting notes.
- Automatic and manual note analysis.
- Auto-analysis covers new and pending edited notes: it uses local fallback when Qwen is unavailable and can upgrade those notes once Qwen becomes ready.
- The workspace shows a compact AI queue for pending local/Qwen analysis, including each note, its current status, and why it will be processed before running the batch.
- Ollama integration with `qwen3.5:0.8b` as the default Qwen 0.8B model.
- Health checks, Ollama start attempt, model pull action, and persisted Qwen diagnostics.
- The app separates a missing Ollama installation from a stopped Ollama runtime, so Windows setup guidance can point to install, start, or model pull steps accurately.
- Qwen verifier output includes actionable next steps and setup commands when Ollama or the model is missing.
- Local AI setup checklist in settings for Ollama, model availability, persisted JSON/RAG diagnostic contract, and fallback/Qwen analysis mode.
- Settings can copy PowerShell setup commands for installing Ollama, starting the local runtime, pulling the configured Qwen model, and running a JSON probe on Windows.
- Configurable RAG context limits for Qwen: number of retrieved notes and excerpt length.
- RAG budget indicator in settings to keep context compact enough for Qwen 0.8B.
- Bounded Ollama health and Qwen generation requests, so stalled local AI calls fall back instead of blocking notes.
- Qwen chat requests explicitly disable visible thinking output for a cleaner JSON/RAG contract.
- Qwen JSON responses are sanitized and lightly repaired for common model output issues such as Markdown fences and trailing commas.
- MCP library summary includes the latest matching Qwen JSON/RAG diagnostic result so external hosts can see whether local AI was actually verified.
- Qwen prompts include the note reference date and current title/category/tags, improving time-sensitive actions and metadata-aware categorization.
- Qwen category output is normalized before saving, so small-model answers like `project roadmap` or `health follow up` still land in the app's built-in categories.
- Local fallback analyzer when Ollama/Qwen is unavailable.
- Single-note analysis uses the local analyzer immediately when Qwen is not ready, and Qwen can upgrade those notes later.
- The note analysis button labels Qwen upgrades explicitly when a local fallback note can be reprocessed by the ready model.
- Local fallback analyzer normalizes Spanish accents for category, tag, and action heuristics.
- Local fallback analyzer preserves user tags and infers topic tags such as Qwen, RAG, MCP, tasks, reminders, health, finance, and learning signals.
- Local and Qwen analysis preserve user-authored inline hashtags such as `#cliente` or `#rag` when structuring quick notes.
- Manual pending-note analysis can use the local fallback before Qwen is ready without contacting Ollama; when Qwen becomes available, fallback notes can be upgraded through the Qwen pending flow.
- Pending analysis results report how many notes finished with Qwen, local fallback, failures, or stale skipped updates.
- RAG context generation from locally related notes before Qwen analysis, prioritizing user-curated manual links before TF-IDF-style lexical matches, with stored excerpts and scores for auditability.
- RAG ranking expands lightweight Spanish/English concept aliases such as `cliente/customer`, `recordatorio/reminder`, `RAG/retrieval`, and `MCP/workflow` so related notes can connect without exact wording.
- Explicit note references such as `[[Roadmap Neuronotes]]` or `@roadmap-neuronotes` are treated as strong local link signals on new or edited notes and can seed backlinks before Qwen runs.
- Initial local links are preserved through analysis until Qwen/local analysis confirms the same relationship or replaces the reason with stronger evidence.
- Automatic summaries, categories, tags, and related-note suggestions.
- Editing note content clears stale AI analysis, preserves manual links, and reseeds a local draft summary, inline tags, explicit links, and suggested action intents while waiting for Qwen or fallback analysis.
- Late AI results are ignored if the note changed while analysis was running, preventing stale Qwen/local output from overwriting user edits.
- Suggested action intents that can later map to MCP tools such as tasks, reminders, research, or workflows.
- Local action plan: users can save suggested actions, review them in a global Plan view, mark them done, delete them, and carry them through library/Markdown export.
- Saved actions can be explicitly approved or revoked for MCP handoff review before any future external tool execution exists.
- Saved actions can have their MCP `toolHint` filled or corrected before approval, and changing it clears stale approval.
- Plan view now shows and filters MCP handoff readiness per action, separating ready tool-call drafts, items that still need approval, items missing a tool hint, and completed actions.
- MCP handoff JSON export for open local actions, including tool summaries, action-kind summaries, tool hints, source-note context, structured related-note provenance, and stored RAG snippets without executing external tools.
- Read-only MCP stdio server for local hosts that need to search notes, read note context, inspect analysis queues, list open action intents, build MCP handoff packages, and inspect library/fine-tuning readiness.
- Opt-in MCP write mode for trusted local hosts that need to capture new notes or local action intents into Neuronotes without executing external tools.
- MCP-captured notes use the same local draft seeding as quick capture: clean title, draft summary, tags, category, suggested action intents, and initial related-note/backlink suggestions before later Qwen analysis.
- Live library refresh when an external MCP capture writes to the local database while the app is open.
- MCP connection config is available from the app settings panel, including separate host-ready JSON for read-only access and opt-in note capture.
- Fine-tuning dataset JSONL export from user-reviewed analyzed notes, for future local Qwen tuning experiments without sending data outside the machine.
- Fine-tuning examples mirror the runtime Qwen contract, including allowed categories, no-reasoning JSON output, note metadata, reference date, and stored RAG context.
- Fine-tuning review, exports, and MCP readiness include per-example quality signals, warning when an example comes from local fallback or lacks stored RAG context.
- Fine-tuning readiness summary in settings, showing reviewed JSONL examples, high-quality examples, and analyzed notes still awaiting approval.
- Reciprocal note graph synchronization, including review invalidation when automatic relationships change.
- Manual link and unlink controls.
- Incoming backlinks are visible in the note inspector, so notes that are referenced by other notes do not appear isolated.
- Linked-note rows show provenance badges for manual links, explicit references, local seeded links, RAG context, and incoming backlinks so automatic connections are easier to audit.
- Markdown note exports preserve the same link provenance labels, so exported notes keep audit context outside the app.
- Graph view for direct links, backlinks, and library connection counts.
- The network view highlights isolated notes and can reanalyze them to try to generate AI/RAG links.
- MCP graph inspection exposes deduplicated note edges, backlinks, and isolated notes for local hosts.
- Analysis audit metadata: provider, model, elapsed time, timestamp, retrieved RAG note IDs, scores, and excerpts.
- RAG audit view in the inspector showing the context snippets used during analysis.
- Auto retry of pending notes once Qwen becomes ready, guarded to avoid retry loops.
- JSON library export/import and per-note Markdown export with AI audit metadata and stored RAG context.

## AI Architecture

The analysis flow is:

1. A note is created or selected for analysis.
2. Neuronotes ranks nearby notes locally using manual links first, then TF-IDF-style lexical similarity, phrase overlap, tag overlap, title matches, and category signals.
3. The strongest manual and ranked matches are serialized as RAG context with score, reason, tags, and excerpt, bounded by the local RAG settings.
4. Qwen 0.8B is called through Ollama's chat API with a strict JSON prompt.
5. The response is sanitized and merged with local related-note ranking.
6. Suggested action intents are stored locally without executing external tools.
7. The user can promote suggested actions into a local note plan and explicitly approve selected actions for MCP handoff review.
8. Open local actions can be exported as a Neuronotes MCP handoff JSON file with approval state and tool-call drafts for a future user-approved tool layer.
9. Reviewed analyzed notes can be exported as local supervised JSONL examples for future Qwen fine-tuning if RAG alone is not enough.
10. If Qwen is unavailable or does not answer in time, the app uses local fallback categorization, summary, tags, links, and action hints.
11. The note stores an audit record of the analysis run, including the retrieved RAG snippets.

Default model:

```text
qwen3.5:0.8b
```

Default Ollama endpoint:

```text
http://127.0.0.1:11434
```

## MCP Integration

Neuronotes includes a read-only MCP stdio server for local hosts. It exposes note context and saved action intents without modifying notes or executing external tools. The server currently provides these tools:

- `neuronotes_search_notes`
- `neuronotes_get_note`
- `neuronotes_note_graph`
- `neuronotes_analysis_queue`
- `neuronotes_list_open_actions`
- `neuronotes_mcp_handoff`
- `neuronotes_library_summary`
- `neuronotes_qwen_setup`
- `neuronotes_finetune_readiness`

When the server is explicitly started with `NEURONOTES_MCP_WRITE=1` or `--write`, trusted local hosts also get:

- `neuronotes_create_note`
- `neuronotes_append_note`
- `neuronotes_create_action`

Those write tools only create or update local Neuronotes records: pending notes, appended local note context, or open action intents attached to existing notes. Note capture and append can seed local metadata, action intents, and related-note/backlink suggestions from existing local context. They do not call Qwen, execute external MCP tools, or approve action handoffs.
When the desktop app is open, it watches the local database and refreshes notes/actions after trusted MCP capture writes.

It also exposes MCP resources:

- `neuronotes://library/summary`
- `neuronotes://graph/links`
- `neuronotes://actions/open`
- `neuronotes://actions/handoff`
- `neuronotes://analysis/queue`
- `neuronotes://qwen/setup`
- `neuronotes://finetune/readiness`
- `neuronotes://notes/{noteId}`

And user-controlled prompt templates:

- `neuronotes_review_rag_analysis`
- `neuronotes_prepare_note_append`
- `neuronotes_prepare_action_plan`
- `neuronotes_review_mcp_handoff`
- `neuronotes_library_brief`

Run it from the repo with an explicit database path:

```powershell
npm run mcp:stdio -- --db "$env:APPDATA\Neuronotes\neuronotes.json"
```

MCP hosts can also set `NEURONOTES_DB_PATH` to the full `neuronotes.json` path or `NEURONOTES_USER_DATA` to the directory containing it. The default Windows location is:

```text
%APPDATA%\Neuronotes\neuronotes.json
```

Windows builds include the same stdio server as an unpacked resource:

```text
<Neuronotes install dir>\resources\mcp\neuronotes-mcp.mjs
```

That path can be used by local MCP hosts with `node` when the app has been installed instead of run from the repo.

For a trusted host that should be allowed to capture notes into Neuronotes, start the same stdio server with write mode enabled:

```powershell
$env:NEURONOTES_MCP_WRITE = "1"; npm run mcp:stdio -- --db "$env:APPDATA\Neuronotes\neuronotes.json"
```

or:

```powershell
npm run mcp:stdio -- --db "$env:APPDATA\Neuronotes\neuronotes.json" --write
```

The app settings panel can copy host-ready MCP configuration snippets with paths resolved for the current install and local database.

Read-only context access:

```json
{
  "mcpServers": {
    "neuronotes": {
      "command": "node",
      "args": [
        "<Neuronotes install dir>\\resources\\mcp\\neuronotes-mcp.mjs",
        "--db",
        "%APPDATA%\\Neuronotes\\neuronotes.json"
      ]
    }
  }
}
```

Opt-in local write mode for trusted hosts:

```json
{
  "mcpServers": {
    "neuronotes-write": {
      "command": "node",
      "args": [
        "<Neuronotes install dir>\\resources\\mcp\\neuronotes-mcp.mjs",
        "--db",
        "%APPDATA%\\Neuronotes\\neuronotes.json",
        "--write"
      ]
    }
  }
}
```

MCP tool execution is not wired into the shipped app yet. The intended direction is to let Neuronotes consume user-approved MCP tools for advanced workflows such as:

- Creating tasks, reminders, or calendar actions from notes.
- Searching local documents and attaching findings to note context.
- Running structured automations over selected notes.
- Connecting a local assistant to user-approved tools while keeping note data local-first.

When MCP tool execution lands, it should be added as a separate integration layer with clear permissions, tests, and UI indicators showing what data is being sent to a tool.

The app already stores action intents with an optional `toolHint` field and lets the user save them into a local action plan. Users can mark saved actions as approved for MCP handoff, and exports include approval state plus tool-call drafts for external review. It can export open local actions as `neuronotes.mcp-handoff.v1` JSON with source-note context, model metadata, manual-approval flags, stored RAG snippets, tool summaries, and action-kind summaries. The stdio server exposes the same handoff shape through `neuronotes_mcp_handoff` and `neuronotes://actions/handoff`, plus a `neuronotes_review_mcp_handoff` prompt that asks the host to review risks and missing approvals without executing tools. The stdio server can also report Qwen/Ollama setup guidance and the latest stored JSON/RAG diagnostic through `neuronotes_qwen_setup`, but it does not install Ollama, pull models, or run diagnostics. The stdio server is read-only by default; write mode currently only allows trusted hosts to create locally seeded pending notes, append local context to existing notes, and create unapproved local action intents for later Neuronotes/Qwen processing and user review. It remains the bridge for future MCP execution once permissions and tool routing are implemented.

## Fine-Tuning Dataset

Neuronotes can export reviewed analyzed notes as newline-delimited JSON examples using the `neuronotes.finetune-example.v1` schema. Each line contains `messages` with the same strict JSON/no-reasoning contract used by the runtime Qwen analyzer, note metadata, reference date, retrieved RAG context, and the expected JSON answer with title, summary, category, tags, related notes, and suggested actions. Each example also carries audit metadata for the source note, analysis provider/model, analysis duration, RAG IDs/context count, active RAG settings, quality signals, warnings for weaker examples, and the latest matching Qwen JSON/RAG diagnostic when available.

This does not train a model by itself. It creates a local dataset from notes the user has explicitly approved for training, so unverified Qwen/local outputs are not exported by accident. Those examples can be used later for Qwen fine-tuning experiments if the RAG flow is not accurate enough.

## Local Setup

Install dependencies:

```powershell
npm install
```

Windows quick setup for the local Qwen runtime:

```powershell
npm run setup:qwen:win
```

If Ollama is missing, install Ollama with its official Windows installer script, start it, pull the default model, and verify Qwen with a JSON probe:

```powershell
npm run setup:qwen:win:install
```

If Ollama is already installed and you only need the model:

```powershell
npm run setup:qwen:win:pull
```

Manual alternative:

```powershell
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  irm https://ollama.com/install.ps1 | iex
}
$ollama = (Get-Command ollama).Source
$env:OLLAMA_HOST = '127.0.0.1:11434'
Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden
ollama pull qwen3.5:0.8b
Invoke-RestMethod -Uri http://127.0.0.1:11434/api/tags
```

Verify the local Qwen runtime from the repo:

```powershell
npm run verify:qwen
```

If Ollama is installed but not running, the verifier can try to start it first:

```powershell
npm run verify:qwen:start
```

If Ollama is running but the model is missing, the verifier can pull it first:

```powershell
npm run verify:qwen:pull
```

To start Ollama and pull the model if needed:

```powershell
npm run verify:qwen:start:pull
```

For machine-readable output:

```powershell
npm run verify:qwen:json
npm run verify:qwen:start:json
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

The Windows installer is emitted under `release/`. The `dist:win` script also verifies the NSIS installer, blockmap, update metadata, unpacked executable, bundled `app.asar`, and unpacked MCP stdio server resource.

Verify an existing Windows build without rebuilding:

```powershell
npm run verify:win-dist
```

## Development Notes

- The app icon source is `build/icon.svg`; `npm run icons` regenerates `build/icon.ico`.
- The development build is currently unsigned.
- For public Windows distribution, add a signing certificate and remove `signExecutable: false` from the Electron Builder config.
- Real Qwen inference requires Ollama installed locally and the `qwen3.5:0.8b` model pulled. Use `npm run verify:qwen` to prove the local runtime can generate a valid Neuronotes analysis.
- RAG defaults are tuned conservatively for Qwen 0.8B: 5 context notes, 550 characters per excerpt, and an explicit 4096-token Ollama context window. Long note bodies are bounded inside the Qwen prompt so retrieved RAG context keeps room in the local context budget. The settings panel can reduce or expand retrieved-note and excerpt limits locally.
