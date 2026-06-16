import { ActionItem, DatabaseFile, NOTE_CATEGORIES, NoteRecord, RagContextItem, SuggestedAction } from './types'
import { linkProvenance } from '../shared/linkProvenance'

const MCP_HANDOFF_SCHEMA = 'neuronotes.mcp-handoff.v1'
const FINE_TUNE_EXAMPLE_SCHEMA = 'neuronotes.finetune-example.v1'
const FINE_TUNE_SYSTEM_PROMPT = [
  'Eres el motor local de Neuronotes para Qwen 0.8B. Analiza una nota nueva y usa el contexto recuperado solo si ayuda.',
  '',
  'Devuelve exclusivamente JSON valido con esta forma:',
  '{',
  '  "title": "maximo 8 palabras",',
  '  "summary": "resumen en una frase",',
  '  "category": "una categoria",',
  '  "tags": ["2 a 6 etiquetas cortas"],',
  '  "related": [{ "noteId": "id de nota existente", "reason": "motivo breve" }],',
  '  "suggestedActions": [{ "kind": "task | reminder | research | mcp", "title": "accion breve", "detail": "detalle breve", "toolHint": "herramienta MCP opcional", "confidence": 0.0 }]',
  '}',
  '',
  `Categorias permitidas: ${NOTE_CATEGORIES.join(', ')}.`,
  'No inventes IDs. Si no hay relacion clara, usa related: [].',
  'No ejecutes herramientas ni asumas permisos. Las suggestedActions son solo intenciones locales para una futura capa MCP.',
  'No incluyas razonamiento, texto fuera del JSON ni bloques <think>.'
].join('\n')

export interface FineTuneExample {
  schema: string
  exportedAt: string
  source: string
  targetModel: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  metadata: {
    noteId: string
    analysisStatus: string
    analysisProvider: string | null
    analysisModel: string | null
    analyzedAt: string | null
    analysisDurationMs: number | null
    category: string
    tagCount: number
    relatedCount: number
    suggestedActionCount: number
    ragNoteIds: string[]
    ragContextCount: number
    ragSettings: {
      maxNotes: number
      excerptLength: number
    }
    qwenDiagnostic: {
      ok: boolean
      diagnosedAt: string
      model: string
      related: number
    } | null
    quality: FineTuneExampleQuality
    reviewedForTraining: boolean
    reviewedAt: string | null
  }
}

export interface FineTuneExampleQuality {
  level: 'high' | 'medium' | 'low'
  score: number
  reasons: string[]
  warnings: string[]
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
        ragContext: RagContextItem[]
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

export function noteToMarkdown(note: NoteRecord, localActions: ActionItem[] = []): string {
  const tags = note.tags.length > 0 ? note.tags.map((tag) => `#${tag}`).join(' ') : 'Sin etiquetas'
  const related = note.related.length > 0
    ? note.related
        .map((item) => {
          const provenance = linkProvenance(item.reason)
          const label = escapeMarkdown(provenance.label)
          const title = escapeMarkdown(item.title)
          const reason = escapeMarkdown(item.reason)
          return `- [${label}] ${title}: ${reason} (${Math.round(item.score * 100)}%)`
        })
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
  const analysisAudit = note.analysisRun
    ? [
        `- Proveedor IA: ${escapeMarkdown(note.analysisRun.provider)}`,
        `- Modelo IA: ${escapeMarkdown(note.analysisRun.model)}`,
        `- Analizado: ${note.analysisRun.analyzedAt}`,
        `- Duracion: ${formatDuration(note.analysisRun.durationMs)}`,
        `- RAG IDs: ${note.analysisRun.ragNoteIds.length > 0 ? note.analysisRun.ragNoteIds.map(escapeMarkdown).join(', ') : 'Sin contexto'}`
      ].join('\n')
    : '- Proveedor IA: Sin auditoria'

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
    '## Auditoria IA',
    '',
    analysisAudit,
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

export function buildMcpHandoffPayload(database: DatabaseFile, exportedAt = new Date().toISOString()): McpHandoffPayload {
  const notesById = new Map(database.notes.map((note) => [note.id, note]))
  const openActions = database.actions
    .filter((action) => action.status === 'open' && notesById.has(action.noteId))
    .sort(compareActionItems)
  const actions = openActions.map((action) => {
    const note = notesById.get(action.noteId)

    if (!note) {
      throw new Error('Accion sin nota fuente')
    }

    const approvalState: 'approved' | 'needs-review' = action.mcpApprovedAt ? 'approved' : 'needs-review'

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
        state: approvalState,
        approvedAt: action.mcpApprovedAt ?? null
      },
      toolCallDraft: buildToolCallDraft(action, note),
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
              ragNoteIds: note.analysisRun.ragNoteIds,
              ragContext: note.analysisRun.ragContext ?? []
            }
          : null
      }
    }
  })

  return {
    schema: MCP_HANDOFF_SCHEMA,
    exportedAt,
    execution: {
      mode: 'manual-user-approved',
      requiresUserApproval: true,
      sideEffects: 'none-export-only'
    },
    model: database.settings.model,
    ollamaUrl: database.settings.ollamaUrl,
    actionCount: actions.length,
    approvedActionCount: actions.filter((action) => action.approval.state === 'approved').length,
    doneActionCount: database.actions.filter((action) => action.status === 'done').length,
    toolSummary: buildToolSummary(actions),
    kindSummary: buildKindSummary(actions),
    actions
  }
}

