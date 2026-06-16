import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { inferSuggestedActions } from './actionSuggestions'
import { normalizeNoteCategory, normalizeNoteTags } from './metadata'
import {
  ActionItem,
  ActionItemStatus,
  AnalysisRun,
  AnalysisStatus,
  AiDiagnosticsResult,
  DatabaseFile,
  DEFAULT_SETTINGS,
  NoteRecord,
  NOTE_CATEGORIES,
  RagContextItem,
  RelatedNote,
  SuggestedAction,
  SuggestedActionKind
} from './types'

const DB_FILE = 'neuronotes.json'
const DB_BACKUP_FILE = `${DB_FILE}.bak`
const DB_TEMP_FILE = `${DB_FILE}.tmp`

const ANALYSIS_STATUSES = new Set<AnalysisStatus>(['idle', 'qwen', 'fallback', 'error'])
const ACTION_STATUSES = new Set<ActionItemStatus>(['open', 'done'])
const DRAFT_CATEGORY_SIGNALS: Array<{ category: string; pattern: RegExp }> = [
  { category: 'Finanzas', pattern: /\b(finanzas?|finance|facturas?|pagos?|presupuesto|gastos?|dinero)\b/ },
  { category: 'Salud', pattern: /\b(salud|health|medic[ao]|doctor|consulta|cita|ejercicio|bienestar|wellness)\b/ },
  { category: 'Trabajo', pattern: /\b(trabajo|work|job|laboral|oficina|cliente|customer|equipo|reunion|deadline)\b/ },
  { category: 'Proyecto', pattern: /\b(proyecto|project|producto|product|roadmap|feature|qwen|rag|mcp|ollama|lanzamiento)\b/ },
  { category: 'Ideas', pattern: /\b(idea|ideas|brainstorming|propuesta|concepto|explorar|interfaz|minimalismo|ui)\b/ },
  { category: 'Aprendizaje', pattern: /\b(aprendizaje|learning|study|estudio|curso|libro|aprender|investigar|paper|fuente)\b/ },
  { category: 'Personal', pattern: /\b(personal|vida|hogar|home|familia)\b/ }
]

let mutationQueue: Promise<void> = Promise.resolve()
let ensureDatabaseQueue: Promise<void> | undefined

const emptyDatabase = (): DatabaseFile => ({
  version: 1,
  notes: [],
  actions: [],
  settings: { ...DEFAULT_SETTINGS }
})

export function databasePaths(userDataPath = app.getPath('userData')): {
  data: string
  backup: string
  temp: string
} {
  return {
    data: path.join(userDataPath, DB_FILE),
    backup: path.join(userDataPath, DB_BACKUP_FILE),
    temp: path.join(userDataPath, DB_TEMP_FILE)
  }
}

async function ensureDatabase(): Promise<void> {
  ensureDatabaseQueue ??= ensureDatabaseFile().finally(() => {
    ensureDatabaseQueue = undefined
  })

  return ensureDatabaseQueue
}

async function ensureDatabaseFile(): Promise<void> {
  const userDataPath = app.getPath('userData')
  const paths = databasePaths(userDataPath)

  await mkdir(userDataPath, { recursive: true })

  const currentDatabase = await readDatabaseFile(paths.data)
  if (currentDatabase) {
    return
  }

  const backupDatabase = await readDatabaseFile(paths.backup)
  if (backupDatabase) {
    await writeDatabase(backupDatabase)
    return
  }

  await writeDatabase(emptyDatabase())
}

export function normalizeDatabase(raw: Partial<DatabaseFile> | null | undefined): DatabaseFile {
  const source = raw && typeof raw === 'object' ? raw : {}
  const notes = Array.isArray(source.notes) ? source.notes.map(normalizeNote).filter(isNoteRecord) : []
  const noteIds = new Set(notes.map((note) => note.id))
  const notesById = new Map(notes.map((note) => [note.id, note]))
  const normalizedNotes = notes.map((note) => normalizeNoteReferences(note, notesById, noteIds))
  const normalizedNotesById = new Map(normalizedNotes.map((note) => [note.id, note]))

  const settings = normalizeSettings(source.settings)

  return {
    version: 1,
    notes: normalizedNotes,
    actions: Array.isArray(source.actions)
      ? source.actions
          .map(normalizeActionItem)
          .filter(isActionItem)
          .filter((action) => noteIds.has(action.noteId))
          .map((action) => normalizeActionReferences(action, normalizedNotesById))
      : [],
    settings,
    aiDiagnostics: normalizeAiDiagnostics(source.aiDiagnostics, settings)
  }
}

