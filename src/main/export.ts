import { ActionItem, NoteRecord } from './types'

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

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1')
}
