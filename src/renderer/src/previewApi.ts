import { NeuronotesApi } from '../../preload'
import { buildQwenWindowsSetupCommand } from '../../shared/qwenSetup'
import { isFineTuneReviewable } from './fineTuneReadiness'
import { linkProvenance } from './linkProvenance'
import {
  ActionItem,
  ActionItemStatus,
  AiDiagnosticsResult,
  AiHealth,
  AiRuntimePrepareResult,
  AppSettings,
  NoteRecord,
  RagContextItem,
  RagPreviewResult
} from './types'

type Api = NeuronotesApi
type McpHandoffPreview = Awaited<ReturnType<Api['previewMcpHandoff']>>
type McpHandoffPreviewAction = McpHandoffPreview['actions'][number]

const createPreviewSettings = (): AppSettings => ({
  model: 'qwen3.5:0.8b',
  ollamaUrl: 'http://127.0.0.1:11434',
  autoAnalyze: true,
  ragMaxNotes: 5,
  ragExcerptLength: 550
})

let settings: AppSettings = createPreviewSettings()

let aiDiagnostics: AiDiagnosticsResult | null = null

const MANUAL_LINK_REASON = 'Enlace manual.'
const MANUAL_RECIPROCAL_REASON = 'Enlace reciproco: Enlace manual.'
const RECIPROCAL_REASON_PREFIX = 'Enlace reciproco:'
const PREVIEW_DRAFT_CATEGORY_SIGNALS: Array<{ category: string; pattern: RegExp }> = [
  { category: 'Finanzas', pattern: /\b(finanzas?|finance|facturas?|pagos?|presupuesto|gastos?|dinero)\b/ },
  { category: 'Salud', pattern: /\b(salud|health|medic[ao]|doctor|consulta|cita|ejercicio|bienestar|wellness)\b/ },
  { category: 'Trabajo', pattern: /\b(trabajo|work|job|laboral|oficina|cliente|customer|equipo|reunion|deadline)\b/ },
  { category: 'Proyecto', pattern: /\b(proyecto|project|producto|product|roadmap|feature|qwen|rag|mcp|ollama|lanzamiento)\b/ },
  { category: 'Ideas', pattern: /\b(idea|ideas|brainstorming|propuesta|concepto|explorar|interfaz|minimalismo|ui)\b/ },
  { category: 'Aprendizaje', pattern: /\b(aprendizaje|learning|study|estudio|curso|libro|aprender|investigar|paper|fuente)\b/ },
  { category: 'Personal', pattern: /\b(personal|vida|hogar|home|familia)\b/ }
]

const createPreviewNotes = (): NoteRecord[] => [
  {
    id: 'preview-roadmap',
    title: 'Roadmap Neuronotes',
    content:
      'Definir una experiencia de notas rapidas con resumen automatico, categorias limpias y enlaces entre ideas relacionadas.',
    summary: 'Primera ruta de producto para convertir notas rapidas en una base conectada.',
    category: 'Proyecto',
    tags: ['roadmap', 'producto', 'notas'],
    related: [
      {
        noteId: 'preview-ui',
        title: 'Interfaz minimalista',
        score: 0.82,
        reason: 'Ambas notas tratan la experiencia principal de Neuronotes.'
      }
    ],
    suggestedActions: [
      {
        kind: 'task',
        title: 'Definir plan MCP',
        detail: 'Convertir el roadmap en una lista de tareas para la integracion MCP.',
        toolHint: 'task.create',
        confidence: 0.78
      }
    ],
    analysisStatus: 'qwen',
    analysisRun: {
      provider: 'qwen',
      model: settings.model,
      analyzedAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
      durationMs: 842,
      ragNoteIds: ['preview-ui'],
      ragContext: [
        {
          noteId: 'preview-ui',
          title: 'Interfaz minimalista',
          category: 'Ideas',
          tags: ['ui', 'minimalismo', 'escritura'],
          score: 0.82,
          reason: 'Ambas notas tratan la experiencia principal de Neuronotes.',
          excerpt: 'Mantener una superficie similar a Notion o OneNote: limpia, rapida y enfocada en escribir.'
        }
      ]
    },
    trainingReviewedAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 40).toISOString()
  },
  {
    id: 'preview-ui',
    title: 'Interfaz minimalista',
    content: 'Mantener una superficie similar a Notion o OneNote: limpia, rapida y enfocada en escribir.',
    summary: 'Direccion visual para una interfaz sobria y centrada en escritura.',
    category: 'Ideas',
    tags: ['ui', 'minimalismo', 'escritura'],
    related: [
      {
        noteId: 'preview-roadmap',
        title: 'Roadmap Neuronotes',
        score: 0.74,
        reason: 'Enlace reciproco: Ambas notas tratan la experiencia principal de Neuronotes.'
      }
    ],
    suggestedActions: [
      {
        kind: 'research',
        title: 'Revisar patrones de editor',
        detail: 'Buscar referencias de interacciones minimalistas para notas conectadas.',
        toolHint: 'documents.search',
        confidence: 0.62
      }
    ],
    analysisStatus: 'fallback',
    analysisError: 'Vista previa: Qwen no se ejecuta en el navegador.',
    analysisRun: {
      provider: 'local',
      model: settings.model,
      analyzedAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
      durationMs: 14,
      ragNoteIds: ['preview-roadmap'],
      ragContext: [
        {
          noteId: 'preview-roadmap',
          title: 'Roadmap Neuronotes',
          category: 'Proyecto',
          tags: ['roadmap', 'producto', 'notas'],
          score: 0.74,
          reason: 'El roadmap alimenta el contexto visual de la nota.',
          excerpt: 'Definir una experiencia de notas rapidas con resumen automatico, categorias limpias y enlaces entre ideas relacionadas.'
        }
      ]
    },
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 55).toISOString()
  }
]

const createPreviewActions = (): ActionItem[] => [
  {
    id: 'preview-action-roadmap',
    noteId: 'preview-roadmap',
    noteTitle: 'Roadmap Neuronotes',
    kind: 'task',
    title: 'Definir plan MCP',
    detail: 'Convertir el roadmap en una lista de tareas para la integracion MCP.',
    toolHint: 'task.create',
    mcpApprovedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    confidence: 0.78,
    status: 'open',
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
  }
]

let notes: NoteRecord[] = createPreviewNotes()
let actions: ActionItem[] = createPreviewActions()

const resetPreviewState = (): void => {
  settings = createPreviewSettings()
  aiDiagnostics = null
  notes = createPreviewNotes()
  actions = createPreviewActions()
}

const sortNotes = (): NoteRecord[] => [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
const sortActions = (): ActionItem[] =>
  [...actions].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'open' ? -1 : 1
    }

    return b.updatedAt.localeCompare(a.updatedAt)
  })
