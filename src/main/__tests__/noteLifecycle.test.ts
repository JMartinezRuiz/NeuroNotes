import { describe, expect, it } from 'vitest'
import { canApplyAnalysisResult, hasContentChanged, isManualRelatedLink, resetAnalysisAfterContentEdit } from '../noteLifecycle'
import { NoteRecord } from '../types'

function note(overrides: Partial<NoteRecord> = {}): NoteRecord {
  const now = '2026-06-15T00:00:00.000Z'

  return {
    id: 'note-1',
    title: 'Nota editada',
    content: 'Contenido nuevo',
    summary: 'Resumen anterior generado por IA.',
    category: 'Proyecto',
    tags: ['qwen'],
    related: [
      {
        noteId: 'manual',
        title: 'Enlace manual',
        score: 0.72,
        reason: 'Enlace manual.'
      },
      {
        noteId: 'automatic',
        title: 'Enlace automatico',
        score: 0.91,
        reason: 'Comparte vocabulario relevante.'
      },
      {
        noteId: 'manual-backlink',
        title: 'Backlink manual',
        score: 0.65,
        reason: 'Enlace reciproco: Enlace manual.'
      },
      {
        noteId: 'automatic-backlink',
        title: 'Backlink automatico',
        score: 0.6,
        reason: 'Enlace reciproco: Comparte vocabulario relevante.'
      }
    ],
    suggestedActions: [
      {
        kind: 'task',
        title: 'Accion vieja',
        detail: 'Depende del contenido anterior.',
        confidence: 0.7
      }
    ],
    analysisStatus: 'qwen',
    analysisRun: {
      provider: 'qwen',
      model: 'qwen3.5:0.8b',
      analyzedAt: now,
      durationMs: 1000,
      ragNoteIds: ['automatic']
    },
    trainingReviewedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

describe('resetAnalysisAfterContentEdit', () => {
  it('clears stale AI output and keeps manual links', () => {
    const source = note()

    resetAnalysisAfterContentEdit(source)

    expect(source).toMatchObject({
      summary: '',
      suggestedActions: [],
      analysisStatus: 'idle',
      analysisError: undefined,
      analysisRun: undefined,
      trainingReviewedAt: undefined
    })
    expect(source.related.map((related) => related.noteId)).toEqual(['manual', 'manual-backlink'])
    expect(source.category).toBe('Proyecto')
    expect(source.tags).toEqual(['qwen'])
  })
})

describe('isManualRelatedLink', () => {
  it('recognizes direct and reciprocal manual links', () => {
    expect(isManualRelatedLink({ noteId: 'a', title: 'A', score: 1, reason: 'Enlace manual.' })).toBe(true)
    expect(isManualRelatedLink({ noteId: 'a', title: 'A', score: 1, reason: 'Enlace reciproco: Enlace manual.' })).toBe(true)
    expect(isManualRelatedLink({ noteId: 'a', title: 'A', score: 1, reason: 'Enlace reciproco: Comparte vocabulario.' })).toBe(false)
  })
})

describe('hasContentChanged', () => {
  it('ignores unchanged saved content when title or metadata updates resend the editor body', () => {
    const source = note({ content: 'Contenido estable' })

    expect(hasContentChanged(source, 'Contenido estable')).toBe(false)
    expect(hasContentChanged(source, '  Contenido estable  ')).toBe(false)
  })

  it('detects meaningful content edits that must invalidate stale AI output', () => {
    const source = note({ content: 'Contenido estable' })

    expect(hasContentChanged(source, 'Contenido estable con una idea nueva')).toBe(true)
  })
})

describe('canApplyAnalysisResult', () => {
  it('allows applying analysis when the note has not changed', () => {
    const source = note()
    const current = note()

    expect(canApplyAnalysisResult(current, source)).toBe(true)
  })

  it('rejects stale analysis when content or updatedAt changed', () => {
    const source = note()

    expect(canApplyAnalysisResult(note({ content: 'Contenido editado' }), source)).toBe(false)
    expect(canApplyAnalysisResult(note({ updatedAt: '2026-06-15T00:01:00.000Z' }), source)).toBe(false)
  })
})
