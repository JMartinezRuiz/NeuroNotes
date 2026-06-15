import { NeuronotesApi } from '../../preload'
import { isFineTuneReviewable } from './fineTuneReadiness'
import { ActionItem, ActionItemStatus, AiHealth, AppSettings, NoteRecord } from './types'

type Api = NeuronotesApi

const settings: AppSettings = {
  model: 'qwen3.5:0.8b',
  ollamaUrl: 'http://127.0.0.1:11434',
  autoAnalyze: true,
  ragMaxNotes: 5,
  ragExcerptLength: 550
}

const MANUAL_LINK_REASON = 'Enlace manual.'
const MANUAL_RECIPROCAL_REASON = 'Enlace reciproco: Enlace manual.'

let notes: NoteRecord[] = [
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

let actions: ActionItem[] = [
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
const qwenSetupCommand = (): string =>
  ['irm https://ollama.com/install.ps1 | iex', `ollama pull ${settings.model.trim() || 'qwen3.5:0.8b'}`].join('\n')
const previewMcpConfig = () => {
  const serverPath = 'C:\\Program Files\\Neuronotes\\resources\\mcp\\neuronotes-mcp.mjs'
  const databasePath = 'C:\\Users\\you\\AppData\\Roaming\\Neuronotes\\neuronotes.json'
  const command = 'node'
  const args = [serverPath, '--db', databasePath]

  return {
    schema: 'neuronotes.mcp-config.v1',
    serverName: 'neuronotes',
    command,
    args,
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
    )}\n`
  }
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
const preservePreviewManualLinksAfterAnalysis = (
  note: NoteRecord,
  analysisLinks: NoteRecord['related']
): NoteRecord['related'] => {
  const linksById = new Map<string, NoteRecord['related'][number]>()

  for (const link of note.related.filter(isManualRelatedLink)) {
    linksById.set(link.noteId, link)
  }

  for (const link of analysisLinks) {
    const existing = linksById.get(link.noteId)
    if (existing) {
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

const previewHealth = (): AiHealth => ({
  ok: false,
  status: 'ollama-missing',
  message: 'Ollama no disponible',
  model: settings.model,
  ollamaUrl: settings.ollamaUrl,
  ollamaAvailable: false,
  modelInstalled: false,
  installedModels: []
})

const makeId = (): string => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `preview-${Date.now()}`
}

export function createPreviewApi(): Api {
  return {
    listNotes: async () => sortNotes(),
    createNote: async (content: string) => {
      const now = new Date().toISOString()
      const note: NoteRecord = {
        id: makeId(),
        title: content.split(/\r?\n/)[0]?.slice(0, 80) || 'Nota sin titulo',
        content,
        summary: '',
        category: 'Inbox',
        tags: [],
        related: [],
        suggestedActions: [],
        analysisStatus: 'idle',
        createdAt: now,
        updatedAt: now
      }

      notes = [note, ...notes]
      return note
    },
    updateNote: async (id, updates) => {
      const note = notes.find((item) => item.id === id)

      if (!note) {
        throw new Error('Nota no encontrada')
      }

      if (typeof updates.content === 'string') {
        const contentChanged = updates.content !== note.content
        note.content = updates.content
        if (contentChanged) {
          resetPreviewAnalysisAfterContentEdit(note)
        }
      }

      if (updates.title) {
        note.title = updates.title
        note.trainingReviewedAt = undefined
        for (const action of actions) {
          if (action.noteId === note.id) {
            action.noteTitle = note.title
            action.updatedAt = new Date().toISOString()
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

      note.updatedAt = new Date().toISOString()
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
    analyzeNote: async (id, mode = 'qwen') => {
      const note = notes.find((item) => item.id === id)

      if (!note) {
        throw new Error('Nota no encontrada')
      }

      note.summary = note.content.replace(/\s+/g, ' ').slice(0, 140)
      note.category = note.content.toLowerCase().includes('ui') ? 'Ideas' : 'Proyecto'
      note.tags = Array.from(new Set(note.content.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [])).slice(0, 4)
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
        analyzedAt: new Date().toISOString(),
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
      note.updatedAt = new Date().toISOString()
      return note
    },
    analyzePending: async (mode) => {
      const pending = notes.filter((note) => isPreviewPending(note, mode))
      let lastUpdatedId: string | undefined
      let qwen = 0
      let local = 0

      for (const note of pending) {
        note.summary = note.content.replace(/\s+/g, ' ').slice(0, 140)
        note.category = note.content.toLowerCase().includes('ui') ? 'Ideas' : 'Proyecto'
        note.tags = Array.from(new Set(note.content.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [])).slice(0, 4)
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
    runAiDiagnostics: async () => ({
      ok: false,
      status: 'fallback',
      message: 'Vista previa: Qwen solo corre dentro de Electron/Ollama.',
      model: settings.model,
      durationMs: 0,
      category: 'Proyecto',
      summary: 'Diagnostico simulado de Neuronotes.',
      related: 1,
      error: 'Vista previa sin Ollama.'
    }),
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
    onCommand: () => {
      return () => undefined
    }
  }
}
