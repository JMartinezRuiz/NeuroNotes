export type AnalysisStatus = 'idle' | 'qwen' | 'fallback' | 'error'

export interface RelatedNote {
  noteId: string
  title: string
  score: number
  reason: string
}

export type AnalysisProvider = 'qwen' | 'local'

export interface AnalysisRun {
  provider: AnalysisProvider
  model: string
  analyzedAt: string
  durationMs: number
  ragNoteIds: string[]
}

export interface NoteRecord {
  id: string
  title: string
  content: string
  summary: string
  category: string
  tags: string[]
  related: RelatedNote[]
  analysisStatus: AnalysisStatus
  analysisError?: string
  analysisRun?: AnalysisRun
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  model: string
  ollamaUrl: string
  autoAnalyze: boolean
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
  durationMs: number
  category: string
  summary: string
  related: number
  error?: string
}

export interface AnalyzePendingResult {
  total: number
  analyzed: number
  failed: number
  lastUpdatedId?: string
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
}

export interface NoteMarkdownExportResult {
  ok: boolean
  canceled: boolean
  message: string
  path?: string
  noteId: string
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
