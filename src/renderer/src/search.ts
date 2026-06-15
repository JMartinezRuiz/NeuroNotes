import { NoteRecord } from './types'

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function noteMatchesSearch(
  note: Pick<NoteRecord, 'title' | 'summary' | 'content' | 'category' | 'tags'>,
  query: string
): boolean {
  const normalizedQuery = normalizeSearchText(query).trim()

  if (!normalizedQuery) {
    return true
  }

  const haystack = normalizeSearchText(`${note.title} ${note.summary} ${note.content} ${note.category} ${note.tags.join(' ')}`)
  return haystack.includes(normalizedQuery)
}
