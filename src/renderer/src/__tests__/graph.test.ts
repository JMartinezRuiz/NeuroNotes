import { describe, expect, it } from 'vitest'
import { graphConnections, graphEdges, graphIsolatedNotes } from '../graph'
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
    suggestedActions: [],
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

describe('graphIsolatedNotes', () => {
  it('finds notes without valid direct links or backlinks', () => {
    const linked = note({
      id: 'linked',
      related: [
        {
          noteId: 'target',
          title: 'Target',
          score: 0.8,
          reason: 'Relacion valida'
        }
      ],
      updatedAt: '2026-06-15T00:01:00.000Z'
    })
    const target = note({
      id: 'target',
      updatedAt: '2026-06-15T00:02:00.000Z'
    })
    const isolated = note({
      id: 'isolated',
      updatedAt: '2026-06-15T00:03:00.000Z'
    })
    const stale = note({
      id: 'stale',
      related: [
        {
          noteId: 'missing',
          title: 'Missing',
          score: 0.7,
          reason: 'Referencia stale'
        },
        {
          noteId: 'stale',
          title: 'Self',
          score: 1,
          reason: 'Self link'
        }
      ],
      updatedAt: '2026-06-15T00:04:00.000Z'
    })

    expect(graphIsolatedNotes([linked, target, isolated, stale]).map((item) => item.id)).toEqual([
      'stale',
      'isolated'
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