function normalizeActionReferences(action: ActionItem, notesById: Map<string, NoteRecord>): ActionItem {
  const note = notesById.get(action.noteId)

  if (!note || action.noteTitle === note.title) {
    return action
  }

  return {
    ...action,
    noteTitle: note.title
  }
}

function normalizeNoteReferences(
  note: NoteRecord,
  notesById: Map<string, NoteRecord>,
  noteIds: Set<string>
): NoteRecord {
  let changed = false
  const related: RelatedNote[] = []

  for (const link of note.related) {
    const target = notesById.get(link.noteId)

    if (!target || target.id === note.id) {
      changed = true
      continue
    }

    related.push(link.title === target.title ? link : { ...link, title: target.title })
  }

  const analysisRunResult = normalizeAnalysisRunReferences(note.analysisRun, note.id, noteIds)
  changed = changed || analysisRunResult.changed

  const normalized: NoteRecord = {
    ...note,
    related,
    analysisRun: analysisRunResult.analysisRun
  }

  return {
    ...normalized,
    trainingReviewedAt: changed || !isTrainingReviewable(normalized) ? undefined : note.trainingReviewedAt
  }
}

function normalizeAnalysisRunReferences(
  analysisRun: AnalysisRun | undefined,
  sourceNoteId: string,
  noteIds: Set<string>
): { analysisRun: AnalysisRun | undefined; changed: boolean } {
  if (!analysisRun) {
    return {
      analysisRun: undefined,
      changed: false
    }
  }

  const ragNoteIds = uniqueValidReferenceIds(analysisRun.ragNoteIds, sourceNoteId, noteIds)
  const ragContext = (analysisRun.ragContext ?? []).filter(
    (item) => item.noteId !== sourceNoteId && noteIds.has(item.noteId)
  )
  const changed =
    ragNoteIds.length !== analysisRun.ragNoteIds.length ||
    ragContext.length !== (analysisRun.ragContext ?? []).length

  return {
    analysisRun: {
      ...analysisRun,
      ragNoteIds,
      ragContext
    },
    changed
  }
}

function uniqueValidReferenceIds(values: string[], sourceNoteId: string, noteIds: Set<string>): string[] {
  const unique = new Set<string>()

  for (const value of values) {
    if (value === sourceNoteId || !noteIds.has(value)) {
      continue
    }

    unique.add(value)
  }

  return [...unique]
}

function isTrainingReviewable(note: NoteRecord): boolean {
  if (!note.content.trim() || (note.analysisStatus !== 'qwen' && note.analysisStatus !== 'fallback')) {
    return false
  }

  return Boolean(note.summary.trim() || note.tags.length > 0 || note.related.length > 0 || note.suggestedActions.length > 0)
}

export async function readDatabase(): Promise<DatabaseFile> {
  await ensureDatabase()
  const paths = databasePaths()
  const database = await readDatabaseFile(paths.data)

  if (database) {
    return database
  }

  const backupDatabase = await readDatabaseFile(paths.backup)
  if (backupDatabase) {
    await writeDatabase(backupDatabase)
    return backupDatabase
  }

  const empty = emptyDatabase()
  await writeDatabase(empty)
  return empty
}

export async function writeDatabase(database: DatabaseFile): Promise<void> {
  const userDataPath = app.getPath('userData')
  const paths = databasePaths(userDataPath)
  const normalized = normalizeDatabase(database)

  await mkdir(userDataPath, { recursive: true })
  await writeFile(paths.temp, serializeDatabase(normalized), 'utf8')

  try {
    await rename(paths.temp, paths.data)
    await copyFile(paths.data, paths.backup)
  } catch (error) {
    await unlink(paths.temp).catch(() => undefined)
    throw error
  }
}

export async function mutateDatabase<T>(
  mutator: (database: DatabaseFile) => T | Promise<T>
): Promise<T> {
  const operation = mutationQueue.then(async () => {
    const database = await readDatabase()
    const result = await mutator(database)
    await writeDatabase(database)
    return result
  })

  mutationQueue = operation.then(
    () => undefined,
    () => undefined
  )

  return operation
}