const formatActionCount = (count: number): string => (count === 1 ? '1 accion' : `${count} acciones`)
const formatExampleCount = (count: number): string => (count === 1 ? '1 ejemplo' : `${count} ejemplos`)
const qwenSetupCommand = (): string => buildQwenWindowsSetupCommand(settings)
const previewMcpConfig = () => {
  const serverPath = 'C:\\Program Files\\Neuronotes\\resources\\mcp\\neuronotes-mcp.mjs'
  const databasePath = 'C:\\Users\\you\\AppData\\Roaming\\Neuronotes\\neuronotes.json'
  const command = 'node'
  const args = [serverPath, '--db', databasePath]
  const writeArgs = [...args, '--write']

  return {
    schema: 'neuronotes.mcp-config.v1',
    serverName: 'neuronotes',
    writeServerName: 'neuronotes-write',
    command,
    args,
    writeArgs,
    databasePath,
    serverPath,
    hostConfigJson: `${JSON.stringify(
      {
        mcpServers: {
          neuronotes: {
            command,
            args
          }
        }
      },
      null,
      2
    )}\n`,
    writeHostConfigJson: `${JSON.stringify(
      {
        mcpServers: {
          'neuronotes-write': {
            command,
            args: writeArgs
          }
        }
      },
      null,
      2
    )}\n`
  }
}
const buildPreviewMcpHandoffPayload = (): McpHandoffPreview => {
  const notesById = new Map(notes.map((note) => [note.id, note]))
  const openActions = actions
    .filter((action) => action.status === 'open' && notesById.has(action.noteId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const payloadActions = openActions.map((action): McpHandoffPreviewAction => {
    const note = notesById.get(action.noteId)

    if (!note) {
      throw new Error('Accion sin nota fuente')
    }

    const relatedNotes = previewHandoffRelatedNotes(note)

    return {
      id: action.id,
      kind: action.kind,
      status: action.status,
      title: action.title,
      detail: action.detail,
      toolHint: action.toolHint ?? null,
      confidence: action.confidence,
      approval: {
        required: true,
        state: action.mcpApprovedAt ? 'approved' : 'needs-review',
        approvedAt: action.mcpApprovedAt ?? null
      },
      toolCallDraft: previewToolCallDraft(action, note, relatedNotes),
      createdAt: action.createdAt,
      updatedAt: action.updatedAt,
      sourceNote: {
        id: note.id,
        title: note.title,
        summary: note.summary,
        category: note.category,
        tags: note.tags,
        contentExcerpt: note.content.replace(/\s+/g, ' ').trim().slice(0, 1200),
        relatedNoteIds: note.related.map((related) => related.noteId),
        relatedNotes,
        analysis: note.analysisRun
          ? {
              provider: note.analysisRun.provider,
              model: note.analysisRun.model,
              analyzedAt: note.analysisRun.analyzedAt,
              ragNoteIds: note.analysisRun.ragNoteIds,
              ragContext: note.analysisRun.ragContext ?? []
            }
          : null
      }
    }
  })

  return {
    schema: 'neuronotes.mcp-handoff.v1',
    exportedAt: new Date().toISOString(),
    execution: {
      mode: 'manual-user-approved',
      requiresUserApproval: true,
      sideEffects: 'none-export-only'
    },
    model: settings.model,
    ollamaUrl: settings.ollamaUrl,
    actionCount: payloadActions.length,
    approvedActionCount: payloadActions.filter((action) => action.approval.state === 'approved').length,
    doneActionCount: actions.filter((action) => action.status === 'done').length,
    toolSummary: previewToolSummary(payloadActions),
    kindSummary: previewKindSummary(payloadActions),
    actions: payloadActions
  }
}
const previewToolCallDraft = (
  action: ActionItem,
  note: NoteRecord,
  relatedNotes: McpHandoffPreviewAction['sourceNote']['relatedNotes']
): McpHandoffPreviewAction['toolCallDraft'] => {
  const status = action.toolHint ? 'ready-for-review' : 'needs-tool-selection'
  const ragContext = note.analysisRun?.ragContext ?? []

  return {
    status,
    toolName: action.toolHint ?? null,
    arguments: previewToolArguments(action, note, relatedNotes, ragContext, status)
  }
}
const previewToolArguments = (
  action: ActionItem,
  note: NoteRecord,
  relatedNotes: McpHandoffPreviewAction['sourceNote']['relatedNotes'],
  ragContext: RagContextItem[],
  draftStatus: McpHandoffPreviewAction['toolCallDraft']['status']
): McpHandoffPreviewAction['toolCallDraft']['arguments'] => {
  const base: McpHandoffPreviewAction['toolCallDraft']['arguments'] = {
    kind: action.kind,
    title: action.title,
    detail: action.detail,
    confidence: action.confidence,
    sourceNoteId: note.id,
    sourceNoteTitle: note.title,
    sourceNoteSummary: note.summary,
    sourceNoteCategory: note.category,
    sourceNoteTags: note.tags,
    relatedNoteIds: note.related.map((related) => related.noteId),
    relatedNotes,
    ragContext: ragContext ?? [],
    requiresUserReview: true,
    draftCompleteness: draftStatus === 'ready-for-review' ? 'ready' : 'needs-tool-selection'
  }

  if (action.toolHint === 'task.create') {
    return {
      ...base,
      taskTitle: action.title,
      taskDetail: action.detail
    }
  }

  if (action.toolHint === 'calendar.create_event') {
    return {
      ...base,
      eventTitle: action.title,
      eventNotes: action.detail,
      timeText: previewExtractTimeText(`${action.title} ${action.detail} ${note.content}`)
    }
  }

  if (action.toolHint === 'reminder.create') {
    return {
      ...base,
      taskTitle: action.title,
      taskDetail: action.detail,
      timeText: previewExtractTimeText(`${action.title} ${action.detail} ${note.content}`)
    }
  }

  if (action.toolHint === 'email.compose') {
    return {
      ...base,
      subject: action.title,
      body: action.detail,
      recipientHint: previewExtractRecipientHint(`${note.content} ${action.title} ${action.detail}`)
    }
  }

  if (action.toolHint === 'message.send') {
    return {
      ...base,
      message: action.detail,
      recipientHint: previewExtractRecipientHint(`${note.content} ${action.title} ${action.detail}`)
    }
  }

  if (action.toolHint === 'phone.call') {
    return {
      ...base,
      callTitle: action.title,
      agenda: action.detail,
      recipientHint: previewExtractRecipientHint(`${note.content} ${action.title} ${action.detail}`)
    }
  }

  if (action.toolHint === 'documents.search') {
    return {
      ...base,
      query: [action.title, action.detail, note.title, note.tags.join(' ')].filter(Boolean).join(' ')
    }
  }

  if (action.toolHint === 'mcp.workflow.prepare') {
    return {
      ...base,
      workflowGoal: action.detail || action.title,
      safetyNote: 'Borrador local: requiere aprobacion del usuario antes de ejecutar cualquier herramienta externa.'
    }
  }

  return base
}
const previewHandoffRelatedNotes = (note: NoteRecord): McpHandoffPreviewAction['sourceNote']['relatedNotes'] =>
  note.related.map((related) => ({
    noteId: related.noteId,
    title: related.title,
    score: related.score,
    reason: related.reason,
    provenance: linkProvenance(related.reason)
  }))
const previewToolSummary = (payloadActions: McpHandoffPreviewAction[]): McpHandoffPreview['toolSummary'] => {
  const summary = new Map<string, { actionCount: number; kinds: Set<string>; sourceNoteIds: Set<string> }>()

  for (const action of payloadActions) {
    const toolHint = action.toolHint ?? 'unassigned'
    const current = summary.get(toolHint) ?? {
      actionCount: 0,
      kinds: new Set<string>(),
      sourceNoteIds: new Set<string>()
    }

    current.actionCount += 1
    current.kinds.add(action.kind)
    current.sourceNoteIds.add(action.sourceNote.id)
    summary.set(toolHint, current)
  }

  return [...summary.entries()]
    .map(([toolHint, entry]) => ({
      toolHint,
      actionCount: entry.actionCount,
      kinds: [...entry.kinds].sort((left, right) => left.localeCompare(right)),
      sourceNoteIds: [...entry.sourceNoteIds].sort((left, right) => left.localeCompare(right))
    }))
    .sort((left, right) => right.actionCount - left.actionCount || left.toolHint.localeCompare(right.toolHint))
}
const previewKindSummary = (payloadActions: McpHandoffPreviewAction[]): McpHandoffPreview['kindSummary'] => {
  const summary = new Map<string, number>()

  for (const action of payloadActions) {
    summary.set(action.kind, (summary.get(action.kind) ?? 0) + 1)
  }

  return [...summary.entries()]
    .map(([kind, actionCount]) => ({ kind, actionCount }))
    .sort((left, right) => right.actionCount - left.actionCount || left.kind.localeCompare(right.kind))
}
const previewExtractTimeText = (value: string): string => {
  const text = value.replace(/\s+/g, ' ').trim()
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const match = normalized.match(
    /\b(hoy|manana|pasado manana|esta semana|proxima semana|deadline|vencimiento|fecha|cita|reunion|meeting|agenda|agendar)\b(?:[^.!\n]{0,80})?/i
  )

  return match?.[0]?.trim() ?? ''
}
const previewExtractRecipientHint = (value: string): string => {
  const text = value.replace(/\s+/g, ' ').trim()
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const match = normalized.match(/\b(?:a|para|con|al|a la|a el)\s+([A-Za-z0-9][^.,;:\n]{1,60})/i)

  return match?.[1]?.trim() ?? ''
}
const isPreviewPending = (note: NoteRecord, mode: 'qwen' | 'local'): boolean => {
  if (note.content.trim().length === 0) {
    return false
  }

  if (mode === 'local') {
    return note.analysisStatus === 'idle' || note.analysisStatus === 'error'
  }

  return note.analysisStatus !== 'qwen'
}
const fineTuneExampleCount = (): number =>
  notes.filter((note) => Boolean(note.trainingReviewedAt) && isFineTuneReviewable(note)).length
const clampNumber = (value: unknown, min: number, max: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(Number(value)))) : min
const isManualRelatedLink = (related: NoteRecord['related'][number]): boolean =>
  related.reason === MANUAL_LINK_REASON || related.reason === MANUAL_RECIPROCAL_REASON
const isReciprocalPreviewLink = (related: NoteRecord['related'][number]): boolean =>
  related.reason.startsWith(RECIPROCAL_REASON_PREFIX)
const isInitialPreviewLink = (related: NoteRecord['related'][number]): boolean =>
  related.reason.startsWith('Relacion local inicial') || related.reason.startsWith('Enlace reciproco: Relacion local inicial')
const isPreservedPreviewLink = (related: NoteRecord['related'][number]): boolean =>
  isManualRelatedLink(related) || isInitialPreviewLink(related)
const normalizePreviewText = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
const previewInlineTags = (content: string): string[] =>
  Array.from(
    new Set(
      [...content.matchAll(/(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]{1,39})/gu)]
        .map((match) => normalizePreviewText(match[2]))
        .filter(Boolean)
    )
  ).slice(0, 10)
