import { describe, expect, it } from 'vitest'
import {
  AnalysisStatusFilter,
  analysisStatusFilterLabel,
  noteMatchesAnalysisStatusFilter,
  summarizeAnalysisStatusFilters
} from '../analysisFilters'
import { AnalysisStatus } from '../types'

const note = (analysisStatus: AnalysisStatus): { analysisStatus: AnalysisStatus } => ({ analysisStatus })

describe('analysis status filters', () => {
  it('summarizes note counts by AI analysis status', () => {
    expect(
      summarizeAnalysisStatusFilters([note('qwen'), note('fallback'), note('fallback'), note('idle'), note('error')])
    ).toEqual([
      { filter: 'all', label: 'Todo', count: 5 },
      { filter: 'qwen', label: 'Qwen', count: 1 },
      { filter: 'fallback', label: 'Local', count: 2 },
      { filter: 'idle', label: 'Pend.', count: 1 },
      { filter: 'error', label: 'Error', count: 1 }
    ])
  })

  it('matches notes against the active status filter', () => {
    expect(noteMatchesAnalysisStatusFilter(note('qwen'), 'all')).toBe(true)
    expect(noteMatchesAnalysisStatusFilter(note('qwen'), 'qwen')).toBe(true)
    expect(noteMatchesAnalysisStatusFilter(note('fallback'), 'qwen')).toBe(false)
    expect(noteMatchesAnalysisStatusFilter(note('idle'), 'idle')).toBe(true)
  })

  it('labels all supported status filters', () => {
    const labels = new Map<AnalysisStatusFilter, string>([
      ['all', 'Todo'],
      ['qwen', 'Qwen'],
      ['fallback', 'Local'],
      ['idle', 'Pend.'],
      ['error', 'Error']
    ])

    for (const [filter, label] of labels) {
      expect(analysisStatusFilterLabel(filter)).toBe(label)
    }
  })
})