export async function listNotes(): Promise<NoteRecord[]> {
  const database = await readDatabase()
  return [...database.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function createNoteDraft(content: string): NoteRecord {
  const now = new Date().toISOString()
  const trimmedContent = content.trim()
  const tags = inferDraftTags(trimmedContent)
  const summary = summarizeDraftContent(trimmedContent)
  const title = inferDraftTitle(trimmedContent, summary)

  return {
    id: randomUUID(),
    title,
    content: trimmedContent,
    summary,
    category: inferDraftCategory(trimmedContent, tags),
    tags,
    related: [],
    suggestedActions: inferSuggestedActions(trimmedContent),
    analysisStatus: 'idle',
    createdAt: now,
    updatedAt: now
  }
}

function serializeDatabase(database: DatabaseFile): string {
  return `${JSON.stringify(database, null, 2)}\n`
}

async function readDatabaseFile(filePath: string): Promise<DatabaseFile | undefined> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return normalizeDatabase(JSON.parse(raw) as Partial<DatabaseFile>)
  } catch {
    return undefined
  }
}

function normalizeSettings(settings: unknown): DatabaseFile['settings'] {
  if (!settings || typeof settings !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }

  const source = settings as Partial<DatabaseFile['settings']>

  return {
    model: typeof source.model === 'string' && source.model.trim() ? source.model.trim() : DEFAULT_SETTINGS.model,
    ollamaUrl:
      typeof source.ollamaUrl === 'string' && source.ollamaUrl.trim()
        ? source.ollamaUrl.trim().replace(/\/$/, '')
        : DEFAULT_SETTINGS.ollamaUrl,
    autoAnalyze: typeof source.autoAnalyze === 'boolean' ? source.autoAnalyze : DEFAULT_SETTINGS.autoAnalyze,
    ragMaxNotes: clampInteger(source.ragMaxNotes, 0, 6, DEFAULT_SETTINGS.ragMaxNotes),
    ragExcerptLength: clampInteger(source.ragExcerptLength, 160, 1200, DEFAULT_SETTINGS.ragExcerptLength)
  }
}

function inferDraftTags(content: string): string[] {
  return normalizeNoteTags([...content.matchAll(/(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]{1,39})/gu)].map((match) => match[2]))
}

function inferDraftTitle(content: string, summary: string): string {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0)
  const title = firstLine ? cleanDraftText(firstLine).slice(0, 80) : ''

  return title || summary.slice(0, 80) || 'Nota sin titulo'
}

function summarizeDraftContent(content: string): string {
  const text = content
    .split(/\r?\n/)
    .map(cleanDraftText)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = text.split(/\s+/).filter(Boolean)

  return words.slice(0, 34).join(' ').slice(0, 220)
}

function cleanDraftText(value: string): string {
  return value
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+(?:\[[ xX]\]\s+)?/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/(^|\s)(?:y|and|o|or)\s+#[\p{L}\p{N}][\p{L}\p{N}_-]{1,39}/gu, '$1')
    .replace(/(^|\s)#[\p{L}\p{N}][\p{L}\p{N}_-]{1,39}/gu, '$1')
    .replace(/\s+/g, ' ')
    .replace(/^[,;:|/\\-]+|[,;:|/\\-]+$/g, '')
    .trim()
}

function inferDraftCategory(content: string, tags: string[]): string {
  const taggedCategory = tags
    .map((tag) => normalizeNoteCategory(tag))
    .find((category) => category !== 'Inbox' && NOTE_CATEGORIES.includes(category as (typeof NOTE_CATEGORIES)[number]))

  if (taggedCategory) {
    return taggedCategory
  }

  const normalizedText = normalizeDraftText(`${content} ${tags.join(' ')}`)
  const signal = DRAFT_CATEGORY_SIGNALS.find((item) => item.pattern.test(normalizedText))

  return signal?.category ?? 'Inbox'
}

function normalizeDraftText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeAiDiagnostics(value: unknown, settings: DatabaseFile['settings']): AiDiagnosticsResult | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const source = value as Partial<AiDiagnosticsResult>
  const model = typeof source.model === 'string' ? source.model.trim() : ''
  const ollamaUrl = typeof source.ollamaUrl === 'string' ? source.ollamaUrl.trim().replace(/\/$/, '') : ''

  if (
    model !== settings.model ||
    ollamaUrl !== settings.ollamaUrl ||
    source.ragMaxNotes !== settings.ragMaxNotes ||
    source.ragExcerptLength !== settings.ragExcerptLength
  ) {
    return undefined
  }

  const status = ANALYSIS_STATUSES.has(source.status as AnalysisStatus) ? (source.status as AnalysisStatus) : undefined
  const diagnosedAt = typeof source.diagnosedAt === 'string' && source.diagnosedAt.trim() ? source.diagnosedAt.trim() : ''
  const message = typeof source.message === 'string' && source.message.trim() ? source.message.trim().slice(0, 240) : ''

  if (!status || !diagnosedAt || !message) {
    return undefined
  }

  const normalized: AiDiagnosticsResult = {
    ok: Boolean(source.ok),
    status,
    message,
    model,
    ollamaUrl,
    ragMaxNotes: settings.ragMaxNotes,
    ragExcerptLength: settings.ragExcerptLength,
    diagnosedAt,
    durationMs: Math.max(0, Math.round(Number.isFinite(source.durationMs) ? Number(source.durationMs) : 0)),
    category: normalizeNoteCategory(source.category),
    summary: typeof source.summary === 'string' ? source.summary.trim().slice(0, 320) : '',
    related: Math.max(0, Math.round(Number.isFinite(source.related) ? Number(source.related) : 0))
  }

  if (typeof source.error === 'string' && source.error.trim()) {
    normalized.error = source.error.trim().slice(0, 240)
  }

  return normalized
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.round(Number(value))))
}