const previewDraftCategory = (content: string, tags: string[]): string => {
  const normalizedText = normalizePreviewText(`${content} ${tags.join(' ')}`)
  const signal = PREVIEW_DRAFT_CATEGORY_SIGNALS.find((item) => item.pattern.test(normalizedText))

  return signal?.category ?? 'Inbox'
}
const cleanPreviewDraftText = (value: string): string =>
  value
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+(?:\[[ xX]\]\s+)?/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/(^|\s)(?:y|and|o|or)\s+#[\p{L}\p{N}][\p{L}\p{N}_-]{1,39}/gu, '$1')
    .replace(/(^|\s)#[\p{L}\p{N}][\p{L}\p{N}_-]{1,39}/gu, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\b(con|para|sobre|de|del|en)\s+(?:y|and|o|or)\s+/g, '$1 ')
    .replace(/\s+(?:y|and|o|or)\s*$/g, '')
    .replace(/^[,;:|/\\-]+|[,;:|/\\-]+$/g, '')
    .trim()
const previewDraftSummary = (content: string): string => {
  const text = content
    .split(/\r?\n/)
    .map(cleanPreviewDraftText)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = text.split(/\s+/).filter(Boolean)

  return words.slice(0, 34).join(' ').slice(0, 220)
}
const previewDraftTitle = (content: string, summary: string): string => {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim())
  const title = firstLine ? cleanPreviewDraftText(firstLine).slice(0, 80) : ''

  return title || summary.slice(0, 80) || 'Nota sin titulo'
}
const seedPreviewDraftMetadataAfterContentEdit = (note: NoteRecord): void => {
  const inlineTags = previewInlineTags(note.content)

  note.summary = previewDraftSummary(note.content)
  note.tags = Array.from(new Set([...note.tags, ...inlineTags].map(normalizePreviewText).filter(Boolean)))
  if (!note.category || note.category === 'Inbox') {
    note.category = previewDraftCategory(note.content, note.tags)
  }
  note.suggestedActions = previewSuggestedActions(note.content)
}
const previewSuggestedActions = (content: string): NoteRecord['suggestedActions'] => {
  const text = normalizePreviewText(content)
  const actions: NoteRecord['suggestedActions'] = []
  const hasEmail = /\b(email|e-mail|correo|mail)\b/.test(text) || /enviar.+\b(correo|mail)\b/.test(text)
  const hasMessage = /\b(whatsapp|mensaje|slack|teams|telegram|dm)\b/.test(text)
  const hasCall = /\b(llamar|llamada|call|telefono|phone)\b/.test(text)
  const hasCalendar = /\b(reunion|meeting|cita|evento|calendario|calendar|agenda|agendar)\b/.test(text)

  if (hasEmail) {
    actions.push({
      kind: 'task',
      title: 'Preparar correo',
      detail: 'La nota pide redactar o enviar un correo; puede revisarse para un handoff MCP de email.',
      toolHint: 'email.compose',
      confidence: 0.72
    })
  } else if (hasMessage) {
    actions.push({
      kind: 'task',
      title: 'Preparar mensaje',
      detail: 'La nota pide enviar un mensaje; puede revisarse para una herramienta de mensajeria.',
      toolHint: 'message.send',
      confidence: 0.7
    })
  } else if (hasCall) {
    actions.push({
      kind: 'task',
      title: 'Preparar llamada',
      detail: 'La nota pide llamar a alguien; puede revisarse para una accion de llamada o seguimiento.',
      toolHint: 'phone.call',
      confidence: 0.68
    })
  } else if (/(pendiente|tarea|task|todo|hacer|preparar|crear|revisar|enviar|follow up)/.test(text)) {
    actions.push({
      kind: 'task',
      title: 'Crear tarea desde la nota',
      detail: 'La nota contiene lenguaje accionable que puede convertirse en una tarea local o MCP.',
      toolHint: 'task.create',
      confidence: 0.7
    })
  }

  if (hasCalendar) {
    actions.push({
      kind: 'reminder',
      title: 'Crear evento de calendario',
      detail: 'La nota menciona reunion, cita o evento; puede revisarse para crear un evento de calendario.',
      toolHint: 'calendar.create_event',
      confidence: 0.72
    })
  } else if (/(recordar|recordatorio|reminder|alerta|manana|fecha|deadline|vencimiento)/.test(text)) {
    actions.push({
      kind: 'reminder',
      title: 'Preparar recordatorio',
      detail: 'La nota menciona tiempo, reunion o vencimiento; puede mapearse a una herramienta de recordatorios.',
      toolHint: 'reminder.create',
      confidence: 0.66
    })
  }

  if (/(investigar|buscar|leer|comparar|referencia|documento|paper|fuente|research|source)/.test(text)) {
    actions.push({
      kind: 'research',
      title: 'Buscar contexto adicional',
      detail: 'La nota parece necesitar investigacion o documentos relacionados.',
      toolHint: 'documents.search',
      confidence: 0.64
    })
  }

  if (/\b(mcp|workflow|automatizacion|automatizar|handoff|herramientas?|tools?)\b/.test(text)) {
    actions.push({
      kind: 'mcp',
      title: 'Preparar handoff MCP',
      detail: 'La nota menciona automatizacion o herramientas; puede revisarse para un handoff MCP aprobado por el usuario.',
      toolHint: 'mcp.workflow.prepare',
      confidence: 0.62
    })
  }

  return actions.slice(0, 4)
}
const PREVIEW_LINK_STOPWORDS = new Set(['para', 'sobre', 'notas', 'nota', 'local', 'desde', 'entre', 'con'])
const PREVIEW_EXPLICIT_LINK_SCORE = 0.97
const PREVIEW_EXPLICIT_LINK_REASON = 'Referencia explicita en la nota.'
const previewLinkTokens = (value: string): Set<string> =>
  new Set(
    normalizePreviewText(value)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3 && !PREVIEW_LINK_STOPWORDS.has(token))
  )
