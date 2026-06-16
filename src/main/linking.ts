import { NoteRecord, RagContextItem, RelatedNote } from './types'

const RECIPROCAL_REASON_PREFIX = 'Enlace reciproco:'
const MANUAL_LINK_REASON = 'Enlace manual.'
const MANUAL_RECIPROCAL_REASON = 'Enlace reciproco: Enlace manual.'

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

const CONCEPT_ALIASES = new Map<string, string>([
  ['qwen', 'concept:local-ai'],
  ['ollama', 'concept:local-ai'],
  ['llm', 'concept:local-ai'],
  ['ia', 'concept:local-ai'],
  ['rag', 'concept:rag'],
  ['retrieval', 'concept:rag'],
  ['contexto', 'concept:rag'],
  ['recuperacion', 'concept:rag'],
  ['recuperado', 'concept:rag'],
  ['enlace', 'concept:rag'],
  ['enlaces', 'concept:rag'],
  ['enlazar', 'concept:rag'],
  ['conectar', 'concept:rag'],
  ['conexion', 'concept:rag'],
  ['conexiones', 'concept:rag'],
  ['grafo', 'concept:rag'],
  ['mcp', 'concept:mcp'],
  ['handoff', 'concept:mcp'],
  ['herramienta', 'concept:mcp'],
  ['herramientas', 'concept:mcp'],
  ['tool', 'concept:mcp'],
  ['tools', 'concept:mcp'],
  ['workflow', 'concept:mcp'],
  ['automatizacion', 'concept:mcp'],
  ['automatizar', 'concept:mcp'],
  ['tarea', 'concept:task'],
  ['tareas', 'concept:task'],
  ['task', 'concept:task'],
  ['todo', 'concept:task'],
  ['pendiente', 'concept:task'],
  ['pendientes', 'concept:task'],
  ['recordar', 'concept:reminder'],
  ['recordatorio', 'concept:reminder'],
  ['reminder', 'concept:reminder'],
  ['alerta', 'concept:reminder'],
  ['reunion', 'concept:meeting'],
  ['junta', 'concept:meeting'],
  ['meeting', 'concept:meeting'],
  ['cliente', 'concept:client'],
  ['customer', 'concept:client'],
  ['medico', 'concept:health'],
  ['medica', 'concept:health'],
  ['doctor', 'concept:health'],
  ['consulta', 'concept:health'],
  ['salud', 'concept:health'],
  ['wellness', 'concept:health'],
  ['bienestar', 'concept:health'],
  ['factura', 'concept:finance'],
  ['facturas', 'concept:finance'],
  ['pago', 'concept:finance'],
  ['pagos', 'concept:finance'],
  ['presupuesto', 'concept:finance'],
  ['gasto', 'concept:finance'],
  ['gastos', 'concept:finance'],
  ['dinero', 'concept:finance'],
  ['finanzas', 'concept:finance'],
  ['finance', 'concept:finance'],
  ['curso', 'concept:learning'],
  ['libro', 'concept:learning'],
  ['aprender', 'concept:learning'],
  ['estudiar', 'concept:learning'],
  ['investigar', 'concept:learning'],
  ['paper', 'concept:learning'],
  ['fuente', 'concept:learning'],
  ['study', 'concept:learning'],
  ['learning', 'concept:learning'],
  ['app', 'concept:product'],
  ['aplicacion', 'concept:product'],
  ['producto', 'concept:product'],
  ['product', 'concept:product'],
  ['feature', 'concept:product'],
  ['roadmap', 'concept:product']
])

export interface RagContextOptions {
  maxNotes?: number
  excerptLength?: number
}

type RagSourceNote = Pick<NoteRecord, 'id' | 'content' | 'tags' | 'category'> &
  Partial<Pick<NoteRecord, 'title' | 'summary' | 'related'>>

function lexicalTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token))
}

