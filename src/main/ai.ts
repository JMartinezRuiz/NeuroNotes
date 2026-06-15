import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import path from 'node:path'
import {
  AiHealth,
  AiDiagnosticsResult,
  AiRuntimeStartResult,
  AnalysisMode,
  AnalysisProvider,
  AnalysisResult,
  AnalysisRun,
  AppSettings,
  NoteRecord,
  NOTE_CATEGORIES,
  PullModelResult,
  RagContextItem,
  RelatedNote,
  SuggestedAction,
  SuggestedActionKind
} from './types'
import { buildRagContextBundle, rankRelatedNotes } from './linking'

interface OllamaGenerateResponse {
  response?: string
  error?: string
}

interface OllamaTagsResponse {
  models?: Array<{
    name?: string
    model?: string
  }>
}

interface OllamaPullResponse {
  status?: string
  error?: string
}

interface AiPayload {
  title?: unknown
  summary?: unknown
  category?: unknown
  tags?: unknown
  related?: unknown
  linkSuggestions?: unknown
  actions?: unknown
  suggestedActions?: unknown
  actionSuggestions?: unknown
}

export async function checkOllama(settings: AppSettings): Promise<AiHealth> {
  try {
    const response = await fetch(`${settings.ollamaUrl}/api/tags`, { method: 'GET' })
    if (!response.ok) {
      return {
        ok: false,
        status: 'error',
        message: `Ollama respondio ${response.status}`,
        model: settings.model,
        ollamaUrl: settings.ollamaUrl,
        ollamaAvailable: true,
        modelInstalled: false,
        installedModels: []
      }
    }

    const payload = (await response.json()) as OllamaTagsResponse
    const installedModels = (payload.models ?? [])
      .map((model) => model.name ?? model.model ?? '')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
    const modelInstalled = installedModels.some((model) => model.toLowerCase() === settings.model.toLowerCase())

    if (!modelInstalled) {
      return {
        ok: false,
        status: 'model-missing',
        message: `Falta ${settings.model}`,
        model: settings.model,
        ollamaUrl: settings.ollamaUrl,
        ollamaAvailable: true,
        modelInstalled: false,
        installedModels
      }
    }

    return {
      ok: true,
      status: 'ready',
      message: `${settings.model} listo`,
      model: settings.model,
      ollamaUrl: settings.ollamaUrl,
      ollamaAvailable: true,
      modelInstalled: true,
      installedModels
    }
  } catch (error) {
    return {
      ok: false,
      status: 'ollama-missing',
      message: error instanceof Error ? error.message : 'Ollama no disponible',
      model: settings.model,
      ollamaUrl: settings.ollamaUrl,
      ollamaAvailable: false,
      modelInstalled: false,
      installedModels: []
    }
  }
}

export async function pullQwenModel(settings: AppSettings): Promise<PullModelResult> {
  const response = await fetch(`${settings.ollamaUrl}/api/pull`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: settings.model,
      stream: false
    })
  })

  if (!response.ok) {
    throw new Error(`Ollama respondio ${response.status} al descargar ${settings.model}`)
  }

  const payload = (await response.json()) as OllamaPullResponse

  if (payload.error) {
    throw new Error(payload.error)
  }

  return {
    ok: true,
    message: `${settings.model} instalado`,
    model: settings.model
  }
}

export async function startOllamaRuntime(settings: AppSettings): Promise<AiRuntimeStartResult> {
  const currentHealth = await checkOllama(settings)

  if (currentHealth.ollamaAvailable) {
    return {
      ok: true,
      started: false,
      message: currentHealth.ok ? currentHealth.message : `Ollama activo. ${currentHealth.message}`,
      health: currentHealth
    }
  }

  const executablePath = await findOllamaExecutable()

  if (!executablePath) {
    return {
      ok: false,
      started: false,
      reason: 'not-installed',
      message: 'Ollama no esta instalado'
    }
  }

  try {
    const child = spawn(executablePath, ['serve'], {
      detached: true,
      env: {
        ...process.env,
        ...resolveOllamaHostEnv(settings.ollamaUrl)
      },
      stdio: 'ignore',
      windowsHide: true
    })

    child.unref()
  } catch (error) {
    return {
      ok: false,
      started: false,
      executablePath,
      reason: 'start-failed',
      message: error instanceof Error ? error.message : 'No se pudo iniciar Ollama'
    }
  }

  const health = await waitForOllama(settings)

  return {
    ok: health.ollamaAvailable,
    started: true,
    executablePath,
    health,
    message: health.ollamaAvailable ? `Ollama iniciado. ${health.message}` : 'Ollama no respondio despues de iniciar'
  }
}

