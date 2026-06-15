import { synchronizeRelatedGraph } from './linking'
import { NoteRecord } from './types'

export function addManualLink(notes: NoteRecord[], sourceId: string, targetId: string): NoteRecord {
  const source = findNote(notes, sourceId)
  const target = findNote(notes, targetId)

  if (source.id === target.id) {
    throw new Error('No se puede enlazar una nota consigo misma')
  }

  const existingIndex = source.related.findIndex((related) => related.noteId === target.id)
  const manualLink = {
    noteId: target.id,
    title: target.title,
    score: 0.72,
    reason: 'Enlace manual.'
  }

  if (existingIndex === -1) {
    source.related = [...source.related, manualLink]
  } else {
    source.related[existingIndex] = {
      ...source.related[existingIndex],
      title: target.title,
      score: Math.max(source.related[existingIndex].score, manualLink.score),
      reason: source.related[existingIndex].reason || manualLink.reason
    }
  }

  source.updatedAt = new Date().toISOString()
  synchronizeRelatedGraph(notes, source.id)
  return source
}

export function removeManualLink(notes: NoteRecord[], sourceId: string, targetId: string): NoteRecord {
  const source = findNote(notes, sourceId)
  const target = findNote(notes, targetId)

  source.related = source.related.filter((related) => related.noteId !== target.id)
  target.related = target.related.filter((related) => related.noteId !== source.id)
  source.updatedAt = new Date().toISOString()
  target.updatedAt = source.updatedAt
  synchronizeRelatedGraph(notes, source.id)
  synchronizeRelatedGraph(notes, target.id)
  return source
}

function findNote(notes: NoteRecord[], id: string): NoteRecord {
  const note = notes.find((item) => item.id === id)

  if (!note) {
    throw new Error('Nota no encontrada')
  }

  return note
}
