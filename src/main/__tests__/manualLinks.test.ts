import { describe, expect, it } from 'vitest'
import { addManualLink, removeManualLink } from '../manualLinks'
import { NoteRecord } from '../types'

function note(id: string): NoteRecord {
  const now = '2026-06-15T00:00:00.000Z'

  return {
    id,
    title: id,
    content: `Contenido ${id}`,
    summary: '',
    category: 'Inbox',
    tags: [],
    related: [],
    analysisStatus: 'idle',
    createdAt: now,
    updatedAt: now
  }
}

describe('manual links', () => {
  it('adds a manual link and a reciprocal link', () => {
    const source = note('source')
    const target = note('target')
    const notes = [source, target]

    addManualLink(notes, source.id, target.id)

    expect(source.related).toEqual([
      expect.objectContaining({
        noteId: target.id,
        title: target.title,
        reason: 'Enlace manual.'
      })
    ])
    expect(target.related).toEqual([
      expect.objectContaining({
        noteId: source.id,
        reason: 'Enlace reciproco: Enlace manual.'
      })
    ])
  })

  it('removes both visible sides of a link', () => {
    const source = note('source')
    const target = note('target')
    const notes = [source, target]

    addManualLink(notes, source.id, target.id)
    removeManualLink(notes, source.id, target.id)

    expect(source.related).toEqual([])
    expect(target.related).toEqual([])
  })

  it('rejects self links', () => {
    const source = note('source')

    expect(() => addManualLink([source], source.id, source.id)).toThrow('No se puede enlazar')
  })
})
