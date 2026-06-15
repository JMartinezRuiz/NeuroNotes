import { NoteRecord } from './types'

export interface GraphConnection {
  note: NoteRecord
  reason: string
  score: number
  direction: 'direct' | 'backlink' | 'both'
}

export interface GraphEdge {
  id: string
  sourceId: string
  targetId: string
  sourceTitle: string
  targetTitle: string
  reason: string
  score: number
}

export function graphConnections(selectedNote: NoteRecord, notes: NoteRecord[]): GraphConnection[] {
  const byId = new Map<string, GraphConnection>()

  for (const related of selectedNote.related) {
    const target = notes.find((note) => note.id === related.noteId)

    if (!target) {
      continue
    }

    byId.set(target.id, {
      note: target,
      reason: related.reason,
      score: related.score,
      direction: 'direct'
    })
  }

  for (const note of notes) {
    if (note.id === selectedNote.id) {
      continue
    }

    const backlink = note.related.find((related) => related.noteId === selectedNote.id)

    if (!backlink) {
      continue
    }

    const existing = byId.get(note.id)
    if (existing) {
      byId.set(note.id, {
        ...existing,
        score: Math.max(existing.score, backlink.score),
        direction: 'both'
      })
      continue
    }

    byId.set(note.id, {
      note,
      reason: backlink.reason,
      score: backlink.score,
      direction: 'backlink'
    })
  }

  return [...byId.values()]
    .sort((a, b) => directionWeight(b.direction) - directionWeight(a.direction) || b.score - a.score)
    .slice(0, 10)
}

export function graphEdges(notes: NoteRecord[]): GraphEdge[] {
  const notesById = new Map(notes.map((note) => [note.id, note]))
  const byId = new Map<string, GraphEdge>()

  for (const source of notes) {
    for (const related of source.related) {
      const target = notesById.get(related.noteId)

      if (!target || target.id === source.id) {
        continue
      }

      const [sourceId, targetId] = [source.id, target.id].sort()
      const id = `${sourceId}::${targetId}`
      const existing = byId.get(id)
      const edge: GraphEdge = {
        id,
        sourceId,
        targetId,
        sourceTitle: notesById.get(sourceId)?.title ?? source.title,
        targetTitle: notesById.get(targetId)?.title ?? target.title,
        reason: related.reason,
        score: related.score
      }

      if (!existing || edge.score > existing.score || isReciprocalReason(existing.reason)) {
        byId.set(id, edge)
      }
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score)
}

function directionWeight(direction: GraphConnection['direction']): number {
  if (direction === 'both') {
    return 2
  }

  if (direction === 'direct') {
    return 1
  }

  return 0
}

function isReciprocalReason(reason: string): boolean {
  return reason.startsWith('Enlace reciproco:')
}
