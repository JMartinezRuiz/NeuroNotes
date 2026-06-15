import { NoteRecord } from './types'

export type FineTuneReadinessStatus = 'empty' | 'needs-review' | 'ready'

export interface FineTuneReadinessSummary {
  reviewedExamples: number
  pendingReviewNotes: number
  reviewableNotes: number
  reviewedQwenExamples: number
  reviewedLocalExamples: number
  status: FineTuneReadinessStatus
  message: string
}

export function isFineTuneReviewable(note: NoteRecord): boolean {
  if (!note.content.trim() || (note.analysisStatus !== 'qwen' && note.analysisStatus !== 'fallback')) {
    return false
  }

  return Boolean(note.summary.trim() || note.tags.length > 0 || note.related.length > 0 || note.suggestedActions.length > 0)
}

export function summarizeFineTuneReadiness(notes: NoteRecord[]): FineTuneReadinessSummary {
  const reviewableNotes = notes.filter(isFineTuneReviewable)
  const reviewedNotes = reviewableNotes.filter((note) => Boolean(note.trainingReviewedAt))
  const reviewedExamples = reviewedNotes.length
  const pendingReviewNotes = reviewableNotes.length - reviewedExamples
  const status = fineTuneStatus(reviewedExamples, pendingReviewNotes)

  return {
    reviewedExamples,
    pendingReviewNotes,
    reviewableNotes: reviewableNotes.length,
    reviewedQwenExamples: reviewedNotes.filter((note) => note.analysisStatus === 'qwen').length,
    reviewedLocalExamples: reviewedNotes.filter((note) => note.analysisStatus === 'fallback').length,
    status,
    message: fineTuneMessage(status, reviewedExamples, pendingReviewNotes)
  }
}

function fineTuneStatus(reviewedExamples: number, pendingReviewNotes: number): FineTuneReadinessStatus {
  if (reviewedExamples > 0) {
    return 'ready'
  }

  if (pendingReviewNotes > 0) {
    return 'needs-review'
  }

  return 'empty'
}

function fineTuneMessage(
  status: FineTuneReadinessStatus,
  reviewedExamples: number,
  pendingReviewNotes: number
): string {
  if (status === 'ready') {
    const readyLabel = `${formatFineTuneExampleCount(reviewedExamples)} ${reviewedExamples === 1 ? 'listo' : 'listos'} para JSONL`
    const reviewLabel =
      pendingReviewNotes > 0 ? `; ${formatNoteCount(pendingReviewNotes)} por aprobar` : ''

    return `${readyLabel}${reviewLabel}.`
  }

  if (status === 'needs-review') {
    return `${formatNoteCount(pendingReviewNotes)} ${pendingReviewNotes === 1 ? 'lista' : 'listas'} para aprobar.`
  }

  return 'Analiza y aprueba notas para crear dataset Qwen.'
}

export function formatFineTuneExampleCount(count: number): string {
  return count === 1 ? '1 ejemplo' : `${count} ejemplos`
}

function formatNoteCount(count: number): string {
  return count === 1 ? '1 nota' : `${count} notas`
}
