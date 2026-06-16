import { describe, expect, it } from 'vitest'
import { previewRagContextForNote } from '../ragPreview'
import { DatabaseFile, NoteRecord } from '../types'

function note(overrides: Partial<NoteRecord> & Pick<NoteRecord, 'id' | 'content'>): NoteRecord {
  const now = '2026-06-15T00:00:00.000Z'

  return {
    title: overrides.id,
    summary: '',
    category: 'Inbox',
    tags: [],
    related: [],
    suggestedActions: [],
    analysisStatus: 'idle',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

function database(notes: NoteRecord[]): DatabaseFile {
  return {
    version: 1,
    notes,
    actions: [],
    settings: {
      model: 'qwen3.5:0.8b',
      ollamaUrl: 'http://127.0.0.1:11434',
      autoAnalyze: true,
      ragMaxNotes: 1,
      ragExcerptLength: 160
    }
  }
}

describe('previewRagContextForNote', () => {
  it('returns a read-only RAG preview using current settings', () => {
    const source = note({
      id: 'source',
      title: 'Nota fuente',
      category: 'Proyecto',
      tags: ['qwen'],
      content: 'Qwen necesita contexto RAG local para resumir notas relacionadas.'
    })
    const related = note({
      id: 'related',
      title: 'Contexto cercano',
      category: 'Proyecto',
      tags: ['qwen'],
      content: 'Contexto recuperado para Qwen con extractos locales y enlaces auditables.'
    })
    const store = database([source, related])
    const before = JSON.stringify(store)

    const preview = previewRagContextForNote(store, source.id)

    expect(preview).toMatchObject({
      schema: 'neuronotes.rag-preview.v1',
      noteId: 'source',
      model: 'qwen3.5:0.8b',
      ragMaxNotes: 1,
      ragExcerptLength: 160,
      noteIds: ['related']
    })
    expect(preview.items).toHaveLength(1)
    expect(preview.items[0]).toMatchObject({
      noteId: 'related',
      title: 'Contexto cercano',
      category: 'Proyecto',
      tags: ['qwen']
    })
    expect(preview.items[0].excerpt.length).toBeLessThanOrEqual(160)
    expect(preview.text).toContain('ID: related')
    expect(JSON.stringify(store)).toBe(before)
  })

  it('throws when the note does not exist', () => {
    expect(() => previewRagContextForNote(database([]), 'missing')).toThrow('Nota no encontrada')
  })
})
