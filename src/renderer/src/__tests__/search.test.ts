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

  it('returns false when the query is not present', () => {
    expect(noteMatchesSearch(note(), 'finanzas')).toBe(false)
  })
})
