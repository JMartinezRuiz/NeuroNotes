import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  AnalysisRun,
  AnalysisStatus,
  DatabaseFile,
  DEFAULT_SETTINGS,
  NoteRecord,
  RelatedNote,
  SuggestedAction,
  SuggestedActionKind
} from './types'

const DB_FILE = 'neuronotes.json'
const DB_BACKUP_FILE = `${DB_FILE}.bak`
const DB_TEMP_FILE = `${DB_FILE}.tmp`

const ANALYSIS_STATUSES = new Set<AnalysisStatus>(['idle', 'qwen', 'fallback', 'error'])

let mutationQueue: Promise<void> = Promise.resolve()

const emptyDatabase = (): DatabaseFile => ({
  version: 1,
  notes: [],
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

  return {
    version: 1,
    notes: Array.isArray(source.notes) ? source.notes.map(normalizeNote).filter(isNoteRecord) : [],
    settings: normalizeSettings(source.settings)
  }
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
  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim()

  return {
    id: randomUUID(),
    title: firstLine?.slice(0, 80) || 'Nota sin titulo',
    content: content.trim(),
    summary: '',
    category: 'Inbox',
    tags: [],
    related: [],
    suggestedActions: [],
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
    autoAnalyze: typeof source.autoAnalyze === 'boolean' ? source.autoAnalyze : DEFAULT_SETTINGS.autoAnalyze
  }
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
    category: typeof source.category === 'string' && source.category.trim() ? source.category.trim() : 'Inbox',
    tags: normalizeTags(source.tags),
    related: normalizeRelated(source.related),
    suggestedActions: normalizeSuggestedActions(source.suggestedActions),
    analysisStatus,
    analysisError: typeof source.analysisError === 'string' && source.analysisError.trim() ? source.analysisError : undefined,
    analysisRun: normalizeAnalysisRun(source.analysisRun),
    createdAt: typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : now
  }
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return []
  }

  return Array.from(
    new Set(
      tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean)
    )
  ).slice(0, 10)
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
      : []
  }
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

function isNoteRecord(note: NoteRecord | undefined): note is NoteRecord {
  return Boolean(note)
}
