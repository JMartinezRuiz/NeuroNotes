import { NoteRecord, RelatedNote } from './types'

const MANUAL_LINK_REASON = 'Enlace manual.'
const MANUAL_RECIPROCAL_REASON = 'Enlace reciproco: Enlace manual.'

export function resetAnalysisAfterContentEdit(note: NoteRecord): void {
  note.summary = ''
  note.related = note.related.filter(isManualRelatedLink)
  note.suggestedActions = []
  note.analysisStatus = 'idle'
  note.analysisError = undefined
  note.analysisRun = undefined
  clearTrainingReview(note)
}

export function hasContentChanged(note: NoteRecord, nextContent: string): boolean {
  return nextContent.trim() !== note.content
}

export function isManualRelatedLink(link: RelatedNote): boolean {
  return link.reason === MANUAL_LINK_REASON || link.reason === MANUAL_RECIPROCAL_REASON
}

export function preserveManualLinksAfterAnalysis(note: NoteRecord, analysisLinks: RelatedNote[]): RelatedNote[] {
  const linksById = new Map<string, RelatedNote>()

  for (const link of note.related.filter(isManualRelatedLink)) {
    linksById.set(link.noteId, link)
  }

  for (const link of analysisLinks) {
    const existing = linksById.get(link.noteId)
    if (existing) {
      linksById.set(link.noteId, {
        ...existing,
        title: link.title || existing.title,
        score: Math.max(existing.score, link.score)
      })
      continue
    }

    linksById.set(link.noteId, link)
  }

  return [...linksById.values()].slice(0, 10)
}

export function removeDeletedNoteReferences(
  notes: NoteRecord[],
  deletedNoteId: string,
  now = new Date().toISOString()
): number {
  let affected = 0

  for (const note of notes) {
    const nextRelated = note.related.filter((related) => related.noteId !== deletedNoteId)

    if (nextRelated.length === note.related.length) {
      continue
    }

    note.related = nextRelated
    note.updatedAt = now
    clearTrainingReview(note)
    affected += 1
  }

  return affected
}

export function clearTrainingReview(note: NoteRecord): void {
  note.trainingReviewedAt = undefined
}

export function canApplyAnalysisResult(current: NoteRecord, analyzedSource: NoteRecord): boolean {
  return current.content === analyzedSource.content && current.updatedAt === analyzedSource.updatedAt
}
