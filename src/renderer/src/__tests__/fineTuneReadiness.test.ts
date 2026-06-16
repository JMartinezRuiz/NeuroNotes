import { describe, expect, it } from 'vitest'
import {
  fineTuneExampleQuality,
  fineTuneQualityDetail,
  fineTuneQualityLabel,
  formatFineTuneExampleCount,
  isFineTuneReviewable,
  noteMatchesFineTuneReviewFilter,
  summarizeFineTuneReadiness,
  summarizeFineTuneReviewFilters
} from '../fineTuneReadiness'
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
      qualityCounts: { high: 0, medium: 0, low: 0 },
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
      qualityCounts: { high: 0, medium: 0, low: 2 },
      status: 'ready',
      message: '2 ejemplos listos para JSONL; 1 nota por aprobar.'
    })
  })
})

describe('fineTuneExampleQuality', () => {
  it('scores Qwen examples with stored RAG context as high quality', () => {
    const quality = fineTuneExampleQuality(
      note({
        related: [
          {
            noteId: 'note-2',
            title: 'Arquitectura MCP',
            score: 0.82,
            reason: 'Comparte Qwen y MCP.'
          }
        ],
        suggestedActions: [
          {
            kind: 'task',
            title: 'Probar MCP',
            detail: 'Validar handoff local.',
            confidence: 0.8
          }
        ],
        analysisRun: {
          provider: 'qwen',
          model: 'qwen3.5:0.8b',
          analyzedAt: '2026-06-15T00:01:00.000Z',
          durationMs: 1200,
          ragNoteIds: ['note-2'],
          ragContext: [
            {
              noteId: 'note-2',
              title: 'Arquitectura MCP',
              category: 'Proyecto',
              tags: ['mcp'],
              score: 0.82,
              reason: 'Comparte Qwen y MCP.',
              excerpt: 'Contexto de prueba.'
            }
          ]
        }
      })
    )

    expect(quality).toMatchObject({
      level: 'high',
      score: 1,
      warnings: []
    })
    expect(fineTuneQualityLabel(quality.level)).toBe('Alta')
  })

  it('warns when an example comes from fallback without RAG context', () => {
    const quality = fineTuneExampleQuality(note({ analysisStatus: 'fallback' }))

    expect(quality).toMatchObject({
      level: 'low',
      score: 0.25
    })
    expect(quality.warnings).toContain('Ejemplo basado en fallback local; revisarlo antes de usarlo para ajustar Qwen.')
    expect(quality.warnings).toContain('No incluye contexto RAG ni enlaces relacionados.')
    expect(fineTuneQualityDetail(quality)).toContain('Calidad Baja (25%).')
  })
})

describe('fine-tuning review filters', () => {
  it('matches reviewable notes that still need approval', () => {
    expect(noteMatchesFineTuneReviewFilter(note(), 'pending-review')).toBe(true)
    expect(
      noteMatchesFineTuneReviewFilter(note({ trainingReviewedAt: '2026-06-15T00:01:00.000Z' }), 'pending-review')
    ).toBe(false)
    expect(noteMatchesFineTuneReviewFilter(note({ analysisStatus: 'idle' }), 'pending-review')).toBe(false)
  })

  it('matches notes already approved for dataset export', () => {
    expect(
      noteMatchesFineTuneReviewFilter(note({ trainingReviewedAt: '2026-06-15T00:01:00.000Z' }), 'reviewed')
    ).toBe(true)
    expect(noteMatchesFineTuneReviewFilter(note(), 'reviewed')).toBe(false)
  })

  it('summarizes review filters for the note list', () => {
    expect(
      summarizeFineTuneReviewFilters([
        note(),
        note({ id: 'note-2', trainingReviewedAt: '2026-06-15T00:01:00.000Z' }),
        note({ id: 'note-3', analysisStatus: 'idle' })
      ])
    ).toEqual([
      { filter: 'all', label: 'FT todo', count: 3 },
      { filter: 'pending-review', label: 'Por aprobar', count: 1 },
      { filter: 'reviewed', label: 'Aprob.', count: 1 }
    ])
  })
})

describe('formatFineTuneExampleCount', () => {
  it('formats singular and plural example counts', () => {
    expect(formatFineTuneExampleCount(1)).toBe('1 ejemplo')
    expect(formatFineTuneExampleCount(2)).toBe('2 ejemplos')
  })
})
