import { describe, expect, it } from 'vitest'
import { normalizeSearchText, noteMatchesSearch } from '../search'
import { NoteRecord } from '../types'

function note(overrides: Partial<NoteRecord> = {}): NoteRecord {
  const now = '2026-06-15T00:00:00.000Z'

  return {
    id: 'note-1',
    title: 'Cita m\u00e9dica',
    content: 'Recordar reuni\u00f3n ma\u00f1ana sobre salud.',
    summary: 'Seguimiento de salud.',
    category: 'Salud',
    tags: ['medico', 'manana'],
    related: [],
    suggestedActions: [],
    analysisStatus: 'fallback',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

describe('normalizeSearchText', () => {
  it('normalizes accents and case', () => {
    expect(normalizeSearchText('M\u00e9DICO Ma\u00f1ana')).toBe('medico manana')
  })
})

describe('noteMatchesSearch', () => {
  it('matches notes regardless of Spanish accents', () => {
    const source = note()

    expect(noteMatchesSearch(source, 'medica')).toBe(true)
    expect(noteMatchesSearch(source, 'reunion manana')).toBe(true)
    expect(noteMatchesSearch(source, 'salud')).toBe(true)
  })

  it('matches normalized tags', () => {
    expect(noteMatchesSearch(note({ tags: ['accion', 'medico'] }), 'm\u00e9dico')).toBe(true)
  })

  it('matches AI-generated actions, related notes, and stored RAG audit context', () => {
    const source = note({
      related: [
        {
          noteId: 'roadmap',
          title: 'Roadmap Neuronotes',
          score: 0.82,
          reason: 'Ambas notas tratan MCP local.'
        }
      ],
      suggestedActions: [
        {
          kind: 'reminder',
          title: 'Crear seguimiento',
          detail: 'La nota pide agendar un recordatorio.',
          toolHint: 'reminder.create',
          confidence: 0.79
        }
      ],
      analysisRun: {
        provider: 'qwen',
        model: 'qwen3.5:0.8b',
        analyzedAt: '2026-06-15T00:01:00.000Z',
        durationMs: 900,
        ragNoteIds: ['rag-context'],
        ragContext: [
          {
            noteId: 'rag-context',
            title: 'Contexto RAG local',
            category: 'Proyecto',
            tags: ['qwen', 'rag'],
            score: 0.74,
            reason: 'Contexto recuperado por RAG local.',
            excerpt: 'Neuronotes usa Qwen 0.8B para enlazar notas.'
          }
        ]
      }
    })

    expect(noteMatchesSearch(source, 'reminder.create')).toBe(true)
    expect(noteMatchesSearch(source, 'roadmap mcp')).toBe(true)
    expect(noteMatchesSearch(source, 'contexto rag qwen')).toBe(true)
  })

  it('returns false when the query is not present', () => {
    expect(noteMatchesSearch(note(), 'finanzas')).toBe(false)
  })
})