export function mcpHandoffToJson(database: DatabaseFile, exportedAt = new Date().toISOString()): string {
  return `${JSON.stringify(buildMcpHandoffPayload(database, exportedAt), null, 2)}\n`
}

export function buildFineTuneExamples(database: DatabaseFile, exportedAt = new Date().toISOString()): FineTuneExample[] {
  const notesById = new Map(database.notes.map((note) => [note.id, note]))

  return database.notes
    .filter((note) => isFineTuneCandidate(note) && Boolean(note.trainingReviewedAt))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((note) => {
      const assistantPayload = buildFineTuneAssistantPayload(note, notesById)
      const quality = fineTuneExampleQuality(note)

      return {
        schema: FINE_TUNE_EXAMPLE_SCHEMA,
        exportedAt,
        source: 'neuronotes',
        targetModel: database.settings.model,
        messages: [
          {
            role: 'system',
            content: FINE_TUNE_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: buildFineTuneUserPrompt(note, notesById)
          },
          {
            role: 'assistant',
            content: JSON.stringify(assistantPayload)
          }
        ],
        metadata: {
          noteId: note.id,
          analysisStatus: note.analysisStatus,
          analysisProvider: note.analysisRun?.provider ?? null,
          analysisModel: note.analysisRun?.model ?? null,
          analyzedAt: note.analysisRun?.analyzedAt ?? null,
          analysisDurationMs: note.analysisRun?.durationMs ?? null,
          category: note.category,
          tagCount: note.tags.length,
          relatedCount: assistantPayload.related.length,
          suggestedActionCount: assistantPayload.suggestedActions.length,
          ragNoteIds: note.analysisRun?.ragNoteIds ?? [],
          ragContextCount: note.analysisRun?.ragContext?.length ?? 0,
          ragSettings: {
            maxNotes: database.settings.ragMaxNotes,
            excerptLength: database.settings.ragExcerptLength
          },
          qwenDiagnostic:
            database.aiDiagnostics && database.aiDiagnostics.model === database.settings.model
              ? {
                  ok: database.aiDiagnostics.ok,
                  diagnosedAt: database.aiDiagnostics.diagnosedAt,
                  model: database.aiDiagnostics.model,
                  related: database.aiDiagnostics.related
                }
              : null,
          quality,
          reviewedForTraining: true,
          reviewedAt: note.trainingReviewedAt ?? null
        }
      }
    })
}

export function fineTuneDatasetToJsonl(database: DatabaseFile, exportedAt = new Date().toISOString()): string {
  const lines = buildFineTuneExamples(database, exportedAt).map((example) => JSON.stringify(example))
  return lines.length > 0 ? `${lines.join('\n')}\n` : ''
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1')
}

