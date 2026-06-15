import { ActionItem, DatabaseFile, NoteRecord } from './types'

const MCP_HANDOFF_SCHEMA = 'neuronotes.mcp-handoff.v1'

export function noteToMarkdown(note: NoteRecord, localActions: ActionItem[] = []): string {
  const tags = note.tags.length > 0 ? note.tags.map((tag) => `#${tag}`).join(' ') : 'Sin etiquetas'
  const related = note.related.length > 0
    ? note.related
        .map((item) => `- ${escapeMarkdown(item.title)}: ${item.reason} (${Math.round(item.score * 100)}%)`)
        .join('\n')
    : '- Sin notas enlazadas'
  const actions = note.suggestedActions.length > 0
    ? note.suggestedActions
        .map((item) => {
          const tool = item.toolHint ? ` [${escapeMarkdown(item.toolHint)}]` : ''
          return `- ${escapeMarkdown(item.title)} (${item.kind}, ${Math.round(item.confidence * 100)}%)${tool}: ${escapeMarkdown(item.detail)}`
        })
        .join('\n')
    : '- Sin acciones sugeridas'
  const plan = localActions.length > 0
    ? localActions
        .map((item) => {
          const tool = item.toolHint ? ` [${escapeMarkdown(item.toolHint)}]` : ''
          return `- [${item.status === 'done' ? 'x' : ' '}] ${escapeMarkdown(item.title)} (${item.kind})${tool}: ${escapeMarkdown(item.detail)}`
        })
        .join('\n')
    : '- Sin acciones guardadas'
  const ragContext = note.analysisRun?.ragContext?.length
    ? note.analysisRun.ragContext
        .map((item) => {
          const tags = item.tags.length > 0 ? ` #${item.tags.map(escapeMarkdown).join(' #')}` : ''
          return `- ${escapeMarkdown(item.title)} (${Math.round(item.score * 100)}%, ${escapeMarkdown(item.category)}${tags}): ${escapeMarkdown(item.excerpt || item.reason)}`
        })
        .join('\n')
    : '- Sin contexto RAG guardado'

  return [
    `# ${escapeMarkdown(note.title)}`,
    '',
    note.summary ? `> ${note.summary}` : '> Sin resumen',
    '',
    `- Categoria: ${note.category}`,
    `- Etiquetas: ${tags}`,
    `- Analisis: ${note.analysisStatus}`,
    `- Creada: ${note.createdAt}`,
    `- Actualizada: ${note.updatedAt}`,
    '',
    '## Nota',
    '',
    note.content,
    '',
    '## Notas enlazadas',
    '',
    related,
    '',
    '## Acciones sugeridas',
    '',
    actions,
    '',
    '## Plan local',
    '',
    plan,
    '',
    '## Contexto RAG',
    '',
    ragContext,
    ''
  ].join('\n')
}

export function safeMarkdownFileName(title: string): string {
  const sanitized = title
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return `${sanitized || 'nota-neuronotes'}.md`
}

export function buildMcpHandoffPayload(database: DatabaseFile, exportedAt = new Date().toISOString()): {
  schema: string
  exportedAt: string
  execution: {
    mode: string
    requiresUserApproval: boolean
  }
  model: string
  ollamaUrl: string
  actionCount: number
  doneActionCount: number
  actions: Array<{
    id: string
    kind: string
    status: string
    title: string
    detail: string
    toolHint: string | null
    confidence: number
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
      analysis: {
        provider: string
        model: string
        analyzedAt: string
        ragNoteIds: string[]
      } | null
    }
  }>
} {
  const notesById = new Map(database.notes.map((note) => [note.id, note]))
  const openActions = database.actions
    .filter((action) => action.status === 'open' && notesById.has(action.noteId))
    .sort(compareActionItems)

  return {
    schema: MCP_HANDOFF_SCHEMA,
    exportedAt,
    execution: {
      mode: 'manual-user-approved',
      requiresUserApproval: true
    },
    model: database.settings.model,
    ollamaUrl: database.settings.ollamaUrl,
    actionCount: openActions.length,
    doneActionCount: database.actions.filter((action) => action.status === 'done').length,
    actions: openActions.map((action) => {
      const note = notesById.get(action.noteId)

      if (!note) {
        throw new Error('Accion sin nota fuente')
      }

      return {
        id: action.id,
        kind: action.kind,
        status: action.status,
        title: action.title,
        detail: action.detail,
        toolHint: action.toolHint ?? null,
        confidence: action.confidence,
        createdAt: action.createdAt,
        updatedAt: action.updatedAt,
        sourceNote: {
          id: note.id,
          title: note.title,
          summary: note.summary,
          category: note.category,
          tags: note.tags,
          contentExcerpt: excerpt(note.content, 1200),
          relatedNoteIds: note.related.map((related) => related.noteId),
          analysis: note.analysisRun
            ? {
                provider: note.analysisRun.provider,
                model: note.analysisRun.model,
                analyzedAt: note.analysisRun.analyzedAt,
                ragNoteIds: note.analysisRun.ragNoteIds
              }
            : null
        }
      }
    })
  }
}

export function mcpHandoffToJson(database: DatabaseFile, exportedAt = new Date().toISOString()): string {
  return `${JSON.stringify(buildMcpHandoffPayload(database, exportedAt), null, 2)}\n`
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1')
}

function excerpt(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean
}

function compareActionItems(a: ActionItem, b: ActionItem): number {
  if (a.status !== b.status) {
    return a.status === 'open' ? -1 : 1
  }

  return b.updatedAt.localeCompare(a.updatedAt)
}
