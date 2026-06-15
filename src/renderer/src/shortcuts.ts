import { AppCommand } from './types'

export interface KeyboardShortcutInput {
  altKey: boolean
  ctrlKey: boolean
  key: string
  metaKey: boolean
  shiftKey: boolean
}

export function commandFromKeyboardShortcut(input: KeyboardShortcutInput): AppCommand | undefined {
  const primary = input.ctrlKey || input.metaKey

  if (!primary || input.altKey) {
    return undefined
  }

  const key = input.key.toLowerCase()

  if (!input.shiftKey && key === 'n') {
    return 'focus-capture'
  }

  if (!input.shiftKey && key === 'f') {
    return 'focus-search'
  }

  if (!input.shiftKey && key === 's') {
    return 'save-note'
  }

  if (!input.shiftKey && input.key === 'Enter') {
    return 'analyze-note'
  }

  if (input.shiftKey && key === 'e') {
    return 'export-markdown'
  }

  if (!input.shiftKey && key === '1') {
    return 'view-note'
  }

  if (!input.shiftKey && key === '2') {
    return 'view-network'
  }

  if (!input.shiftKey && key === '3') {
    return 'view-plan'
  }

  if (!input.shiftKey && input.key === ',') {
    return 'toggle-settings'
  }

  return undefined
}