function formatDuration(durationMs: number): string {
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)} s` : `${Math.max(0, Math.round(durationMs))} ms`
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

function buildToolSummary(actions: McpHandoffPayload['actions']): McpHandoffPayload['toolSummary'] {
  const summary = new Map<string, { kinds: Set<string>; sourceNoteIds: Set<string>; actionCount: number }>()

  for (const action of actions) {
    const toolHint = action.toolHint ?? 'unassigned'
    const entry = summary.get(toolHint) ?? {
      kinds: new Set<string>(),
      sourceNoteIds: new Set<string>(),
      actionCount: 0
    }
    entry.actionCount += 1
    entry.kinds.add(action.kind)
    entry.sourceNoteIds.add(action.sourceNote.id)
    summary.set(toolHint, entry)
  }

  return [...summary.entries()]
    .map(([toolHint, entry]) => ({
      toolHint,
      actionCount: entry.actionCount,
      kinds: [...entry.kinds].sort((a, b) => a.localeCompare(b)),
      sourceNoteIds: [...entry.sourceNoteIds].sort((a, b) => a.localeCompare(b))
    }))
    .sort((a, b) => b.actionCount - a.actionCount || a.toolHint.localeCompare(b.toolHint))
}

function buildKindSummary(actions: McpHandoffPayload['actions']): McpHandoffPayload['kindSummary'] {
  const summary = new Map<string, number>()

  for (const action of actions) {
    summary.set(action.kind, (summary.get(action.kind) ?? 0) + 1)
  }

  return [...summary.entries()]
    .map(([kind, actionCount]) => ({ kind, actionCount }))
    .sort((a, b) => b.actionCount - a.actionCount || a.kind.localeCompare(b.kind))
}

function buildToolCallDraft(action: ActionItem, note: NoteRecord): McpHandoffPayload['actions'][number]['toolCallDraft'] {
  const ragContext = note.analysisRun?.ragContext ?? []

  return {
    status: action.toolHint ? 'ready-for-review' : 'needs-tool-selection',
    toolName: action.toolHint ?? null,
    arguments: {
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
      ragContext
    }
  }
}

function isFineTuneCandidate(note: NoteRecord): boolean {
  if (!note.content.trim() || (note.analysisStatus !== 'qwen' && note.analysisStatus !== 'fallback')) {
    return false
  }

  return Boolean(note.summary.trim() || note.tags.length > 0 || note.related.length > 0 || note.suggestedActions.length > 0)
}

function buildFineTuneAssistantPayload(
  note: NoteRecord,
  notesById: Map<string, NoteRecord>
): {
  title: string
  summary: string
  category: string
  tags: string[]
  related: Array<{
    noteId: string
    reason: string
  }>
  suggestedActions: SuggestedAction[]
} {
  return {
    title: note.title,
    summary: note.summary,
    category: note.category,
    tags: note.tags.slice(0, 6),
    related: note.related
      .filter((related) => notesById.has(related.noteId))
      .slice(0, 6)
      .map((related) => ({
        noteId: related.noteId,
        reason: related.reason
      })),
    suggestedActions: note.suggestedActions
      .slice(0, 4)
      .map((action) => ({
        kind: action.kind,
        title: action.title,
        detail: action.detail,
        toolHint: action.toolHint,
        confidence: action.confidence
      }))
  }
}

function buildFineTuneUserPrompt(note: NoteRecord, notesById: Map<string, NoteRecord>): string {
  return [
    'Fecha de referencia:',
    note.createdAt.slice(0, 10),
    '',
    'Metadatos actuales:',
    `Titulo: ${note.title || 'Sin titulo'}`,
    `Categoria actual: ${note.category || 'Inbox'}`,
    `Etiquetas actuales: ${note.tags.join(', ') || 'sin etiquetas'}`,
    '',
    'Nota nueva:',
    note.content.trim(),
    '',
    'Contexto recuperado:',
    buildFineTuneContext(note, notesById) || 'Sin contexto recuperado.'
  ].join('\n')
}

function buildFineTuneContext(note: NoteRecord, notesById: Map<string, NoteRecord>): string {
  const contextItems = note.analysisRun?.ragContext?.length
    ? note.analysisRun.ragContext
    : note.related
        .map((related) => {
          const target = notesById.get(related.noteId)

          if (!target) {
            return undefined
          }

          return {
            noteId: target.id,
            title: target.title,
            category: target.category,
            tags: target.tags,
            score: related.score,
            reason: related.reason,
            excerpt: excerpt(target.content, 500)
          } satisfies RagContextItem
        })
        .filter((item): item is RagContextItem => Boolean(item))

  return contextItems
    .slice(0, 5)
    .map((item) =>
      [
        `ID: ${item.noteId}`,
        `Titulo: ${item.title}`,
        `Categoria: ${item.category}`,
        `Etiquetas: ${item.tags.join(', ') || 'sin etiquetas'}`,
        `Puntuacion: ${item.score.toFixed(3)}`,
        `Motivo: ${item.reason}`,
        `Extracto: ${item.excerpt}`
      ].join('\n')
    )
    .join('\n\n')
}

function fineTuneExampleQuality(note: NoteRecord): FineTuneExampleQuality {
  const reasons: string[] = []
  const warnings: string[] = []
  let score = 0

  if (note.analysisStatus === 'qwen' && note.analysisRun?.provider === 'qwen') {
    score += 0.35
    reasons.push('Analisis generado por Qwen.')
  } else {
    warnings.push('Ejemplo basado en fallback local; revisarlo antes de usarlo para ajustar Qwen.')
  }

  if (note.analysisRun?.ragContext?.length) {
    score += 0.25
    reasons.push('Incluye contexto RAG auditado.')
  } else if (note.related.length > 0) {
    score += 0.12
    warnings.push('Usa enlaces relacionados como contexto; no hay RAG auditado guardado.')
  } else {
    warnings.push('No incluye contexto RAG ni enlaces relacionados.')
  }

  if (note.summary.trim()) {
    score += 0.15
    reasons.push('Incluye resumen revisable.')
  } else {
    warnings.push('No incluye resumen.')
  }

  if (note.tags.length > 0) {
    score += 0.1
    reasons.push('Incluye etiquetas.')
  } else {
    warnings.push('No incluye etiquetas.')
  }

  if (note.related.length > 0) {
    score += 0.1
    reasons.push('Incluye enlaces a notas relacionadas.')
  }

  if (note.suggestedActions.length > 0) {
    score += 0.05
    reasons.push('Incluye acciones sugeridas.')
  }

  const roundedScore = Math.min(1, Number(score.toFixed(2)))

  return {
    level: roundedScore >= 0.75 ? 'high' : roundedScore >= 0.5 ? 'medium' : 'low',
    score: roundedScore,
    reasons,
    warnings
  }
}
