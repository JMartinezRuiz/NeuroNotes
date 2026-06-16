import { NoteRecord } from './types'

export type FineTuneReadinessStatus = 'empty' | 'needs-review' | 'ready'
export type FineTuneReviewFilter = 'all' | 'pending-review' | 'reviewed'
export type FineTuneQualityLevel = 'high' | 'medium' | 'low'

export interface FineTuneExampleQuality {
  level: FineTuneQualityLevel
  score: number
  reasons: string[]
  warnings: string[]
}

export interface FineTuneQualityCounts {
  high: number
  medium: number
  low: number
}

export interface FineTuneReadinessSummary {
  reviewedExamples: number
  pendingReviewNotes: number
  reviewableNotes: number
  reviewedQwenExamples: number
  reviewedLocalExamples: number
  qualityCounts: FineTuneQualityCounts
  status: FineTuneReadinessStatus
  message: string
}

export interface FineTuneReviewFilterOption {
  filter: FineTuneReviewFilter
  label: string
  count: number
}

const FINE_TUNE_REVIEW_FILTERS: FineTuneReviewFilter[] = ['all', 'pending-review', 'reviewed']

export function isFineTuneReviewable(note: NoteRecord): boolean {
  if (!note.content.trim() || (note.analysisStatus !== 'qwen' && note.analysisStatus !== 'fallback')) {
    return false
  }

  return Boolean(note.summary.trim() || note.tags.length > 0 || note.related.length > 0 || note.suggestedActions.length > 0)
}

export function summarizeFineTuneReviewFilters(notes: NoteRecord[]): FineTuneReviewFilterOption[] {
  const counts = notes.reduce(
    (summary, note) => {
      summary.all += 1
      if (noteMatchesFineTuneReviewFilter(note, 'pending-review')) {
        summary['pending-review'] += 1
      }
      if (noteMatchesFineTuneReviewFilter(note, 'reviewed')) {
        summary.reviewed += 1
      }
      return summary
    },
    {
      all: 0,
      'pending-review': 0,
      reviewed: 0
    } satisfies Record<FineTuneReviewFilter, number>
  )

  return FINE_TUNE_REVIEW_FILTERS.map((filter) => ({
    filter,
    label: fineTuneReviewFilterLabel(filter),
    count: counts[filter]
  }))
}

export function noteMatchesFineTuneReviewFilter(note: NoteRecord, filter: FineTuneReviewFilter): boolean {
  if (filter === 'pending-review') {
    return isFineTuneReviewable(note) && !note.trainingReviewedAt
  }

  if (filter === 'reviewed') {
    return Boolean(note.trainingReviewedAt)
  }

  return true
}

export function fineTuneReviewFilterLabel(filter: FineTuneReviewFilter): string {
  if (filter === 'pending-review') {
    return 'Por aprobar'
  }

  if (filter === 'reviewed') {
    return 'Aprob.'
  }

  return 'FT todo'
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
    qualityCounts: fineTuneQualityCounts(reviewedNotes),
    status,
    message: fineTuneMessage(status, reviewedExamples, pendingReviewNotes)
  }
}

export function fineTuneExampleQuality(note: NoteRecord): FineTuneExampleQuality {
  const reasons: string[] = []
  const warnings: string[] = []
  let score = 0

  if (note.analysisStatus === 'qwen' && note.analysisRun?.provider === 'qwen') {
    score += 0.35
    reasons.push('Analisis generado por Qwen.')
  } else {
    warnings.push('Ejemplo basado en fallback local; revisarlo antes de usarlo para ajustar Qwen.')
  }

  if (note.analysisRun?.ragContext?.length) {
    score += 0.25
    reasons.push('Incluye contexto RAG auditado.')
  } else if (note.related.length > 0) {
    score += 0.12
    warnings.push('Usa enlaces relacionados como contexto; no hay RAG auditado guardado.')
  } else {
    warnings.push('No incluye contexto RAG ni enlaces relacionados.')
  }

  if (note.summary.trim()) {
    score += 0.15
    reasons.push('Incluye resumen revisable.')
  } else {
    warnings.push('No incluye resumen.')
  }

  if (note.tags.length > 0) {
    score += 0.1
    reasons.push('Incluye etiquetas.')
  } else {
    warnings.push('No incluye etiquetas.')
  }

  if (note.related.length > 0) {
    score += 0.1
    reasons.push('Incluye enlaces a notas relacionadas.')
  }

  if (note.suggestedActions.length > 0) {
    score += 0.05
    reasons.push('Incluye acciones sugeridas.')
  }

  const roundedScore = Math.min(1, Number(score.toFixed(2)))

  return {
    level: roundedScore >= 0.75 ? 'high' : roundedScore >= 0.5 ? 'medium' : 'low',
    score: roundedScore,
    reasons,
    warnings
  }
}

export function fineTuneQualityLabel(level: FineTuneQualityLevel): string {
  if (level === 'high') {
    return 'Alta'
  }

  if (level === 'medium') {
    return 'Media'
  }

  return 'Baja'
}

export function fineTuneQualityDetail(quality: FineTuneExampleQuality): string {
  const reasons = quality.reasons.length ? `Senales: ${quality.reasons.join(' ')}` : 'Sin senales de calidad.'
  const warnings = quality.warnings.length ? `Advertencias: ${quality.warnings.join(' ')}` : 'Sin advertencias.'

  return `Calidad ${fineTuneQualityLabel(quality.level)} (${Math.round(quality.score * 100)}%). ${reasons} ${warnings}`
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

function fineTuneQualityCounts(notes: NoteRecord[]): FineTuneQualityCounts {
  return notes.reduce(
    (counts, note) => {
      counts[fineTuneExampleQuality(note).level] += 1
      return counts
    },
    { high: 0, medium: 0, low: 0 } satisfies FineTuneQualityCounts
  )
}
