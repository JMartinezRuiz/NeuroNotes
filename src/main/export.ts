import { NoteRecord } from './types'

export function noteToMarkdown(note: NoteRecord): string {
  const tags = note.tags.length > 0 ? note.tags.map((tag) => `#${tag}`).join(' ') : 'Sin etiquetas'
  const related = note.related.length > 0
    ? note.related
        .map((item) => `- ${escapeMarkdown(item.title)}: ${item.reason} (${Math.round(item.score * 100)}%)`)
        .join('\n')
    : '- Sin notas enlazadas'

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