function tokens(text: string): string[] {
  return lexicalTokens(text)
    .flatMap(expandConceptTokens)
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
  note: RagSourceNote,
  notes: NoteRecord[]
): RelatedNote[] {
  const candidates = notes.filter((candidate) => candidate.id !== note.id)
  const sourceTokens = tokens(sourceText(note))
  const sourceLexicalTokens = lexicalTokens(sourceText(note))
  const sourceTokenSet = new Set(sourceLexicalTokens)
  const sourceConcepts = conceptSet(sourceTokens)
  const sourceBigrams = bigrams(sourceLexicalTokens)
  const sourceVector = noteVector(note)
  const candidateVectors = candidates.map((candidate) => ({
    candidate,
    vector: candidateVector(candidate),
    tokens: tokens(candidateText(candidate)),
    lexicalTokens: lexicalTokens(candidateText(candidate))
  }))
  const allVectors = [sourceVector, ...candidateVectors.map((item) => item.vector)]
  const documentFrequency = buildDocumentFrequency(allVectors)
  const totalDocuments = allVectors.length

  return candidateVectors
    .map(({ candidate, vector: candidateVectorValue, tokens: candidateTokens, lexicalTokens: candidateLexicalTokens }) => {
      const semanticScore = cosine(sourceVector, candidateVectorValue, documentFrequency, totalDocuments)
      const tagOverlap = overlappingTags(note.tags, candidate.tags)
      const sameCategory = note.category === candidate.category && note.category !== 'Inbox'
      const phraseOverlap = intersectionSize(sourceBigrams, bigrams(candidateLexicalTokens))
      const titleOverlap = overlapRatio(sourceTokenSet, new Set(lexicalTokens(candidate.title)))
      const conceptOverlap = intersectionSize(sourceConcepts, conceptSet(candidateTokens))
      const tagBoost = Math.min(0.22, tagOverlap * 0.11)
      const conceptBoost = Math.min(0.18, conceptOverlap * 0.06)
      const hasTextSignal =
        semanticScore > 0.02 || tagOverlap > 0 || phraseOverlap > 0 || titleOverlap > 0 || conceptOverlap > 0
      const categoryBoost = sameCategory && hasTextSignal ? 0.08 : 0
      const phraseBoost = Math.min(0.16, phraseOverlap * 0.04)
      const titleBoost = Math.min(0.08, titleOverlap * 0.08)
      const score = hasTextSignal
        ? Math.min(1, semanticScore * 0.68 + tagBoost + conceptBoost + categoryBoost + phraseBoost + titleBoost)
        : 0

      return {
        noteId: candidate.id,
        title: candidate.title,
        score,
        reason: relatedReason({ tagOverlap, sameCategory, phraseOverlap, titleOverlap, conceptOverlap })
      }
    })
    .filter((candidate) => candidate.score >= MIN_RELATED_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RELATED_NOTES)
}

export function buildRagContext(
  note: RagSourceNote,
  notes: NoteRecord[],
  options: RagContextOptions = {}
): string {
  return buildRagContextBundle(note, notes, options).text
}

export function buildRagContextBundle(
  note: RagSourceNote,
  notes: NoteRecord[],
  options: RagContextOptions = {}
): {
  text: string
  related: RelatedNote[]
  noteIds: string[]
  items: RagContextItem[]
} {
  const resolvedOptions = normalizeRagContextOptions(options)
  const related = mergeManualAndRankedRelated(note, notes, rankRelatedNotes(note, notes)).slice(
    0,
    resolvedOptions.maxNotes
  )

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

function mergeManualAndRankedRelated(note: RagSourceNote, notes: NoteRecord[], ranked: RelatedNote[]): RelatedNote[] {
  const byId = new Map<string, RelatedNote>()

  for (const link of note.related ?? []) {
    if (!isManualContextLink(link)) {
      continue
    }

    const target = notes.find((candidate) => candidate.id === link.noteId && candidate.id !== note.id)

    if (!target) {
      continue
    }

    byId.set(target.id, {
      noteId: target.id,
      title: target.title,
      score: Math.max(0, Math.min(1, Number.isFinite(link.score) ? link.score : 0.72)),
      reason: link.reason
    })
  }

  for (const link of ranked) {
    const existing = byId.get(link.noteId)

    if (existing) {
      byId.set(link.noteId, {
        ...existing,
        title: link.title || existing.title,
        score: Math.max(existing.score, link.score)
      })
      continue
    }

    byId.set(link.noteId, link)
  }

  return [...byId.values()]
}

function isManualContextLink(link: RelatedNote): boolean {
  return link.reason === MANUAL_LINK_REASON || link.reason === MANUAL_RECIPROCAL_REASON
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

function expandConceptTokens(token: string): string[] {
  const concept = CONCEPT_ALIASES.get(token)
  return concept ? [token, concept] : [token]
}

function conceptSet(values: string[]): Set<string> {
  return new Set(values.filter((token) => token.startsWith('concept:')))
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
  conceptOverlap: number
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

  if (signals.conceptOverlap > 0) {
    return 'Comparte conceptos equivalentes y vocabulario relevante.'
  }

  if (signals.sameCategory) {
    return 'Comparte categoria y vocabulario relevante.'
  }

  return 'Comparte vocabulario relevante.'
}

export function synchronizeRelatedGraph(notes: NoteRecord[], sourceId: string, now = new Date().toISOString()): string[] {
  const source = notes.find((note) => note.id === sourceId)

  if (!source) {
    return []
  }

  const changedIds = new Set<string>()
  const sourceBefore = relatedSignature(source.related)
  source.related = normalizeRelatedLinks(source, notes)
  markRelatedGraphChanged(source, sourceBefore, changedIds, now)
  const sourceDirectLinks = source.related.filter((related) => !isReciprocalLink(related))
  const sourceTargets = new Set(sourceDirectLinks.map((related) => related.noteId))

  for (const note of notes) {
    if (note.id === source.id) {
      continue
    }

    const before = relatedSignature(note.related)
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
    markRelatedGraphChanged(note, before, changedIds, now)
  }

  return [...changedIds]
}

function markRelatedGraphChanged(note: NoteRecord, before: string, changedIds: Set<string>, now: string): void {
  if (before === relatedSignature(note.related)) {
    return
  }

  note.updatedAt = now
  note.trainingReviewedAt = undefined
  changedIds.add(note.id)
}

function relatedSignature(links: RelatedNote[]): string {
  return JSON.stringify(
    links.map((link) => ({
      noteId: link.noteId,
      title: link.title,
      score: link.score,
      reason: link.reason
    }))
  )
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
