import { NoteRecord, RagContextItem, RelatedNote } from './types'

const RECIPROCAL_REASON_PREFIX = 'Enlace reciproco:'

const STOPWORDS = new Set([
  'a',
  'al',
  'and',
  'como',
  'con',
  'de',
  'del',
  'desde',
  'el',
  'en',
  'es',
  'esta',
  'este',
  'for',
  'is',
  'la',
  'las',
  'los',
  'mas',
  'notas',
  'of',
  'para',
  'por',
  'proyecto',
  'que',
  'se',
  'sobre',
  'the',
  'to',
  'un',
  'una',
  'usar',
  'y'
])

const MAX_RELATED_NOTES = 6
const MIN_RELATED_SCORE = 0.08
const DEFAULT_RAG_MAX_NOTES = 5
const DEFAULT_RAG_EXCERPT_LENGTH = 550

export interface RagContextOptions {
  maxNotes?: number
  excerptLength?: number
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token))
}

function vector(parts: Array<{ text: string; weight: number }>): Map<string, number> {
  const map = new Map<string, number>()

  for (const part of parts) {
    for (const token of tokens(part.text)) {
      map.set(token, (map.get(token) ?? 0) + part.weight)
    }
  }

  return map
}

function cosine(a: Map<string, number>, b: Map<string, number>, documentFrequency: Map<string, number>, totalDocuments: number): number {
  let dot = 0
  let normA = 0
  let normB = 0

  for (const [token, value] of a) {
    const weighted = value * inverseDocumentFrequency(token, documentFrequency, totalDocuments)
    normA += weighted * weighted
  }

  for (const [token, value] of b) {
    const weighted = value * inverseDocumentFrequency(token, documentFrequency, totalDocuments)
    normB += weighted * weighted
  }

  for (const [token, value] of a) {
    const idf = inverseDocumentFrequency(token, documentFrequency, totalDocuments)
    dot += value * idf * (b.get(token) ?? 0) * idf
  }

  if (!normA || !normB) {
    return 0
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function rankRelatedNotes(
  note: Pick<NoteRecord, 'id' | 'content' | 'tags' | 'category'> & Partial<Pick<NoteRecord, 'title' | 'summary'>>,
  notes: NoteRecord[]
): RelatedNote[] {
  const candidates = notes.filter((candidate) => candidate.id !== note.id)
  const sourceTokens = tokens(sourceText(note))
  const sourceTokenSet = new Set(sourceTokens)
  const sourceBigrams = bigrams(sourceTokens)
  const sourceVector = noteVector(note)
  const candidateVectors = candidates.map((candidate) => ({
    candidate,
    vector: candidateVector(candidate),
    tokens: tokens(candidateText(candidate))
  }))
  const allVectors = [sourceVector, ...candidateVectors.map((item) => item.vector)]
  const documentFrequency = buildDocumentFrequency(allVectors)
  const totalDocuments = allVectors.length

  return candidateVectors
    .map(({ candidate, vector: candidateVectorValue, tokens: candidateTokens }) => {
      const semanticScore = cosine(sourceVector, candidateVectorValue, documentFrequency, totalDocuments)
      const tagOverlap = overlappingTags(note.tags, candidate.tags)
      const sameCategory = note.category === candidate.category && note.category !== 'Inbox'
      const phraseOverlap = intersectionSize(sourceBigrams, bigrams(candidateTokens))
      const titleOverlap = overlapRatio(sourceTokenSet, new Set(tokens(candidate.title)))
      const tagBoost = Math.min(0.22, tagOverlap * 0.11)
      const hasTextSignal = semanticScore > 0.02 || tagOverlap > 0 || phraseOverlap > 0 || titleOverlap > 0
      const categoryBoost = sameCategory && hasTextSignal ? 0.08 : 0
      const phraseBoost = Math.min(0.16, phraseOverlap * 0.04)
      const titleBoost = Math.min(0.08, titleOverlap * 0.08)
      const score = hasTextSignal
        ? Math.min(1, semanticScore * 0.74 + tagBoost + categoryBoost + phraseBoost + titleBoost)
        : 0

      return {
        noteId: candidate.id,
        title: candidate.title,
        score,
        reason: relatedReason({ tagOverlap, sameCategory, phraseOverlap, titleOverlap })
      }
    })
    .filter((candidate) => candidate.score >= MIN_RELATED_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RELATED_NOTES)
}

export function buildRagContext(
  note: Pick<NoteRecord, 'id' | 'content' | 'tags' | 'category'> & Partial<Pick<NoteRecord, 'title' | 'summary'>>,
  notes: NoteRecord[],
  options: RagContextOptions = {}
): string {
  return buildRagContextBundle(note, notes, options).text
}

export function buildRagContextBundle(
  note: Pick<NoteRecord, 'id' | 'content' | 'tags' | 'category'> & Partial<Pick<NoteRecord, 'title' | 'summary'>>,
  notes: NoteRecord[],
  options: RagContextOptions = {}
): {
  text: string
  related: RelatedNote[]
  noteIds: string[]
  items: RagContextItem[]
} {
  const resolvedOptions = normalizeRagContextOptions(options)
  const related = rankRelatedNotes(note, notes).slice(0, resolvedOptions.maxNotes)

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
        excerpt: candidate.content.replace(/\s+/g, ' ').trim().slice(0, resolvedOptions.excerptLength)
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

function normalizeRagContextOptions(options: RagContextOptions): Required<RagContextOptions> {
  return {
    maxNotes: clampInteger(options.maxNotes, 0, MAX_RELATED_NOTES, DEFAULT_RAG_MAX_NOTES),
    excerptLength: clampInteger(options.excerptLength, 160, 1200, DEFAULT_RAG_EXCERPT_LENGTH)
  }
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.round(Number(value))))
}

function noteVector(note: Pick<NoteRecord, 'content' | 'tags' | 'category'> & Partial<Pick<NoteRecord, 'title' | 'summary'>>): Map<string, number> {
  return vector([
    { text: note.title ?? '', weight: 2.4 },
    { text: note.summary ?? '', weight: 1.5 },
    { text: note.content, weight: 1 },
    { text: note.tags.join(' '), weight: 2.2 },
    { text: note.category, weight: 1.1 }
  ])
}

function candidateVector(note: NoteRecord): Map<string, number> {
  return vector([
    { text: note.title, weight: 2.4 },
    { text: note.summary, weight: 1.7 },
    { text: note.content, weight: 1 },
    { text: note.tags.join(' '), weight: 2.2 },
    { text: note.category, weight: 1.1 }
  ])
}

function sourceText(note: Pick<NoteRecord, 'content' | 'tags' | 'category'> & Partial<Pick<NoteRecord, 'title' | 'summary'>>): string {
  return `${note.title ?? ''} ${note.summary ?? ''} ${note.content} ${note.tags.join(' ')} ${note.category}`
}

function candidateText(note: NoteRecord): string {
  return `${note.title} ${note.summary} ${note.content} ${note.tags.join(' ')} ${note.category}`
}

function buildDocumentFrequency(vectors: Array<Map<string, number>>): Map<string, number> {
  const frequencies = new Map<string, number>()

  for (const entry of vectors) {
    for (const token of entry.keys()) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
    }
  }

  return frequencies
}