function normalizeNote(value: unknown): NoteRecord | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const source = value as Partial<NoteRecord>
  const id = typeof source.id === 'string' ? source.id.trim() : ''
  const content = typeof source.content === 'string' ? source.content : ''

  if (!id) {
    return undefined
  }

  const now = new Date().toISOString()
  const title =
    typeof source.title === 'string' && source.title.trim()
      ? source.title.trim().slice(0, 90)
      : content.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 90) || 'Nota sin titulo'
  const analysisStatus =
    typeof source.analysisStatus === 'string' && ANALYSIS_STATUSES.has(source.analysisStatus as AnalysisStatus)
      ? source.analysisStatus
      : 'idle'

  return {
    id,
    title,
    content,
    summary: typeof source.summary === 'string' ? source.summary : '',
    category: normalizeNoteCategory(source.category),
    tags: normalizeTags(source.tags),
    related: normalizeRelated(source.related),
    suggestedActions: normalizeSuggestedActions(source.suggestedActions),
    analysisStatus,
    analysisError: typeof source.analysisError === 'string' && source.analysisError.trim() ? source.analysisError : undefined,
    analysisRun: normalizeAnalysisRun(source.analysisRun),
    trainingReviewedAt:
      typeof source.trainingReviewedAt === 'string' && source.trainingReviewedAt.trim()
        ? source.trainingReviewedAt.trim()
        : undefined,
    createdAt: typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : now
  }
}

function normalizeTags(tags: unknown): string[] {
  return normalizeNoteTags(tags)
}

function normalizeRelated(related: unknown): RelatedNote[] {
  if (!Array.isArray(related)) {
    return []
  }

  return related
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return undefined
      }

      const source = item as Partial<RelatedNote>
      const noteId = typeof source.noteId === 'string' ? source.noteId.trim() : ''

      if (!noteId) {
        return undefined
      }

      return {
        noteId,
        title: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : 'Nota relacionada',
        score: Math.max(0, Math.min(1, Number.isFinite(source.score) ? Number(source.score) : 0)),
        reason: typeof source.reason === 'string' && source.reason.trim() ? source.reason.trim() : 'Relacion detectada por Neuronotes.'
      } satisfies RelatedNote
    })
    .filter((item): item is RelatedNote => Boolean(item))
    .slice(0, 10)
}

function normalizeAnalysisRun(value: unknown): AnalysisRun | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const source = value as Partial<AnalysisRun>
  const provider = source.provider === 'qwen' || source.provider === 'local' ? source.provider : undefined
  const model = typeof source.model === 'string' && source.model.trim() ? source.model.trim() : ''
  const analyzedAt = typeof source.analyzedAt === 'string' && source.analyzedAt.trim() ? source.analyzedAt.trim() : ''

  if (!provider || !model || !analyzedAt) {
    return undefined
  }

  return {
    provider,
    model,
    analyzedAt,
    durationMs: Math.max(0, Number.isFinite(source.durationMs) ? Number(source.durationMs) : 0),
    ragNoteIds: Array.isArray(source.ragNoteIds)
      ? source.ragNoteIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [],
    ragContext: normalizeRagContext(source.ragContext)
  }
}

