import { NeuronotesApi } from '../../preload'
import { AiHealth, AppSettings, NoteRecord } from './types'

type Api = NeuronotesApi

const settings: AppSettings = {
  model: 'qwen3.5:0.8b',
  ollamaUrl: 'http://127.0.0.1:11434',
  autoAnalyze: true
}

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
    analysisStatus: 'qwen',
    analysisRun: {
      provider: 'qwen',
      model: settings.model,
      analyzedAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
      durationMs: 842,
      ragNoteIds: ['preview-ui']
    },
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
    analysisStatus: 'fallback',
    analysisError: 'Vista previa: Qwen no se ejecuta en el navegador.',
    analysisRun: {
      provider: 'local',
      model: settings.model,
      analyzedAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
      durationMs: 14,
      ragNoteIds: ['preview-roadmap']
    },
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 55).toISOString()
  }
]

const sortNotes = (): NoteRecord[] => [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

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

      if (updates.content) {
        note.content = updates.content
      }

      if (updates.title) {
        note.title = updates.title
      }

      if (updates.category) {
        note.category = updates.category
      }

      if (updates.tags) {
        note.tags = Array.from(
          new Set(
            updates.tags
              .map((tag) => tag.trim().toLowerCase().replace(/^#/, ''))
              .filter(Boolean)
          )
        )
      }

      note.updatedAt = new Date().toISOString()
      return note
    },
    deleteNote: async (id) => {
      notes = notes.filter((note) => note.id !== id)
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
          reason: 'Enlace manual.'
        }
      ]
      target.related = [
        ...target.related.filter((related) => related.noteId !== source.id),
        {
          noteId: source.id,
          title: source.title,
          score: 0.65,
          reason: 'Enlace reciproco: Enlace manual.'
        }
      ]
      source.updatedAt = new Date().toISOString()
      target.updatedAt = source.updatedAt
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
      return source
    },
    analyzeNote: async (id) => {
      const note = notes.find((item) => item.id === id)

      if (!note) {
        throw new Error('Nota no encontrada')
      }

      note.summary = note.content.replace(/\s+/g, ' ').slice(0, 140)
      note.category = note.content.toLowerCase().includes('ui') ? 'Ideas' : 'Proyecto'
      note.tags = Array.from(new Set(note.content.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [])).slice(0, 4)
      note.related = notes
        .filter((candidate) => candidate.id !== note.id)
        .slice(0, 3)
        .map((candidate) => ({
          noteId: candidate.id,
          title: candidate.title,
          score: 0.65,
          reason: 'Relacion simulada para vista previa.'
        }))
      note.analysisStatus = 'fallback'
      note.analysisError = 'Vista previa: Qwen solo corre dentro de Electron/Ollama.'
      note.analysisRun = {
        provider: 'local',
        model: settings.model,
        analyzedAt: new Date().toISOString(),
        durationMs: 12,
        ragNoteIds: note.related.map((related) => related.noteId)
      }
      note.updatedAt = new Date().toISOString()
      return note
    },
    analyzePending: async () => {
      const pending = notes.filter((note) => note.content.trim().length > 0 && note.analysisStatus !== 'qwen')
      let lastUpdatedId: string | undefined

      for (const note of pending) {
        note.summary = note.content.replace(/\s+/g, ' ').slice(0, 140)
        note.category = note.content.toLowerCase().includes('ui') ? 'Ideas' : 'Proyecto'
        note.tags = Array.from(new Set(note.content.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [])).slice(0, 4)
        note.analysisStatus = 'qwen'
        note.analysisError = undefined
        note.analysisRun = {
          provider: 'qwen',
          model: settings.model,
          analyzedAt: new Date().toISOString(),
          durationMs: 860,
          ragNoteIds: notes.filter((candidate) => candidate.id !== note.id).slice(0, 3).map((candidate) => candidate.id)
        }
        note.updatedAt = new Date().toISOString()
        lastUpdatedId = note.id
      }

      return {
        total: pending.length,
        analyzed: pending.length,
        failed: 0,
        lastUpdatedId
      }
    },
    exportNoteMarkdown: async (id) => ({
      ok: true,
      canceled: false,
      message: 'Nota exportada como Markdown',
      path: `preview/${id}.md`,
      noteId: id
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
      skipped: 0
    }),
    getSettings: async () => settings,
    updateSettings: async (updates) => {
      Object.assign(settings, updates)
      return settings
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
    }
  }
}
