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

export type AiHealthStatus = 'ready' | 'ollama-missing' | 'model-missing' | 'error'

export interface AiHealth {
  ok: boolean
  status: AiHealthStatus
  message: string
  model: string
  ollamaUrl: string
  ollamaAvailable: boolean
  modelInstalled: boolean
  installedModels: string[]
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
  command: string
  args: string[]
  databasePath: string
  serverPath: string
  hostConfigJson: string
}

export interface FineTuneDatasetExportResult {
  ok: boolean
  canceled: boolean
  message: string
  path?: string
  examples: number
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
