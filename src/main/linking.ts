import { NoteRecord, RagContextItem, RelatedNote } from './types'

const RECIPROCAL_REASON_PREFIX = 'Enlace reciproco:'

const STOPWORDS = new Set([
  'a',
  'al',
  'and',
  'con',
  'de',
  'del',
  'el',
  'en',
  'for',
  'is',
  'la',
  'las',
  'los',
  'of',
  'para',
  'por',
  'que',
  'se',
  'the',
  'to',
  'un',
  'una',
  'y'
])

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token))
}

function vector(text: string): Map<string, number> {
  const map = new Map<string, number>()

  for (const token of tokens(text)) {
    map.set(token, (map.get(token) ?? 0) + 1)
  }

  return map
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0
  let normA = 0
  let normB = 0

  for (const value of a.values()) {
    normA += value * value
  }

  for (const value of b.values()) {
    normB += value * value
  }

  for (const [key, value] of a) {
    dot += value * (b.get(key) ?? 0)
  }

  if (!normA || !normB) {
    return 0
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function rankRelatedNotes(note: Pick<NoteRecord, 'id' | 'content' | 'tags' | 'category'>, notes: NoteRecord[]): RelatedNote[] {
  const noteVector = vector(`${note.content} ${note.tags.join(' ')} ${note.category}`)

  return notes
    .filter((candidate) => candidate.id !== note.id)
    .map((candidate) => {
      const candidateVector = vector(
        `${candidate.title} ${candidate.summary} ${candidate.content} ${candidate.tags.join(' ')} ${candidate.category}`
      )
      const semanticScore = cosine(noteVector, candidateVector)
      const tagOverlap = note.tags.filter((tag) => candidate.tags.includes(tag)).length * 0.12
      const categoryBoost = note.category === candidate.category && note.category !== 'Inbox' ? 0.1 : 0
      const score = Math.min(1, semanticScore + tagOverlap + categoryBoost)

      return {
        noteId: candidate.id,
        title: candidate.title,
        score,
        reason: tagOverlap > 0 ? 'Comparte etiquetas y vocabulario cercano.' : 'Comparte vocabulario cercano.'
      }
    })
    .filter((candidate) => candidate.score >= 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
}

export function buildRagContext(note: Pick<NoteRecord, 'id' | 'content' | 'tags' | 'category'>, notes: NoteRecord[]): string {
  return buildRagContextBundle(note, notes).text
}

export function buildRagContextBundle(
  note: Pick<NoteRecord, 'id' | 'content' | 'tags' | 'category'>,
  notes: NoteRecord[]
): {
  text: string
  related: RelatedNote[]
  noteIds: string[]
  items: RagContextItem[]
} {
  const related = rankRelatedNotes(note, notes).slice(0, 5)

  if (related.length === 0) {
    return {
      text: 'No hay notas relacionadas todavia.',
      related,
      noteIds: [],
      items: []
    }
  }

  const items = related
    .map((item): RagContextItem | undefined => {
      const candidate = notes.find((noteItem) => noteItem.id === item.noteId)

      if (!candidate) {
        return undefined
      }

      return {
        noteId: item.noteId,
        title: item.title,
        category: candidate.category,
        tags: candidate.tags,
        score: item.score,
        reason: item.reason,
        excerpt: candidate.content.replace(/\s+/g, ' ').trim().slice(0, 550)
      }
    })
    .filter((item): item is RagContextItem => Boolean(item))

  const text = items
    .map((item) => {
      return `ID: ${item.noteId}\nTitulo: ${item.title}\nCategoria: ${item.category}\nEtiquetas: ${item.tags.join(', ')}\nPuntuacion: ${Math.round(item.score * 100)}%\nMotivo: ${item.reason}\nExtracto: ${item.excerpt}`
    })
    .join('\n\n')

  return {
    text,
    related,
    noteIds: items.map((item) => item.noteId),
    items
  }
}

export function synchronizeRelatedGraph(notes: NoteRecord[], sourceId: string): void {
  const source = notes.find((note) => note.id === sourceId)

  if (!source) {
    return
  }

  source.related = normalizeRelatedLinks(source, notes)
  const sourceDirectLinks = source.related.filter((related) => !isReciprocalLink(related))
  const sourceTargets = new Set(sourceDirectLinks.map((related) => related.noteId))

  for (const note of notes) {
    if (note.id === source.id) {
      continue
    }

    const sourceLink = sourceDirectLinks.find((related) => related.noteId === note.id)
    const existingIndex = note.related.findIndex((related) => related.noteId === source.id)

    if (sourceLink) {
      const reciprocal: RelatedNote = {
        noteId: source.id,
        title: source.title,
        score: Math.max(0.08, Math.min(1, sourceLink.score * 0.9)),
        reason: `${RECIPROCAL_REASON_PREFIX} ${sourceLink.reason}`
      }

      if (existingIndex === -1) {
        note.related = [...note.related, reciprocal]
      } else if (isReciprocalLink(note.related[existingIndex])) {
        note.related[existingIndex] = reciprocal
      } else {
        note.related[existingIndex] = {
          ...note.related[existingIndex],
          title: source.title,
          score: Math.max(note.related[existingIndex].score, reciprocal.score)
        }
      }
    } else if (existingIndex !== -1 && isReciprocalLink(note.related[existingIndex]) && !sourceTargets.has(note.id)) {
      note.related = note.related.filter((related) => related.noteId !== source.id)
    }

    note.related = normalizeRelatedLinks(note, notes)
  }
}

function normalizeRelatedLinks(note: NoteRecord, notes: NoteRecord[]): RelatedNote[] {
  const byId = new Map<string, RelatedNote>()

  for (const related of note.related) {
    const target = notes.find((candidate) => candidate.id === related.noteId)

    if (!target || target.id === note.id) {
      continue
    }

    const normalized: RelatedNote = {
      noteId: target.id,
      title: target.title,
      score: Math.max(0, Math.min(1, Number.isFinite(related.score) ? related.score : 0)),
      reason: related.reason.trim() || 'Relacion detectada por Neuronotes.'
    }
    const existing = byId.get(target.id)

    if (!existing || normalized.score > existing.score) {
      byId.set(target.id, normalized)
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, 10)
}

function isReciprocalLink(link: RelatedNote): boolean {
  return link.reason.startsWith(RECIPROCAL_REASON_PREFIX)
}
