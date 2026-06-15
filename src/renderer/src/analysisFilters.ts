import { AnalysisStatus, NoteRecord } from './types'

export type AnalysisStatusFilter = 'all' | AnalysisStatus

export interface AnalysisStatusFilterOption {
  filter: AnalysisStatusFilter
  label: string
  count: number
}

const ANALYSIS_STATUS_FILTERS: AnalysisStatusFilter[] = ['all', 'qwen', 'fallback', 'idle', 'error']

export function summarizeAnalysisStatusFilters(notes: Pick<NoteRecord, 'analysisStatus'>[]): AnalysisStatusFilterOption[] {
  const counts = notes.reduce(
    (summary, note) => {
      summary[note.analysisStatus] += 1
      return summary
    },
    {
      all: notes.length,
      idle: 0,
      qwen: 0,
      fallback: 0,
      error: 0
    } satisfies Record<AnalysisStatusFilter, number>
  )

  return ANALYSIS_STATUS_FILTERS.map((filter) => ({
    filter,
    label: analysisStatusFilterLabel(filter),
    count: counts[filter]
  }))
}

export function noteMatchesAnalysisStatusFilter(
  note: Pick<NoteRecord, 'analysisStatus'>,
  filter: AnalysisStatusFilter
): boolean {
  return filter === 'all' || note.analysisStatus === filter
}

export function analysisStatusFilterLabel(filter: AnalysisStatusFilter): string {
  if (filter === 'qwen') {
    return 'Qwen'
  }

  if (filter === 'fallback') {
    return 'Local'
  }

  if (filter === 'idle') {
    return 'Pend.'
  }

  if (filter === 'error') {
    return 'Error'
  }

  return 'Todo'
}
