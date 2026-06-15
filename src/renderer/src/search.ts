import { ActionItem, NoteRecord } from './types'

type SearchableNote = Pick<
  NoteRecord,
  'title' | 'summary' | 'content' | 'category' | 'tags' | 'related' | 'suggestedActions' | 'analysisRun'
>
type SearchableAction = Pick<ActionItem, 'kind' | 'title' | 'detail' | 'toolHint' | 'status'>

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function noteMatchesSearch(
  note: SearchableNote,
  query: string,
  savedActions: SearchableAction[] = []
): boolean {
  const normalizedQuery = normalizeSearchText(query).trim()

  if (!normalizedQuery) {
    return true
  }

  const haystack = normalizeSearchText(noteSearchText(note, savedActions))
  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  return haystack.includes(normalizedQuery) || terms.every((term) => haystack.includes(term))
}

function noteSearchText(note: SearchableNote, savedActions: SearchableAction[]): string {
  const relatedText = note.related
    .map((related) => `${related.title} ${related.reason}`)
    .join(' ')
  const actionsText = note.suggestedActions
    .map((action) => `${action.kind} ${action.title} ${action.detail} ${action.toolHint ?? ''}`)
    .join(' ')
  const savedActionsText = savedActions
    .map((action) => `${action.status} ${action.kind} ${action.title} ${action.detail} ${action.toolHint ?? ''}`)
    .join(' ')
  const ragText = note.analysisRun?.ragContext
    ?.map((item) => `${item.title} ${item.category} ${item.tags.join(' ')} ${item.reason} ${item.excerpt}`)
    .join(' ') ?? ''

  return [
    note.title,
    note.summary,
    note.content,
    note.category,
    note.tags.join(' '),
    relatedText,
    actionsText,
    savedActionsText,
    note.analysisRun?.provider ?? '',
    note.analysisRun?.model ?? '',
    note.analysisRun?.ragNoteIds.join(' ') ?? '',
    ragText
  ].join(' ')
}
