import { describe, expect, it } from 'vitest'
import { commandFromKeyboardShortcut } from '../shortcuts'

const shortcut = (key: string, overrides: Partial<Parameters<typeof commandFromKeyboardShortcut>[0]> = {}) =>
  commandFromKeyboardShortcut({
    altKey: false,
    ctrlKey: true,
    key,
    metaKey: false,
    shiftKey: false,
    ...overrides
  })

describe('commandFromKeyboardShortcut', () => {
  it('maps desktop note commands to app commands', () => {
    expect(shortcut('n')).toBe('focus-capture')
    expect(shortcut('f')).toBe('focus-search')
    expect(shortcut('s')).toBe('save-note')
    expect(shortcut('Enter')).toBe('analyze-note')
    expect(shortcut('e', { shiftKey: true })).toBe('export-markdown')
  })

  it('maps view and settings shortcuts', () => {
    expect(shortcut('1')).toBe('view-note')
    expect(shortcut('2')).toBe('view-network')
    expect(shortcut('3')).toBe('view-plan')
    expect(shortcut(',')).toBe('toggle-settings')
  })

  it('ignores non-primary and alt-modified shortcuts', () => {
    expect(shortcut('n', { ctrlKey: false })).toBeUndefined()
    expect(shortcut('n', { altKey: true })).toBeUndefined()
  })
})
