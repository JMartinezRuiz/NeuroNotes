import { normalizeSearchText } from './search'
import { NoteRecord } from './types'

export const ALL_TAG_FILTER = '__all_tags__'
export type TagFilter = typeof ALL_TAG_FILTER | string

export interface TagFilterOption {
  filter: TagFilter
  label: string
  count: number
}

export function summarizeTagFilters(notes: Pick<NoteRecord, 'tags'>[], maxTags = 14): TagFilterOption[] {
  const counts = new Map<string, { label: string; noteIds: Set<number> }>()

  notes.forEach((note, noteIndex) => {
    for (const rawTag of note.tags) {
      const tag = normalizeTag(rawTag)

      if (!tag) {
        continue
      }

      const entry = counts.get(tag) ?? {
        label: tag,
        noteIds: new Set<number>()
      }
      entry.noteIds.add(noteIndex)
      counts.set(tag, entry)
    }
  })

  const tagOptions = [...counts.entries()]
    .map(([filter, entry]) => ({
      filter,
      label: entry.label,
      count: entry.noteIds.size
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, maxTags)

  return [{ filter: ALL_TAG_FILTER, label: 'Todas', count: notes.length }, ...tagOptions]
}

export function noteMatchesTagFilter(note: Pick<NoteRecord, 'tags'>, filter: TagFilter): boolean {
  if (filter === ALL_TAG_FILTER) {
    return true
  }

  return note.tags.some((tag) => normalizeTag(tag) === filter)
}

function normalizeTag(value: string): string {
  return normalizeSearchText(value).trim().replace(/^#/, '')
}
