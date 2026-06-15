import { describe, expect, it } from 'vitest'
import { noteToMarkdown, safeMarkdownFileName } from '../export'
import { NoteRecord } from '../types'

function note(overrides: Partial<NoteRecord> = {}): NoteRecord {
  const now = '2026-06-15T00:00:00.000Z'

  return {
    id: 'note-1',
    title: 'Roadmap Neuronotes',
    content: 'Crear una app de notas con Qwen local.',
    summary: 'Plan para convertir notas rapidas en una base conectada.',
    category: 'Proyecto',
    tags: ['qwen', 'notas'],
    related: [
      {
        noteId: 'note-2',
        title: 'Interfaz minimalista',
        score: 0.82,
        reason: 'Comparte contexto de producto.'
      }
    ],
    analysisStatus: 'qwen',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

describe('noteToMarkdown', () => {
  it('exports note content, metadata, and related notes', () => {
    const markdown = noteToMarkdown(note())

    expect(markdown).toContain('# Roadmap Neuronotes')
    expect(markdown).toContain('> Plan para convertir notas rapidas en una base conectada.')
    expect(markdown).toContain('- Categoria: Proyecto')
    expect(markdown).toContain('- Etiquetas: #qwen #notas')
    expect(markdown).toContain('## Nota')
    expect(markdown).toContain('Crear una app de notas con Qwen local.')
    expect(markdown).toContain('- Interfaz minimalista: Comparte contexto de producto. (82%)')
  })

  it('uses stable fallbacks when summary, tags, or links are missing', () => {
    const markdown = noteToMarkdown(note({ summary: '', tags: [], related: [] }))

    expect(markdown).toContain('> Sin resumen')
    expect(markdown).toContain('- Etiquetas: Sin etiquetas')
    expect(markdown).toContain('- Sin notas enlazadas')
  })
})

describe('safeMarkdownFileName', () => {
  it('creates a safe markdown filename from arbitrary titles', () => {
    expect(safeMarkdownFileName(' Reunión / Qwen: notas rápidas! ')).toBe('reunion-qwen-notas-rapidas.md')
  })

  it('uses a fallback for empty titles', () => {
    expect(safeMarkdownFileName(' *** ')).toBe('nota-neuronotes.md')
  })
})