const previewInitialRelatedLinks = (note: NoteRecord, options: { explicitOnly?: boolean } = {}): NoteRecord['related'] => {
  const sourceTokens = previewLinkTokens(`${note.title} ${note.summary} ${note.content} ${note.tags.join(' ')} ${note.category}`)
  const sourceTags = new Set(note.tags)
  const explicitTargets = previewExplicitLinkTargets(note.content)

  return notes
    .filter((candidate) => candidate.id !== note.id)
    .map((candidate) => {
      const candidateTokens = previewLinkTokens(
        `${candidate.title} ${candidate.summary} ${candidate.content} ${candidate.tags.join(' ')} ${candidate.category}`
      )
      const tokenOverlap = [...sourceTokens].filter((token) => candidateTokens.has(token)).length
      const tagOverlap = candidate.tags.filter((tag) => sourceTags.has(normalizePreviewText(tag))).length
      const categoryBoost = note.category !== 'Inbox' && note.category === candidate.category ? 0.08 : 0
      const explicitReference = previewMatchesExplicitTarget(candidate, explicitTargets)
      const rankedScore = Math.min(1, tokenOverlap * 0.06 + tagOverlap * 0.22 + categoryBoost)
      const score = explicitReference ? Math.max(PREVIEW_EXPLICIT_LINK_SCORE, rankedScore) : rankedScore

      return {
        noteId: candidate.id,
        title: candidate.title,
        score,
        reason:
          explicitReference
            ? PREVIEW_EXPLICIT_LINK_REASON
            : tagOverlap > 0
            ? 'Relacion local inicial por etiquetas y contenido.'
            : 'Relacion local inicial por contenido cercano.'
      }
    })
    .filter((related) => related.score >= 0.12 && (!options.explicitOnly || related.reason === PREVIEW_EXPLICIT_LINK_REASON))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
}
const seedPreviewInitialRelatedLinks = (note: NoteRecord, options: { explicitOnly?: boolean } = {}): void => {
  const byId = new Map<string, NoteRecord['related'][number]>()

  for (const related of note.related.filter(isManualRelatedLink)) {
    byId.set(related.noteId, related)
  }

  for (const related of previewInitialRelatedLinks(note, options)) {
    const existing = byId.get(related.noteId)

    if (existing) {
      byId.set(related.noteId, {
        ...existing,
        title: related.title || existing.title,
        score: Math.max(existing.score, related.score)
      })
      continue
    }

    byId.set(related.noteId, related)
  }

  note.related = [...byId.values()].slice(0, 3)
}
const previewExplicitLinkTargets = (content: string): Set<string> => {
  const targets = new Set<string>()

  for (const match of content.matchAll(/\[\[([^\]\r\n]{1,120})\]\]/g)) {
    const label = normalizePreviewExplicitTarget(match[1].split('|')[0] ?? '')

    if (label) {
      targets.add(label)
    }
  }

  for (const match of content.matchAll(/(?:^|[\s([])@([\p{L}\p{N}][\p{L}\p{N}_-]{1,80})/gu)) {
    const label = normalizePreviewExplicitTarget(match[1])

    if (label) {
      targets.add(label)
    }
  }

  return targets
}
const previewMatchesExplicitTarget = (candidate: NoteRecord, targets: Set<string>): boolean => {
  if (targets.size === 0) {
    return false
  }

  return [candidate.title, candidate.id].some((value) => targets.has(normalizePreviewExplicitTarget(value)))
}
const normalizePreviewExplicitTarget = (value: string): string =>
  normalizePreviewText(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
const syncPreviewInitialBacklinks = (source: NoteRecord): void => {
  for (const related of source.related) {
    const target = notes.find((note) => note.id === related.noteId)

    if (!target) {
      continue
    }

    target.related = [
      ...target.related.filter((link) => link.noteId !== source.id),
      {
        noteId: source.id,
        title: source.title,
        score: Math.max(0.08, Math.min(1, related.score * 0.9)),
        reason: `Enlace reciproco: ${related.reason}`
      }
    ].slice(0, 10)
    target.updatedAt = source.updatedAt
    target.trainingReviewedAt = undefined
  }
}
const previewAnalysisTags = (note: NoteRecord): string[] => {
  const inlineTags = previewInlineTags(note.content)
  const contentTags = note.content.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []

  return Array.from(
    new Set(
      [...note.tags, ...inlineTags, ...contentTags]
        .map(normalizePreviewText)
        .filter(Boolean)
    )
  ).slice(0, 6)
}
const preservePreviewManualLinksAfterAnalysis = (
  note: NoteRecord,
  analysisLinks: NoteRecord['related']
): NoteRecord['related'] => {
  const linksById = new Map<string, NoteRecord['related'][number]>()

  for (const link of note.related.filter(isPreservedPreviewLink)) {
    linksById.set(link.noteId, link)
  }

  for (const link of analysisLinks) {
    const existing = linksById.get(link.noteId)
    if (existing && isManualRelatedLink(existing)) {
      linksById.set(link.noteId, {
        ...existing,
        title: link.title || existing.title,
        score: Math.max(existing.score, link.score)
      })
      continue
    }

    linksById.set(link.noteId, link)
  }

  return [...linksById.values()].slice(0, 10)
}
const resetPreviewAnalysisAfterContentEdit = (note: NoteRecord): void => {
  note.summary = ''
  note.related = note.related.filter(isManualRelatedLink)
  note.suggestedActions = []
  note.analysisStatus = 'idle'
  note.analysisError = undefined
  note.analysisRun = undefined
  note.trainingReviewedAt = undefined
}
const syncPreviewRelatedGraph = (source: NoteRecord, now = new Date().toISOString()): void => {
  const sourceBefore = previewRelatedSignature(source.related)
  source.related = normalizePreviewRelatedLinks(source)
  if (sourceBefore !== previewRelatedSignature(source.related)) {
    source.updatedAt = now
    source.trainingReviewedAt = undefined
  }
  const sourceDirectLinks = source.related.filter((related) => !isReciprocalPreviewLink(related))
  const sourceTargets = new Set(sourceDirectLinks.map((related) => related.noteId))

  for (const note of notes) {
    if (note.id === source.id) {
      continue
    }

    const before = previewRelatedSignature(note.related)
    const sourceLink = sourceDirectLinks.find((related) => related.noteId === note.id)
    const existingIndex = note.related.findIndex((related) => related.noteId === source.id)

    if (sourceLink) {
      const reciprocal = {
        noteId: source.id,
        title: source.title,
        score: Math.max(0.08, Math.min(1, sourceLink.score * 0.9)),
        reason: `${RECIPROCAL_REASON_PREFIX} ${sourceLink.reason}`
      }

      if (existingIndex === -1) {
        note.related = [...note.related, reciprocal]
      } else if (isReciprocalPreviewLink(note.related[existingIndex])) {
        note.related[existingIndex] = reciprocal
      } else {
        note.related[existingIndex] = {
          ...note.related[existingIndex],
          title: source.title,
          score: Math.max(note.related[existingIndex].score, reciprocal.score)
        }
      }
    } else if (existingIndex !== -1 && isReciprocalPreviewLink(note.related[existingIndex]) && !sourceTargets.has(note.id)) {
      note.related = note.related.filter((related) => related.noteId !== source.id)
    }

    note.related = normalizePreviewRelatedLinks(note)
    if (before !== previewRelatedSignature(note.related)) {
      note.updatedAt = now
      note.trainingReviewedAt = undefined
    }
  }
}
const normalizePreviewRelatedLinks = (note: NoteRecord): NoteRecord['related'] => {
  const byId = new Map<string, NoteRecord['related'][number]>()

  for (const related of note.related) {
    const target = notes.find((candidate) => candidate.id === related.noteId)

    if (!target || target.id === note.id) {
      continue
    }

    const normalized = {
      noteId: target.id,
      title: target.title,
      score: Math.max(0, Math.min(1, Number.isFinite(related.score) ? related.score : 0)),
      reason: related.reason.trim() || 'Relacion detectada por Neuronotes.'
    }
    const existing = byId.get(target.id)

    if (!existing || normalized.score > existing.score) {
      byId.set(target.id, normalized)
    }
  }

  return [...byId.values()].sort((left, right) => right.score - left.score).slice(0, 10)
}
const previewRelatedSignature = (related: NoteRecord['related']): string =>
  JSON.stringify(
    related.map((link) => ({
      noteId: link.noteId,
      title: link.title,
      score: link.score,
      reason: link.reason
    }))
  )
const removePreviewDeletedNoteReferences = (deletedNoteId: string): void => {
  const now = new Date().toISOString()

  for (const note of notes) {
    const nextRelated = note.related.filter((related) => related.noteId !== deletedNoteId)

    if (nextRelated.length === note.related.length) {
      continue
    }

    note.related = nextRelated
    note.updatedAt = now
    note.trainingReviewedAt = undefined
  }
}
const previewRagContext = (id: string): RagPreviewResult => {
  const note = notes.find((item) => item.id === id)

  if (!note) {
    throw new Error('Nota no encontrada')
  }

  const byId = new Map<string, NoteRecord['related'][number]>()

  for (const related of note.related) {
    const target = notes.find((candidate) => candidate.id === related.noteId && candidate.id !== note.id)

    if (target) {
      byId.set(target.id, {
        noteId: target.id,
        title: target.title,
        score: related.score,
        reason: related.reason
      })
    }
  }

  for (const related of previewInitialRelatedLinks(note)) {
    const existing = byId.get(related.noteId)

    byId.set(related.noteId, existing ? { ...existing, score: Math.max(existing.score, related.score) } : related)
  }

  const related = [...byId.values()].slice(0, settings.ragMaxNotes)
  const items = related
    .map((item) => {
      const candidate = notes.find((noteItem) => noteItem.id === item.noteId)

      if (!candidate) {
        return undefined
      }

      return {
        noteId: item.noteId,
        title: item.title,
        category: candidate.category,
        tags: candidate.tags,
        score: item.score,
        reason: item.reason,
        excerpt: candidate.content.replace(/\s+/g, ' ').trim().slice(0, settings.ragExcerptLength)
      }
    })
    .filter((item): item is RagPreviewResult['items'][number] => Boolean(item))
  const text =
    items.length === 0
      ? 'No hay notas relacionadas todavia.'
      : items
          .map((item) => {
            return `ID: ${item.noteId}\nTitulo: ${item.title}\nCategoria: ${item.category}\nEtiquetas: ${item.tags.join(', ')}\nPuntuacion: ${Math.round(item.score * 100)}%\nMotivo: ${item.reason}\nExtracto: ${item.excerpt}`
          })
          .join('\n\n')

  return {
    schema: 'neuronotes.rag-preview.v1',
    noteId: note.id,
    model: settings.model,
    ragMaxNotes: settings.ragMaxNotes,
    ragExcerptLength: settings.ragExcerptLength,
    noteIds: items.map((item) => item.noteId),
    related,
    items,
    text
  }
}

const previewHealth = (): AiHealth => ({
  ok: false,
  status: 'ollama-not-installed',
  message: 'Ollama no esta instalado',
  model: settings.model,
  ollamaUrl: settings.ollamaUrl,
  ollamaAvailable: false,
  modelInstalled: false,
  installedModels: [],
  installedQwenModels: []
})

const previewPrepareRuntime = (): AiRuntimePrepareResult => ({
  ok: false,
  stage: 'ollama-not-installed',
  started: false,
  pulled: false,
  message: 'Ollama no esta instalado. Instala Ollama y vuelve a preparar Qwen.',
  health: previewHealth()
})

const makeId = (): string => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `preview-${Date.now()}`
}

export function createPreviewApi(): Api {
  resetPreviewState()

  return {
    listNotes: async () => sortNotes(),
    createNote: async (content: string) => {
      const now = new Date().toISOString()
      const trimmedContent = content.trim()
      const tags = previewInlineTags(trimmedContent)
      const summary = previewDraftSummary(trimmedContent)
      const note: NoteRecord = {
        id: makeId(),
        title: previewDraftTitle(trimmedContent, summary),
        content: trimmedContent,
        summary,
        category: previewDraftCategory(trimmedContent, tags),
        tags,
        related: [],
        suggestedActions: previewSuggestedActions(trimmedContent),
        analysisStatus: 'idle',
        createdAt: now,
        updatedAt: now
      }
      seedPreviewInitialRelatedLinks(note)
      syncPreviewInitialBacklinks(note)

      notes = [note, ...notes]
      return note
    },
    createNoteFromClipboard: async () => {
      const content = (await navigator.clipboard?.readText())?.trim() ?? ''

      if (!content) {
        throw new Error('El portapapeles no contiene texto')
      }

      const now = new Date().toISOString()
      const tags = previewInlineTags(content)
      const summary = previewDraftSummary(content)
      const note: NoteRecord = {
        id: makeId(),
        title: previewDraftTitle(content, summary),
        content,
        summary,
        category: previewDraftCategory(content, tags),
        tags,
        related: [],
        suggestedActions: previewSuggestedActions(content),
        analysisStatus: 'idle',
        createdAt: now,
        updatedAt: now
      }
      seedPreviewInitialRelatedLinks(note)
      syncPreviewInitialBacklinks(note)

      notes = [note, ...notes]
      return note
    },
    updateNote: async (id, updates) => {
      const note = notes.find((item) => item.id === id)
      const now = new Date().toISOString()
      let needsGraphSync = false
      let contentChanged = false

      if (!note) {
        throw new Error('Nota no encontrada')
      }

      if (typeof updates.content === 'string') {
        contentChanged = updates.content !== note.content
        note.content = updates.content
        if (contentChanged) {
          resetPreviewAnalysisAfterContentEdit(note)
          seedPreviewDraftMetadataAfterContentEdit(note)
          needsGraphSync = true
        }
      }

      if (typeof updates.title === 'string' && updates.title.trim()) {
        const nextTitle = updates.title.trim()
        needsGraphSync = needsGraphSync || nextTitle !== note.title
        note.title = nextTitle
        note.trainingReviewedAt = undefined
        for (const action of actions) {
          if (action.noteId === note.id) {
            action.noteTitle = note.title
            action.updatedAt = now
          }
        }
      }

      if (updates.category) {
        note.category = updates.category
        note.trainingReviewedAt = undefined
      }

      if (updates.tags) {
        note.tags = Array.from(
          new Set(
            updates.tags
              .map((tag) => tag.trim().toLowerCase().replace(/^#/, ''))
              .filter(Boolean)
            )
        )
        note.trainingReviewedAt = undefined
      }

      note.updatedAt = now
      if (contentChanged) {
        seedPreviewInitialRelatedLinks(note, { explicitOnly: true })
      }
      if (needsGraphSync) {
        syncPreviewRelatedGraph(note, now)
      }
      return note
    },
    setTrainingReview: async (id, reviewed) => {
      const note = notes.find((item) => item.id === id)

      if (!note) {
        throw new Error('Nota no encontrada')
      }

      if (reviewed) {
        if (!isFineTuneReviewable(note)) {
          throw new Error('Analiza la nota antes de aprobarla para fine-tuning')
        }

        note.trainingReviewedAt = new Date().toISOString()
        return note
      }

      note.trainingReviewedAt = undefined
      return note
    },
    deleteNote: async (id) => {
      notes = notes.filter((note) => note.id !== id)
      removePreviewDeletedNoteReferences(id)
      actions = actions.filter((action) => action.noteId !== id)
      return {
        ok: true,
        canceled: false,
        deleted: true,
        message: 'Nota eliminada',
        noteId: id
      }
    },
    addManualLink: async (sourceId, targetId) => {
      const source = notes.find((note) => note.id === sourceId)
      const target = notes.find((note) => note.id === targetId)

      if (!source || !target) {
        throw new Error('Nota no encontrada')
      }

      source.related = [
        ...source.related.filter((related) => related.noteId !== target.id),
        {
          noteId: target.id,
          title: target.title,
          score: 0.72,
          reason: MANUAL_LINK_REASON
        }
      ]
      target.related = [
        ...target.related.filter((related) => related.noteId !== source.id),
        {
          noteId: source.id,
          title: source.title,
          score: 0.65,
          reason: MANUAL_RECIPROCAL_REASON
        }
      ]
      source.updatedAt = new Date().toISOString()
      target.updatedAt = source.updatedAt
      source.trainingReviewedAt = undefined
      target.trainingReviewedAt = undefined
      return source
    },
    removeLink: async (sourceId, targetId) => {
      const source = notes.find((note) => note.id === sourceId)
      const target = notes.find((note) => note.id === targetId)

      if (!source || !target) {
        throw new Error('Nota no encontrada')
      }

      source.related = source.related.filter((related) => related.noteId !== target.id)
      target.related = target.related.filter((related) => related.noteId !== source.id)
      source.updatedAt = new Date().toISOString()
      target.updatedAt = source.updatedAt
      source.trainingReviewedAt = undefined
      target.trainingReviewedAt = undefined
      return source
    },
    previewRagContext: async (id) => previewRagContext(id),
    analyzeNote: async (id, mode = 'qwen') => {
      const note = notes.find((item) => item.id === id)
      const now = new Date().toISOString()

      if (!note) {
        throw new Error('Nota no encontrada')
      }

      note.summary = previewDraftSummary(note.content).slice(0, 140)
      note.tags = previewAnalysisTags(note)
      note.category = previewDraftCategory(note.content, note.tags)
      const analysisLinks = notes
        .filter((candidate) => candidate.id !== note.id)
        .slice(0, 3)
        .map((candidate) => ({
          noteId: candidate.id,
          title: candidate.title,
          score: 0.65,
          reason: 'Relacion simulada para vista previa.'
        }))
      note.related = preservePreviewManualLinksAfterAnalysis(note, analysisLinks)
      note.suggestedActions = [
        {
          kind: 'task',
          title: 'Revisar nota capturada',
          detail: 'Vista previa de una accion sugerida para futura ejecucion MCP.',
          toolHint: 'task.create',
          confidence: 0.68
        }
      ]
      note.analysisStatus = mode === 'qwen' ? 'qwen' : 'fallback'
      note.analysisError = mode === 'qwen' ? undefined : 'Vista previa: Qwen solo corre dentro de Electron/Ollama.'
      note.analysisRun = {
        provider: mode === 'qwen' ? 'qwen' : 'local',
        model: settings.model,
        analyzedAt: now,
        durationMs: mode === 'qwen' ? 860 : 12,
        ragNoteIds: note.related.slice(0, settings.ragMaxNotes).map((related) => related.noteId),
        ragContext: note.related.slice(0, settings.ragMaxNotes).map((related) => {
          const candidate = notes.find((item) => item.id === related.noteId)

          return {
            noteId: related.noteId,
            title: related.title,
            category: candidate?.category ?? 'Inbox',
            tags: candidate?.tags ?? [],
            score: related.score,
            reason: related.reason,
            excerpt: candidate?.content.replace(/\s+/g, ' ').slice(0, settings.ragExcerptLength) ?? ''
          }
        })
      }
      note.trainingReviewedAt = undefined
      note.updatedAt = now
      syncPreviewRelatedGraph(note, now)
      return note
    },
    analyzePending: async (mode) => {
      const pending = notes.filter((note) => isPreviewPending(note, mode))
      let lastUpdatedId: string | undefined
      let qwen = 0
      let local = 0

      for (const note of pending) {
        note.summary = previewDraftSummary(note.content).slice(0, 140)
        note.tags = previewAnalysisTags(note)
        note.category = previewDraftCategory(note.content, note.tags)
        note.suggestedActions = [
          {
            kind: 'mcp',
            title: 'Preparar automatizacion',
            detail: 'Simulacion de accion estructurada lista para una futura capa MCP.',
            toolHint: 'mcp.workflow.prepare',
            confidence: 0.74
          }
        ]
        note.analysisStatus = mode === 'qwen' ? 'qwen' : 'fallback'
        note.analysisError = mode === 'qwen' ? undefined : 'Vista previa: Qwen solo corre dentro de Electron/Ollama.'
        note.analysisRun = {
          provider: mode === 'qwen' ? 'qwen' : 'local',
          model: settings.model,
          analyzedAt: new Date().toISOString(),
          durationMs: mode === 'qwen' ? 860 : 12,
          ragNoteIds: notes
            .filter((candidate) => candidate.id !== note.id)
            .slice(0, settings.ragMaxNotes)
            .map((candidate) => candidate.id),
          ragContext: notes
            .filter((candidate) => candidate.id !== note.id)
            .slice(0, settings.ragMaxNotes)
            .map((candidate) => ({
              noteId: candidate.id,
              title: candidate.title,
              category: candidate.category,
              tags: candidate.tags,
              score: 0.66,
              reason: 'Contexto simulado para vista previa.',
              excerpt: candidate.content.replace(/\s+/g, ' ').slice(0, settings.ragExcerptLength)
            }))
        }
        note.trainingReviewedAt = undefined
        note.updatedAt = new Date().toISOString()
        lastUpdatedId = note.id
        if (note.analysisStatus === 'qwen') {
          qwen += 1
        } else {
          local += 1
        }
      }

      return {
        total: pending.length,
        analyzed: pending.length,
        failed: 0,
        qwen,
        local,
        skipped: 0,
        lastUpdatedId
      }
    },
    listActions: async () => sortActions(),
    createActionFromSuggestion: async (noteId, suggestionIndex) => {
      const note = notes.find((item) => item.id === noteId)
      const suggestion = note?.suggestedActions[suggestionIndex]

      if (!note || !suggestion) {
        throw new Error('Accion sugerida no encontrada')
      }

      const existing = actions.find(
        (action) =>
          action.noteId === note.id &&
          action.kind === suggestion.kind &&
          action.title.trim().toLowerCase() === suggestion.title.trim().toLowerCase() &&
          action.detail.trim().toLowerCase() === suggestion.detail.trim().toLowerCase()
      )

      if (existing) {
        return existing
      }

      const now = new Date().toISOString()
      const action: ActionItem = {
        id: makeId(),
        noteId: note.id,
        noteTitle: note.title,
        kind: suggestion.kind,
        title: suggestion.title,
        detail: suggestion.detail,
        confidence: suggestion.confidence,
        status: 'open',
        createdAt: now,
        updatedAt: now
      }

      if (suggestion.toolHint) {
        action.toolHint = suggestion.toolHint
      }

      actions = [action, ...actions]
      return action
    },
    setActionStatus: async (actionId, status: ActionItemStatus) => {
      const action = actions.find((item) => item.id === actionId)

      if (!action) {
        throw new Error('Accion no encontrada')
      }

      action.status = status
      action.updatedAt = new Date().toISOString()
      return action
    },
    setActionMcpApproval: async (actionId, approved) => {
      const action = actions.find((item) => item.id === actionId)

      if (!action) {
        throw new Error('Accion no encontrada')
      }

      const now = new Date().toISOString()
      action.mcpApprovedAt = approved ? now : undefined
      action.updatedAt = now
      return action
    },
    setActionToolHint: async (actionId, toolHint) => {
      const action = actions.find((item) => item.id === actionId)

      if (!action) {
        throw new Error('Accion no encontrada')
      }

      const previousToolHint = action.toolHint?.trim() ?? ''
      const nextToolHint = toolHint.trim().replace(/\s+/g, ' ').slice(0, 80)

      action.toolHint = nextToolHint || undefined
      if (previousToolHint !== nextToolHint) {
        action.mcpApprovedAt = undefined
      }
      action.updatedAt = new Date().toISOString()
      return action
    },
    deleteAction: async (actionId) => {
      actions = actions.filter((action) => action.id !== actionId)
    },
    exportNoteMarkdown: async (id) => ({
      ok: true,
      canceled: false,
      message: 'Nota exportada como Markdown',
      path: `preview/${id}.md`,
      noteId: id
    }),
    getMcpConfig: async () => previewMcpConfig(),
    copyMcpConfig: async () => {
      const config = previewMcpConfig()
      await navigator.clipboard?.writeText(config.hostConfigJson)
      return config
    },
    copyMcpWriteConfig: async () => {
      const config = previewMcpConfig()
      await navigator.clipboard?.writeText(config.writeHostConfigJson)
      return config
    },
    previewMcpHandoff: async () => buildPreviewMcpHandoffPayload(),
    exportMcpHandoff: async () => ({
      ok: true,
      canceled: false,
      message: `Handoff MCP exportado (${formatActionCount(actions.filter((action) => action.status === 'open').length)})`,
      path: 'preview/neuronotes-mcp-handoff.json',
      actions: actions.filter((action) => action.status === 'open').length
    }),
    exportFineTuneDataset: async () => ({
      ok: fineTuneExampleCount() > 0,
      canceled: false,
      message:
        fineTuneExampleCount() > 0
          ? `Dataset fine-tuning exportado (${formatExampleCount(fineTuneExampleCount())})`
          : 'No hay notas revisadas para fine-tuning',
      path: fineTuneExampleCount() > 0 ? 'preview/neuronotes-finetune-dataset.jsonl' : undefined,
      examples: fineTuneExampleCount()
    }),
    exportLibrary: async () => ({
      ok: true,
      canceled: false,
      message: `Biblioteca exportada (${notes.length} notas)`,
      path: 'preview/neuronotes-backup.json',
      notes: notes.length
    }),
    exportLibraryMarkdown: async () => ({
      ok: true,
      canceled: false,
      message: `Biblioteca Markdown exportada (${notes.length} notas, ${notes.length + 1} archivos)`,
      path: 'preview/neuronotes-markdown',
      notes: notes.length,
      files: notes.length + 1
    }),
    importLibraryMarkdown: async () => {
      const now = new Date().toISOString()
      const note: NoteRecord = {
        id: makeId(),
        title: 'Import Markdown Preview',
        content: 'Nota importada desde una carpeta Markdown para alimentar Qwen, RAG y MCP local.',
        summary: 'Nota importada desde Markdown para contexto local.',
        category: 'Proyecto',
        tags: ['markdown', 'rag', 'mcp'],
        related: [],
        suggestedActions: previewSuggestedActions(
          'Nota importada desde una carpeta Markdown para alimentar Qwen, RAG y MCP local.'
        ),
        analysisStatus: 'idle',
        createdAt: now,
        updatedAt: now
      }

      seedPreviewInitialRelatedLinks(note)
      syncPreviewInitialBacklinks(note)
      notes = [note, ...notes]

      return {
        ok: true,
        canceled: false,
        message: 'Importacion Markdown lista: 1 notas nuevas, 1 archivos omitidos',
        path: 'preview/neuronotes-markdown',
        files: 2,
        imported: 1,
        skipped: 1
      }
    },
    importLibrary: async () => ({
      ok: true,
      canceled: false,
      message: 'Importacion lista: 0 nuevas, 0 actualizadas',
      path: 'preview/neuronotes-backup.json',
      total: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      actionsImported: 0,
      actionsUpdated: 0,
      actionsSkipped: 0
    }),
    getSettings: async () => ({ ...settings }),
    updateSettings: async (updates) => {
      Object.assign(settings, updates)
      settings.ragMaxNotes = clampNumber(settings.ragMaxNotes, 0, 6)
      settings.ragExcerptLength = clampNumber(settings.ragExcerptLength, 160, 1200)
      if (
        'model' in updates ||
        'ollamaUrl' in updates ||
        'ragMaxNotes' in updates ||
        'ragExcerptLength' in updates
      ) {
        aiDiagnostics = null
      }
      return { ...settings }
    },
    checkAiHealth: async () => previewHealth(),
    pullModel: async () => ({
      ok: true,
      message: `${settings.model} simulado`,
      model: settings.model
    }),
    startAiRuntime: async () => ({
      ok: false,
      started: false,
      reason: 'not-installed',
      message: 'Ollama no esta instalado'
    }),
    prepareAiRuntime: async () => previewPrepareRuntime(),
    runAiDiagnostics: async () => {
      aiDiagnostics = {
        ok: false,
        status: 'fallback',
        message: 'Vista previa: Qwen solo corre dentro de Electron/Ollama.',
        model: settings.model,
        ollamaUrl: settings.ollamaUrl,
        ragMaxNotes: settings.ragMaxNotes,
        ragExcerptLength: settings.ragExcerptLength,
        diagnosedAt: new Date().toISOString(),
        durationMs: 0,
        category: 'Proyecto',
        summary: 'Diagnostico simulado de Neuronotes.',
        related: 1,
        error: 'Vista previa sin Ollama.'
      }

      return aiDiagnostics
    },
    getAiDiagnostics: async () => aiDiagnostics,
    openOllamaDownload: async () => {
      window.open('https://ollama.com/download', '_blank', 'noopener,noreferrer')
    },
    copyAiSetupCommand: async () => {
      const command = qwenSetupCommand()
      await navigator.clipboard?.writeText(command)
      return {
        ok: true,
        message: 'Comandos de setup Qwen copiados.',
        command
      }
    },
    onLibraryChanged: () => {
      return () => undefined
    },
    onCommand: () => {
      return () => undefined
    }
  }
}
