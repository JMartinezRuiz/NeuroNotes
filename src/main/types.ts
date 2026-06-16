import type { LinkProvenance } from '../shared/linkProvenance'

export type AnalysisStatus = 'idle' | 'qwen' | 'fallback' | 'error'

export interface RelatedNote {
  noteId: string
  title: string
  score: number
  reason: string
}

export interface RagContextItem {
  noteId: string
  title: string
  category: string
  tags: string[]
  score: number
  reason: string
  excerpt: string
}

export type SuggestedActionKind = 'task' | 'reminder' | 'research' | 'mcp'

export interface SuggestedAction {
  kind: SuggestedActionKind
  title: string
  detail: string
  toolHint?: string
  confidence: number
}

export type ActionItemStatus = 'open' | 'done'

export interface ActionItem {
  id: string
  noteId: string
  noteTitle: string
  kind: SuggestedActionKind
  title: string
  detail: string
  toolHint?: string
  mcpApprovedAt?: string
  confidence: number
  status: ActionItemStatus
  createdAt: string
  updatedAt: string
}

export type AnalysisProvider = 'qwen' | 'local'
export type AnalysisMode = 'qwen' | 'local'

export interface AnalysisRun {
  provider: AnalysisProvider
  model: string
  analyzedAt: string
  durationMs: number
  ragNoteIds: string[]
  ragContext?: RagContextItem[]
}

export interface NoteRecord {
  id: string
  title: string
  content: string
  summary: string
  category: string
  tags: string[]
  related: RelatedNote[]
  suggestedActions: SuggestedAction[]
  analysisStatus: AnalysisStatus
  analysisError?: string
  analysisRun?: AnalysisRun
  trainingReviewedAt?: string
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  model: string
  ollamaUrl: string
  autoAnalyze: boolean
  ragMaxNotes: number
  ragExcerptLength: number
}

export type AiHealthStatus = 'ready' | 'ollama-not-installed' | 'ollama-missing' | 'model-missing' | 'error'

export interface AiHealth {
  ok: boolean
  status: AiHealthStatus
  message: string
  model: string
  ollamaUrl: string
  ollamaAvailable: boolean
  modelInstalled: boolean
  installedModels: string[]
  installedQwenModels: string[]
}

export interface PullModelResult {
  ok: boolean
  message: string
  model: string
}

export interface AiRuntimeStartResult {
  ok: boolean
  started: boolean
  message: string
  executablePath?: string
  reason?: 'not-installed' | 'start-failed'
  health?: AiHealth
}

export interface AiRuntimePrepareResult {
  ok: boolean
  stage: AiHealthStatus
  started: boolean
  pulled: boolean
  message: string
  health?: AiHealth
  error?: string
}

export interface AiDiagnosticsResult {
  ok: boolean
  status: AnalysisStatus
  message: string
  model: string
  ollamaUrl: string
  ragMaxNotes: number
  ragExcerptLength: number
  diagnosedAt: string
  durationMs: number
  category: string
  summary: string
  related: number
  error?: string
}

export interface AiSetupCommandResult {
  ok: boolean
  message: string
  command: string
}

export interface RagPreviewResult {
  schema: 'neuronotes.rag-preview.v1'
  noteId: string
  model: string
  ragMaxNotes: number
  ragExcerptLength: number
  noteIds: string[]
  related: RelatedNote[]
  items: RagContextItem[]
  text: string
}

export type AnalyzePendingMode = 'qwen' | 'local'

export interface AnalyzePendingResult {
  total: number
  analyzed: number
  failed: number
  qwen: number
  local: number
  skipped: number
  lastUpdatedId?: string
}

export interface DeleteNoteResult {
  ok: boolean
  canceled: boolean
  deleted: boolean
  message: string
  noteId: string
}

export interface LibraryExportResult {
  ok: boolean
  canceled: boolean
  message: string
  path?: string
  notes: number
}

export interface LibraryMarkdownExportResult {
  ok: boolean
  canceled: boolean
  message: string
  path?: string
  notes: number
  files: number
}

export interface LibraryMarkdownImportResult {
  ok: boolean
  canceled: boolean
  message: string
  path?: string
  files: number
  imported: number
  skipped: number
}

