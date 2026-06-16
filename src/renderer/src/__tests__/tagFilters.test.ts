import { describe, expect, it } from 'vitest'
import { ALL_TAG_FILTER, noteMatchesTagFilter, summarizeTagFilters } from '../tagFilters'
import { NoteRecord } from '../types'

function note(tags: string[]): Pick<NoteRecord, 'tags'> {
  return { tags }
}

describe('summarizeTagFilters', () => {
  it('counts normalized tags once per note and orders by usefulness', () => {
    expect(
      summarizeTagFilters([
        note(['#Cliente', 'cliente', 'RAG']),
        note(['cliente', 'M\u00e9dico']),
        note(['rag'])
      ])
    ).toEqual([
      { filter: ALL_TAG_FILTER, label: 'Todas', count: 3 },
      { filter: 'cliente', label: 'cliente', count: 2 },
      { filter: 'rag', label: 'rag', count: 2 },
      { filter: 'medico', label: 'medico', count: 1 }
    ])
  })

  it('limits visible tag filters while keeping the all option', () => {
    expect(summarizeTagFilters([note(['b']), note(['a']), note(['c'])], 2)).toEqual([
      { filter: ALL_TAG_FILTER, label: 'Todas', count: 3 },
      { filter: 'a', label: 'a', count: 1 },
      { filter: 'b', label: 'b', count: 1 }
    ])
  })
})

describe('noteMatchesTagFilter', () => {
  it('matches accent-insensitive saved tags', () => {
    expect(noteMatchesTagFilter(note(['M\u00e9dico']), 'medico')).toBe(true)
    expect(noteMatchesTagFilter(note(['cliente']), 'rag')).toBe(false)
    expect(noteMatchesTagFilter(note(['cliente']), ALL_TAG_FILTER)).toBe(true)
  })
})
