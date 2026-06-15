import { describe, expect, it } from 'vitest'
import {
  createActionItemFromSuggestion,
  deleteActionItem,
  listActionItems,
  makeActionItem,
  removeActionItemsForNote,
  setActionItemStatus,
  syncActionNoteTitle
} from '../actions'
import { DatabaseFile, DEFAULT_SETTINGS, NoteRecord, SuggestedAction } from '../types'

const now = '2026-06-15T00:00:00.000Z'

function note(overrides: Partial<NoteRecord> = {}): NoteRecord {
  return {
    id: 'note-1',
    title: 'Roadmap',
    content: 'Preparar tareas de Neuronotes',
    summary: '',
    category: 'Proyecto',
    tags: [],
    related: [],
    suggestedActions: [
      {
        kind: 'task',
        title: 'Preparar tarea',
        detail: 'Convertir la nota en una tarea local.',
        toolHint: 'task.create',
        confidence: 0.75
      }
    ],
    analysisStatus: 'qwen',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

function database(notes: NoteRecord[] = [note()]): DatabaseFile {
  return {
    version: 1,
    notes,
    actions: [],
    settings: { ...DEFAULT_SETTINGS }
  }
}

describe('makeActionItem', () => {
  it('creates a local action item from a suggested action', () => {
    const suggestion: SuggestedAction = {
      kind: 'research',
      title: 'Buscar fuentes',
      detail: 'Encontrar documentos relacionados.',
      toolHint: 'documents.search',
      confidence: 0.62
    }

    expect(makeActionItem(note(), suggestion, 'action-1', now)).toEqual({
      id: 'action-1',
      noteId: 'note-1',
      noteTitle: 'Roadmap',
      kind: 'research',
      title: 'Buscar fuentes',
      detail: 'Encontrar documentos relacionados.',
      toolHint: 'documents.search',
      confidence: 0.62,
      status: 'open',
      createdAt: now,
      updatedAt: now
    })
  })
})

describe('createActionItemFromSuggestion', () => {
  it('stores a suggested action and returns existing duplicates', () => {
    const stored = database()
    const created = createActionItemFromSuggestion(stored, 'note-1', 0)
    const duplicate = createActionItemFromSuggestion(stored, 'note-1', 0)

    expect(stored.actions).toHaveLength(1)
    expect(duplicate.id).toBe(created.id)
    expect(created).toMatchObject({
      noteId: 'note-1',
      noteTitle: 'Roadmap',
      kind: 'task',
      title: 'Preparar tarea',
      detail: 'Convertir la nota en una tarea local.',
      toolHint: 'task.create',
      status: 'open'
    })
  })
})

describe('action item lifecycle', () => {
  it('updates status, note title, ordering, and deletion', () => {
    const stored = database()
    const first = createActionItemFromSuggestion(stored, 'note-1', 0)
    stored.notes[0].suggestedActions = [
      {
        kind: 'reminder',
        title: 'Recordar seguimiento',
        detail: 'Volver a revisar la nota.',
        confidence: 0.5
      }
    ]
    const second = createActionItemFromSuggestion(stored, 'note-1', 0)

    setActionItemStatus(stored, first.id, 'done')
    stored.notes[0].title = 'Roadmap actualizado'
    syncActionNoteTitle(stored, stored.notes[0])

    expect(stored.actions.find((action) => action.id === first.id)?.status).toBe('done')
    expect(stored.actions.every((action) => action.noteTitle === 'Roadmap actualizado')).toBe(true)
    expect(listActionItems(stored).map((action) => action.id)).toEqual([second.id, first.id])

    deleteActionItem(stored, second.id)
    expect(stored.actions.map((action) => action.id)).toEqual([first.id])

    removeActionItemsForNote(stored, 'note-1')
    expect(stored.actions).toEqual([])
  })
})