function normalizeRagContext(value: unknown): RagContextItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return undefined
      }

      const source = item as Partial<RagContextItem>
      const noteId = typeof source.noteId === 'string' ? source.noteId.trim() : ''
      const title = typeof source.title === 'string' && source.title.trim() ? source.title.trim().slice(0, 90) : ''

      if (!noteId || !title) {
        return undefined
      }

      return {
        noteId,
        title,
        category: normalizeNoteCategory(source.category),
        tags: normalizeTags(source.tags).slice(0, 8),
        score: Math.max(0, Math.min(1, Number.isFinite(source.score) ? Number(source.score) : 0)),
        reason:
          typeof source.reason === 'string' && source.reason.trim()
            ? source.reason.trim().slice(0, 140)
            : 'Contexto recuperado por RAG local.',
        excerpt:
          typeof source.excerpt === 'string' && source.excerpt.trim()
            ? source.excerpt.trim().replace(/\s+/g, ' ').slice(0, 550)
            : ''
      } satisfies RagContextItem
    })
    .filter((item): item is RagContextItem => Boolean(item))
    .slice(0, 5)
}

function normalizeSuggestedActions(value: unknown): SuggestedAction[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return undefined
      }

      const source = item as Partial<SuggestedAction>
      const kind = normalizeSuggestedActionKind(source.kind)
      const title = typeof source.title === 'string' && source.title.trim() ? source.title.trim().slice(0, 90) : ''

      if (!kind || !title) {
        return undefined
      }

      const action: SuggestedAction = {
        kind,
        title,
        detail:
          typeof source.detail === 'string' && source.detail.trim()
            ? source.detail.trim().slice(0, 180)
            : 'Accion sugerida por Neuronotes.',
        confidence: Math.max(0, Math.min(1, Number.isFinite(source.confidence) ? Number(source.confidence) : 0))
      }
      const toolHint =
        typeof source.toolHint === 'string' && source.toolHint.trim()
          ? source.toolHint.trim().slice(0, 80)
          : ''

      if (toolHint) {
        action.toolHint = toolHint
      }

      return action
    })
    .filter((item): item is SuggestedAction => Boolean(item))
    .slice(0, 8)
}

function normalizeSuggestedActionKind(value: unknown): SuggestedActionKind | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'task' || normalized === 'reminder' || normalized === 'research' || normalized === 'mcp') {
    return normalized
  }

  return undefined
}

function normalizeActionItem(value: unknown): ActionItem | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const source = value as Partial<ActionItem>
  const id = typeof source.id === 'string' ? source.id.trim() : ''
  const noteId = typeof source.noteId === 'string' ? source.noteId.trim() : ''
  const kind = normalizeSuggestedActionKind(source.kind)
  const title = typeof source.title === 'string' && source.title.trim() ? source.title.trim().slice(0, 90) : ''

  if (!id || !noteId || !kind || !title) {
    return undefined
  }

  const status =
    typeof source.status === 'string' && ACTION_STATUSES.has(source.status as ActionItemStatus)
      ? (source.status as ActionItemStatus)
      : 'open'
  const now = new Date().toISOString()
  const action: ActionItem = {
    id,
    noteId,
    noteTitle:
      typeof source.noteTitle === 'string' && source.noteTitle.trim()
        ? source.noteTitle.trim().slice(0, 90)
        : 'Nota vinculada',
    kind,
    title,
    detail:
      typeof source.detail === 'string' && source.detail.trim()
        ? source.detail.trim().slice(0, 180)
        : 'Accion guardada en Neuronotes.',
    confidence: Math.max(0, Math.min(1, Number.isFinite(source.confidence) ? Number(source.confidence) : 0)),
    status,
    createdAt: typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : now
  }
  const toolHint =
    typeof source.toolHint === 'string' && source.toolHint.trim()
      ? source.toolHint.trim().slice(0, 80)
      : ''

  if (toolHint) {
    action.toolHint = toolHint
  }

  if (typeof source.mcpApprovedAt === 'string' && source.mcpApprovedAt.trim()) {
    action.mcpApprovedAt = source.mcpApprovedAt.trim()
  }

  return action
}

function isNoteRecord(note: NoteRecord | undefined): note is NoteRecord {
  return Boolean(note)
}

function isActionItem(action: ActionItem | undefined): action is ActionItem {
  return Boolean(action)
}