function inverseDocumentFrequency(token: string, documentFrequency: Map<string, number>, totalDocuments: number): number {
  const appearances = documentFrequency.get(token) ?? 0
  return Math.log((totalDocuments + 1) / (appearances + 1)) + 1
}

function bigrams(values: string[]): Set<string> {
  const result = new Set<string>()

  for (let index = 0; index < values.length - 1; index += 1) {
    result.add(`${values[index]} ${values[index + 1]}`)
  }

  return result
}

function intersectionSize<T>(left: Set<T>, right: Set<T>): number {
  let count = 0

  for (const item of left) {
    if (right.has(item)) {
      count += 1
    }
  }

  return count
}

function overlapRatio(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0
  }

  return intersectionSize(left, right) / Math.min(left.size, right.size)
}

function overlappingTags(sourceTags: string[], candidateTags: string[]): number {
  const candidateSet = new Set(candidateTags.map((tag) => tag.toLowerCase()))
  return sourceTags.filter((tag) => candidateSet.has(tag.toLowerCase())).length
}

function relatedReason(signals: {
  tagOverlap: number
  sameCategory: boolean
  phraseOverlap: number
  titleOverlap: number
}): string {
  if (signals.tagOverlap > 0 && signals.phraseOverlap > 0) {
    return 'Comparte etiquetas, frases y vocabulario relevante.'
  }

  if (signals.tagOverlap > 0) {
    return 'Comparte etiquetas y vocabulario relevante.'
  }

  if (signals.phraseOverlap > 0 || signals.titleOverlap >= 0.4) {
    return 'Comparte frases y conceptos especificos.'
  }

  if (signals.sameCategory) {
    return 'Comparte categoria y vocabulario relevante.'
  }

  return 'Comparte vocabulario relevante.'
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