export async function runAiDiagnostics(settings: AppSettings): Promise<AiDiagnosticsResult> {
  const startedAt = Date.now()
  const createdAt = new Date().toISOString()
  const probe: NoteRecord = {
    id: 'diagnostic-source',
    title: 'Diagnostico Neuronotes',
    content: 'Proyecto Neuronotes: probar Qwen 0.8b con RAG para resumir, categorizar y enlazar notas automaticamente.',
    summary: '',
    category: 'Proyecto',
    tags: ['qwen', 'rag', 'neuronotes'],
    related: [],
    suggestedActions: [],
    analysisStatus: 'idle',
    createdAt,
    updatedAt: createdAt
  }
  const context: NoteRecord = {
    id: 'diagnostic-context',
    title: 'Contexto RAG local',
    content: 'La app debe convertir notas rapidas en una base conectada con resumen automatico, categorias y enlaces.',
    summary: 'Contexto de producto para diagnosticar el motor local.',
    category: 'Proyecto',
    tags: ['rag', 'notas'],
    related: [],
    suggestedActions: [],
    analysisStatus: 'qwen',
    createdAt,
    updatedAt: createdAt
  }
  const analysis = await analyzeNote(probe, [probe, context], settings)
  const ok = analysis.status === 'qwen'

  return {
    ok,
    status: analysis.status,
    message: ok
      ? `${settings.model} respondio correctamente`
      : `La prueba uso analisis local: ${analysis.error ?? 'Qwen no respondio'}`,
    model: settings.model,
    durationMs: Date.now() - startedAt,
    category: analysis.category,
    summary: analysis.summary,
    related: analysis.related.length,
    error: analysis.error
  }
}

export async function analyzeNote(
  note: NoteRecord,
  allNotes: NoteRecord[],
  settings: AppSettings,
  mode: AnalysisMode = 'qwen'
): Promise<AnalysisResult> {
  const startedAt = Date.now()
  const localRelated = rankRelatedNotes(note, allNotes)
  const ragContext = buildRagContextBundle(note, allNotes)

  if (mode === 'local') {
    const fallback = fallbackAnalysis(note, localRelated)

    return {
      ...fallback,
      status: 'fallback',
      analysisRun: createAnalysisRun('local', settings, startedAt, ragContext.items)
    }
  }

  try {
    const qwenResult = await analyzeWithQwen(note, allNotes, settings, ragContext.text)
    const mergedRelated = mergeRelated(qwenResult.related, localRelated)

    return {
      ...qwenResult,
      related: mergedRelated,
      status: 'qwen',
      analysisRun: createAnalysisRun('qwen', settings, startedAt, ragContext.items)
    }
  } catch (error) {
    const fallback = fallbackAnalysis(note, localRelated)

    return {
      ...fallback,
      status: 'fallback',
      error: error instanceof Error ? error.message : 'No se pudo analizar con Qwen',
      analysisRun: createAnalysisRun('local', settings, startedAt, ragContext.items)
    }
  }
}

