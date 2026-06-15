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
}

export function isManualRelatedLink(link: RelatedNote): boolean {
  return link.reason === MANUAL_LINK_REASON || link.reason === MANUAL_RECIPROCAL_REASON
}
