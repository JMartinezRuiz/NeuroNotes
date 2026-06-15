import { NOTE_CATEGORIES } from './types'

export function normalizeNoteCategory(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Inbox'
  }

  const trimmed = value.trim()
  return NOTE_CATEGORIES.find((category) => category.toLowerCase() === trimmed.toLowerCase()) ?? trimmed
}

export function normalizeNoteTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .filter((tag): tag is string => typeof tag === 'string')
        .flatMap((tag) => tag.split(/[,#]/))
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 10)
}