export interface LibraryImportResult {
  ok: boolean
  canceled: boolean
  message: string
  path?: string
  total: number
  imported: number
  updated: number
  skipped: number
  actionsImported: number
  actionsUpdated: number
  actionsSkipped: number
}

export interface NoteMarkdownExportResult {
  ok: boolean
  canceled: boolean
  message: string
  path?: string
  noteId: string
}

export interface McpHandoffExportResult {
  ok: boolean
  canceled: boolean
  message: string
  path?: string
  actions: number
}

export interface McpConnectionConfig {
  schema: string
  serverName: string
  writeServerName: string
  command: string
  args: string[]
  writeArgs: string[]
  databasePath: string
  serverPath: string
  hostConfigJson: string
  writeHostConfigJson: string
}

export interface FineTuneDatasetExportResult {
  ok: boolean
  canceled: boolean
  message: string
  path?: string
  examples: number
}

export interface HandoffRelatedNote {
  noteId: string
  title: string
  score: number
  reason: string
  provenance: LinkProvenance
}

export interface McpHandoffPayload {
  schema: string
  exportedAt: string
  execution: {
    mode: string
    requiresUserApproval: boolean
    sideEffects: string
  }
  model: string
  ollamaUrl: string
  actionCount: number
  approvedActionCount: number
  doneActionCount: number
  toolSummary: Array<{
    toolHint: string
    actionCount: number
    kinds: string[]
    sourceNoteIds: string[]
  }>
  kindSummary: Array<{
    kind: string
    actionCount: number
  }>
  actions: Array<{
    id: string
    kind: string
    status: string
    title: string
    detail: string
    toolHint: string | null
    confidence: number
    approval: {
      required: boolean
      state: 'approved' | 'needs-review'
      approvedAt: string | null
    }
    toolCallDraft: {
      status: 'ready-for-review' | 'needs-tool-selection'
      toolName: string | null
      arguments: {
        kind: string
        title: string
        detail: string
        confidence: number
        sourceNoteId: string
        sourceNoteTitle: string
        sourceNoteSummary: string
        sourceNoteCategory: string
        sourceNoteTags: string[]
        relatedNoteIds: string[]
        relatedNotes: HandoffRelatedNote[]
        ragContext: RagContextItem[]
        requiresUserReview: boolean
        draftCompleteness: 'ready' | 'needs-tool-selection'
        taskTitle?: string
        taskDetail?: string
        eventTitle?: string
        eventNotes?: string
        timeText?: string
        subject?: string
        body?: string
        recipientHint?: string
        message?: string
        callTitle?: string
        agenda?: string
        query?: string
        workflowGoal?: string
        safetyNote?: string
      }
    }
    createdAt: string
    updatedAt: string
    sourceNote: {
      id: string
      title: string
      summary: string
      category: string
      tags: string[]
      contentExcerpt: string
      relatedNoteIds: string[]
      relatedNotes: HandoffRelatedNote[]
      analysis: {
        provider: string
        model: string
        analyzedAt: string
        ragNoteIds: string[]
        ragContext: RagContextItem[]
      } | null
    }
  }>
}

export interface DatabaseFile {
  version: 1
  notes: NoteRecord[]
  actions: ActionItem[]
  settings: AppSettings
  aiDiagnostics?: AiDiagnosticsResult
}

export interface AnalysisResult {
  title: string
  summary: string
  category: string
  tags: string[]
  related: RelatedNote[]
  suggestedActions: SuggestedAction[]
  status: AnalysisStatus
  error?: string
  analysisRun: AnalysisRun
}

export const DEFAULT_SETTINGS: AppSettings = {
  model: 'qwen3.5:0.8b',
  ollamaUrl: 'http://127.0.0.1:11434',
  autoAnalyze: true,
  ragMaxNotes: 5,
  ragExcerptLength: 550
}

export const NOTE_CATEGORIES = [
  'Inbox',
  'Trabajo',
  'Proyecto',
  'Ideas',
  'Aprendizaje',
  'Personal',
  'Salud',
  'Finanzas'
] as const
