import { describe, expect, it } from 'vitest'
import { formatFineTuneExampleCount, isFineTuneReviewable, summarizeFineTuneReadiness } from '../fineTuneReadiness'
import { NoteRecord } from '../types'

function note(overrides: Partial<NoteRecord> = {}): NoteRecord {
  const now = '2026-06-15T00:00:00.000Z'

  return {
    id: 'note-1',
    title: 'Nota Qwen',
    content: 'Crear una app de notas con Qwen local.',
    summary: 'Resumen generado.',
    category: 'Proyecto',
    tags: ['qwen'],
    related: [],
    suggestedActions: [],
    analysisStatus: 'qwen',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

describe('isFineTuneReviewable', () => {
  it('accepts analyzed notes with useful AI output', () => {
    expect(isFineTuneReviewable(note())).toBe(true)
    expect(isFineTuneReviewable(note({ analysisStatus: 'fallback', summary: '', tags: ['local'] }))).toBe(true)
  })

  it('rejects empty, idle, or output-free notes', () => {
    expect(isFineTuneReviewable(note({ content: '' }))).toBe(false)
    expect(isFineTuneReviewable(note({ analysisStatus: 'idle' }))).toBe(false)
    expect(
      isFineTuneReviewable(
        note({
          summary: '',
          tags: [],
          related: [],
          suggestedActions: []
        })
      )
    ).toBe(false)
  })
})

describe('summarizeFineTuneReadiness', () => {
  it('reports an empty dataset until notes are analyzed and approved', () => {
    const summary = summarizeFineTuneReadiness([note({ analysisStatus: 'idle' })])

    expect(summary).toMatchObject({
      reviewedExamples: 0,
      pendingReviewNotes: 0,
      reviewableNotes: 0,
      status: 'empty',
      message: 'Analiza y aprueba notas para crear dataset Qwen.'
    })
  })

  it('reports analyzed notes that still need user approval', () => {
    const summary = summarizeFineTuneReadiness([note(), note({ id: 'note-2', analysisStatus: 'fallback' })])

    expect(summary).toMatchObject({
      reviewedExamples: 0,
      pendingReviewNotes: 2,
      reviewableNotes: 2,
      status: 'needs-review',
      message: '2 notas listas para aprobar.'
    })
  })

  it('counts reviewed Qwen and local examples ready for JSONL export', () => {
    const summary = summarizeFineTuneReadiness([
      note({ trainingReviewedAt: '2026-06-15T00:01:00.000Z' }),
      note({
        id: 'note-2',
        analysisStatus: 'fallback',
        trainingReviewedAt: '2026-06-15T00:02:00.000Z'
      }),
      note({ id: 'note-3' })
    ])

    expect(summary).toMatchObject({
      reviewedExamples: 2,
      pendingReviewNotes: 1,
      reviewableNotes: 3,
      reviewedQwenExamples: 1,
      reviewedLocalExamples: 1,
      status: 'ready',
      message: '2 ejemplos listos para JSONL; 1 nota por aprobar.'
    })
  })
})

describe('formatFineTuneExampleCount', () => {
  it('formats singular and plural example counts', () => {
    expect(formatFineTuneExampleCount(1)).toBe('1 ejemplo')
    expect(formatFineTuneExampleCount(2)).toBe('2 ejemplos')
  })
})
