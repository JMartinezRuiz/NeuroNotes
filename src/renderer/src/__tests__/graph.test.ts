import { describe, expect, it } from 'vitest'
import { graphConnections, graphEdges } from '../graph'
import { NoteRecord } from '../types'

function note(overrides: Partial<NoteRecord> & Pick<NoteRecord, 'id'>): NoteRecord {
  const now = '2026-06-15T00:00:00.000Z'
  const { id, ...rest } = overrides

  return {
    id,
    title: id,
    content: '',
    summary: '',
    category: 'Inbox',
    tags: [],
    related: [],
    analysisStatus: 'idle',
    createdAt: now,
    updatedAt: now,
    ...rest
  }
}

describe('graphConnections', () => {
  it('combines direct links and backlinks around the selected note', () => {
    const selected = note({
      id: 'selected',
      related: [
        {
          noteId: 'direct',
          title: 'Direct',
          score: 0.7,
          reason: 'Relacion directa'
        }
      ]
    })
    const direct = note({ id: 'direct' })
    const backlink = note({
      id: 'backlink',
      related: [
        {
          noteId: 'selected',
          title: 'Selected',
          score: 0.6,
          reason: 'Backlink'
        }
      ]
    })

    expect(graphConnections(selected, [selected, direct, backlink])).toEqual([
      expect.objectContaining({
        note: direct,
        direction: 'direct'
      }),
      expect.objectContaining({
        note: backlink,
        direction: 'backlink'
      })
    ])
  })

  it('marks mutual links as both and keeps the stronger score', () => {
    const selected = note({
      id: 'selected',
      related: [
        {
          noteId: 'mutual',
          title: 'Mutual',
          score: 0.5,
          reason: 'Directa'
        }
      ]
    })
    const mutual = note({
      id: 'mutual',
      related: [
        {
          noteId: 'selected',
          title: 'Selected',
          score: 0.9,
          reason: 'Reciproca'
        }
      ]
    })

    expect(graphConnections(selected, [selected, mutual])).toEqual([
      expect.objectContaining({
        note: mutual,
        direction: 'both',
        score: 0.9
      })
    ])
  })
})

describe('graphEdges', () => {
  it('deduplicates reciprocal edges between the same two notes', () => {
    const first = note({
      id: 'first',
      related: [
        {
          noteId: 'second',
          title: 'Second',
          score: 0.8,
          reason: 'Comparten tema'
        }
      ]
    })
    const second = note({
      id: 'second',
      related: [
        {
          noteId: 'first',
          title: 'First',
          score: 0.72,
          reason: 'Enlace reciproco: Comparten tema'
        }
      ]
    })

    expect(graphEdges([first, second])).toEqual([
      expect.objectContaining({
        id: 'first::second',
        sourceId: 'first',
        targetId: 'second',
        score: 0.8
      })
    ])
  })
})
