import { randomUUID } from 'node:crypto'
import { ActionItem, ActionItemStatus, DatabaseFile, NoteRecord, SuggestedAction } from './types'

export function listActionItems(database: DatabaseFile): ActionItem[] {
  return [...database.actions].sort(compareActionItems)
}

export function createActionItemFromSuggestion(
  database: DatabaseFile,
  noteId: string,
  suggestionIndex: number
): ActionItem {
  const note = database.notes.find((item) => item.id === noteId)

  if (!note) {
    throw new Error('Nota no encontrada')
  }

  const suggestion = note.suggestedActions[suggestionIndex]
  if (!suggestion) {
    throw new Error('Accion sugerida no encontrada')
  }

  const existing = database.actions.find((item) => sameAction(item, note.id, suggestion))
  if (existing) {
    return existing
  }

  const now = new Date().toISOString()
  const action = makeActionItem(note, suggestion, randomUUID(), now)
  database.actions.unshift(action)
  return action
}

export function makeActionItem(
  note: Pick<NoteRecord, 'id' | 'title'>,
  suggestion: SuggestedAction,
  id: string,
  now: string
): ActionItem {
  const action: ActionItem = {
    id,
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

  return action
}

export function setActionItemStatus(database: DatabaseFile, actionId: string, status: ActionItemStatus): ActionItem {
  const action = database.actions.find((item) => item.id === actionId)

  if (!action) {
    throw new Error('Accion no encontrada')
  }

  action.status = status
  action.updatedAt = new Date().toISOString()
  return action
}

export function deleteActionItem(database: DatabaseFile, actionId: string): void {
  const initialLength = database.actions.length
  database.actions = database.actions.filter((item) => item.id !== actionId)

  if (database.actions.length === initialLength) {
    throw new Error('Accion no encontrada')
  }
}

export function removeActionItemsForNote(database: DatabaseFile, noteId: string): void {
  database.actions = database.actions.filter((item) => item.noteId !== noteId)
}

export function syncActionNoteTitle(database: DatabaseFile, note: Pick<NoteRecord, 'id' | 'title'>): void {
  const now = new Date().toISOString()

  for (const action of database.actions) {
    if (action.noteId === note.id && action.noteTitle !== note.title) {
      action.noteTitle = note.title
      action.updatedAt = now
    }
  }
}

function sameAction(action: ActionItem, noteId: string, suggestion: SuggestedAction): boolean {
  return (
    action.noteId === noteId &&
    action.kind === suggestion.kind &&
    action.title.trim().toLowerCase() === suggestion.title.trim().toLowerCase() &&
    action.detail.trim().toLowerCase() === suggestion.detail.trim().toLowerCase()
  )
}

function compareActionItems(a: ActionItem, b: ActionItem): number {
  if (a.status !== b.status) {
    return a.status === 'open' ? -1 : 1
  }

  return b.updatedAt.localeCompare(a.updatedAt)
}
