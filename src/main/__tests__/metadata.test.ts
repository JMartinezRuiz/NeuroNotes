import { describe, expect, it } from 'vitest'
import { normalizeNoteCategory, normalizeNoteTags } from '../metadata'

describe('normalizeNoteCategory', () => {
  it('normalizes known categories case-insensitively', () => {
    expect(normalizeNoteCategory(' proyecto ')).toBe('Proyecto')
  })

  it('keeps custom categories when the user provides one', () => {
    expect(normalizeNoteCategory('Investigacion')).toBe('Investigacion')
  })

  it('falls back to Inbox for invalid categories', () => {
    expect(normalizeNoteCategory('')).toBe('Inbox')
    expect(normalizeNoteCategory(undefined)).toBe('Inbox')
  })
})

describe('normalizeNoteTags', () => {
  it('normalizes comma and hash separated tags', () => {
    expect(normalizeNoteTags(['#Qwen', 'rag, producto', 'qwen', '  Notas  ', 'm\u00e9dico, ma\u00f1ana'])).toEqual([
      'qwen',
      'rag',
      'producto',
      'notas',
      'medico',
      'manana'
    ])
  })

  it('ignores non-string tags and limits the result', () => {
    expect(normalizeNoteTags(['a', 1, 'b', null, 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'])).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
      'j'
    ])
  })
})