async function analyzeWithQwen(
  note: NoteRecord,
  allNotes: NoteRecord[],
  settings: AppSettings,
  ragContext: string
): Promise<Omit<AnalysisResult, 'status' | 'error' | 'analysisRun'>> {
  const response = await fetch(`${settings.ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.2,
        num_predict: 550
      },
      prompt: buildPrompt(note, ragContext)
    })
  })

  if (!response.ok) {
    throw new Error(`Ollama respondio ${response.status}. Revisa que ${settings.model} este instalado.`)
  }

  const payload = (await response.json()) as OllamaGenerateResponse

  if (payload.error) {
    throw new Error(payload.error)
  }

  if (!payload.response) {
    throw new Error('Ollama no devolvio contenido')
  }

  return sanitizeAiPayload(parseJson(payload.response), allNotes)
}

function buildPrompt(note: NoteRecord, context: string): string {
  return `Eres el motor local de Neuronotes. Analiza la nota nueva y usa el contexto recuperado solo si ayuda.

Devuelve exclusivamente JSON valido con esta forma:
{
  "title": "maximo 8 palabras",
  "summary": "resumen en una frase",
  "category": "una categoria",
  "tags": ["2 a 6 etiquetas cortas"],
  "related": [
    { "noteId": "id de nota existente", "reason": "motivo breve" }
  ],
  "suggestedActions": [
    {
      "kind": "task | reminder | research | mcp",
      "title": "accion breve",
      "detail": "por que o como ejecutar",
      "toolHint": "herramienta MCP opcional",
      "confidence": 0.0
    }
  ]
}

Categorias permitidas: ${NOTE_CATEGORIES.join(', ')}.
No inventes IDs. Si no hay relacion clara, usa related: [].
No ejecutes herramientas ni asumas permisos. Las suggestedActions son solo intenciones locales para una futura capa MCP.

Nota nueva:
${note.content}

Contexto recuperado:
${context}`
}

function parseJson(text: string): AiPayload {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Qwen no devolvio JSON valido')
  }

  return JSON.parse(clean.slice(start, end + 1)) as AiPayload
}

function sanitizeAiPayload(payload: AiPayload, allNotes: NoteRecord[]): Omit<AnalysisResult, 'status' | 'error' | 'analysisRun'> {
  const existingIds = new Set(allNotes.map((note) => note.id))
  const relatedPayload = Array.isArray(payload.related) ? payload.related : payload.linkSuggestions
  const related = Array.isArray(relatedPayload)
    ? relatedPayload
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return undefined
          }

          const entry = item as { noteId?: unknown; id?: unknown; reason?: unknown }
          const noteId = typeof entry.noteId === 'string' ? entry.noteId : typeof entry.id === 'string' ? entry.id : ''
          const target = allNotes.find((note) => note.id === noteId)

          if (!noteId || !existingIds.has(noteId) || !target) {
            return undefined
          }

          return {
            noteId,
            title: target.title,
            score: 0.92,
            reason: typeof entry.reason === 'string' ? entry.reason.slice(0, 140) : 'Qwen detecto una relacion conceptual.'
          } satisfies RelatedNote
        })
        .filter((item): item is RelatedNote => Boolean(item))
    : []

  const category = typeof payload.category === 'string' ? normalizeCategory(payload.category) : 'Inbox'
  const tags = Array.isArray(payload.tags)
    ? payload.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean)
        .slice(0, 6)
    : []
  const suggestedActions = normalizeSuggestedActions(
    firstArray(payload.suggestedActions, payload.actions, payload.actionSuggestions)
  )

  return {
    title: typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim().slice(0, 90) : 'Nota sin titulo',
    summary: typeof payload.summary === 'string' ? payload.summary.trim().slice(0, 320) : '',
    category,
    tags,
    related,
    suggestedActions
  }
}

function normalizeCategory(value: string): string {
  const normalized = value.trim().toLowerCase()
  return NOTE_CATEGORIES.find((category) => category.toLowerCase() === normalized) ?? 'Inbox'
}

function fallbackAnalysis(note: NoteRecord, related: RelatedNote[]): Omit<AnalysisResult, 'status' | 'error' | 'analysisRun'> {
  const words = note.content
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  const title = note.content.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 80) || 'Nota sin titulo'
  const summary = words.slice(0, 34).join(' ') + (words.length > 34 ? '...' : '')
  const text = note.content.toLowerCase()
  const category = guessCategory(text)
  const tags = Array.from(
    new Set(
      text
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 4)
        .slice(0, 12)
    )
  ).slice(0, 5)

  return {
    title,
    summary,
    category,
    tags,
    related,
    suggestedActions: inferSuggestedActions(note.content)
  }
}

function guessCategory(text: string): string {
  if (/(reunion|cliente|trabajo|deadline|entrega|equipo)/.test(text)) {
    return 'Trabajo'
  }
  if (/(proyecto|feature|roadmap|app|producto|lanzamiento)/.test(text)) {
    return 'Proyecto'
  }
  if (/(idea|concepto|posible|explorar|propuesta)/.test(text)) {
    return 'Ideas'
  }
  if (/(curso|libro|aprender|estudiar|investigar)/.test(text)) {
    return 'Aprendizaje'
  }
  if (/(salud|medico|ejercicio|dormir|cita)/.test(text)) {
    return 'Salud'
  }
  if (/(pago|factura|presupuesto|gasto|dinero)/.test(text)) {
    return 'Finanzas'
  }

  return 'Inbox'
}

function mergeRelated(primary: RelatedNote[], fallback: RelatedNote[]): RelatedNote[] {
  const map = new Map<string, RelatedNote>()

  for (const item of [...primary, ...fallback]) {
    if (!map.has(item.noteId)) {
      map.set(item.noteId, item)
    }
  }

  return [...map.values()].slice(0, 6)
}

function firstArray(...values: unknown[]): unknown {
  return values.find((value) => Array.isArray(value))
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

      const source = item as {
        kind?: unknown
        title?: unknown
        detail?: unknown
        toolHint?: unknown
        confidence?: unknown
      }
      const kind = normalizeSuggestedActionKind(source.kind)
      const title = typeof source.title === 'string' ? source.title.trim().slice(0, 90) : ''
      const detail = typeof source.detail === 'string' ? source.detail.trim().slice(0, 180) : ''

      if (!kind || !title) {
        return undefined
      }

      const action: SuggestedAction = {
        kind,
        title,
        detail: detail || 'Accion sugerida por Neuronotes.',
        confidence: Math.max(0, Math.min(1, Number.isFinite(source.confidence) ? Number(source.confidence) : 0.62))
      }
      const toolHint = typeof source.toolHint === 'string' && source.toolHint.trim() ? source.toolHint.trim().slice(0, 80) : ''

      if (toolHint) {
        action.toolHint = toolHint
      }

      return action
    })
    .filter((item): item is SuggestedAction => Boolean(item))
    .slice(0, 4)
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

function inferSuggestedActions(content: string): SuggestedAction[] {
  const text = content.toLowerCase()
  const actions: SuggestedAction[] = []

  if (/(pendiente|tarea|hacer|preparar|crear|revisar|enviar|llamar)/.test(text)) {
    actions.push({
      kind: 'task',
      title: 'Crear tarea desde la nota',
      detail: 'La nota contiene lenguaje accionable que puede convertirse en una tarea local o MCP.',
      toolHint: 'task.create',
      confidence: 0.7
    })
  }

  if (/(recordar|mañana|manana|cita|reunion|fecha|deadline|vencimiento)/.test(text)) {
    actions.push({
      kind: 'reminder',
      title: 'Preparar recordatorio',
      detail: 'La nota menciona tiempo, reunion o vencimiento; puede mapearse a una herramienta de recordatorios.',
      toolHint: 'reminder.create',
      confidence: 0.66
    })
  }

  if (/(investigar|buscar|leer|comparar|referencia|documento|paper|fuente)/.test(text)) {
    actions.push({
      kind: 'research',
      title: 'Buscar contexto adicional',
      detail: 'La nota parece necesitar investigacion o documentos relacionados.',
      toolHint: 'documents.search',
      confidence: 0.64
    })
  }

  return actions.slice(0, 3)
}

function createAnalysisRun(
  provider: AnalysisProvider,
  settings: AppSettings,
  startedAt: number,
  ragContext: RagContextItem[]
): AnalysisRun {
  return {
    provider,
    model: settings.model,
    analyzedAt: new Date().toISOString(),
    durationMs: Math.max(0, Date.now() - startedAt),
    ragNoteIds: ragContext.map((item) => item.noteId),
    ragContext
  }
}

async function waitForOllama(settings: AppSettings): Promise<AiHealth> {
  let lastHealth = await checkOllama(settings)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (lastHealth.ollamaAvailable) {
      return lastHealth
    }

    await sleep(attempt === 0 ? 500 : 1000)
    lastHealth = await checkOllama(settings)
  }

  return lastHealth
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

async function findOllamaExecutable(): Promise<string | undefined> {
  const candidates = unique([
    ...pathCandidates('ollama'),
    ...windowsOllamaCandidates()
  ])

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate
    }
  }

  return undefined
}

function pathCandidates(command: string): string[] {
  const entries = (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
  const names = process.platform === 'win32' ? [`${command}.exe`, command] : [command]

  return entries.flatMap((entry) => names.map((name) => path.join(entry, name)))
}

function windowsOllamaCandidates(): string[] {
  if (process.platform !== 'win32') {
    return []
  }

  return [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Ollama', 'ollama.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Ollama', 'ollama.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Ollama', 'ollama.exe')
  ].filter((candidate): candidate is string => Boolean(candidate))
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export function resolveOllamaHostEnv(ollamaUrl: string): Record<string, string> {
  try {
    const url = new URL(ollamaUrl)
    const port = url.port || (url.protocol === 'https:' ? '443' : '11434')
    return {
      OLLAMA_HOST: `${url.hostname}:${port}`
    }
  } catch {
    return {}
  }
}
