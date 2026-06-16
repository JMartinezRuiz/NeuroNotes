import path from 'node:path'
import { normalizeNoteCategory, normalizeNoteTags } from './metadata'
import { createNoteDraft } from './storage'
import { NoteRecord } from './types'

const NEURONOTES_INDEX_TITLE = 'neuronotes markdown export'
const EXPORTED_NOTE_SECTIONS = new Set([
  'auditoria ia',
  'nota',
  'notas enlazadas',
  'acciones sugeridas',
  'plan local',
  'contexto rag'
])

export interface MarkdownImportSource {
  filePath: string
  content: string
}

export interface MarkdownImportDraft {
  filePath: string
  note: NoteRecord
}

export function shouldSkipMarkdownImport(content: string): boolean {
  return normalizeHeading(firstHeading(content) ?? '') === NEURONOTES_INDEX_TITLE
}

export function markdownToNoteDraft(content: string, fallbackName: string): NoteRecord | undefined {
  const text = normalizeMarkdown(content)

  if (!text.trim() || shouldSkipMarkdownImport(text)) {
    return undefined
  }

  const title = cleanInlineMarkdown(firstHeading(text) ?? titleFromFileName(fallbackName))
  const noteBody = extractedNoteBody(text) || removeLeadingHeading(text) || title

  if (!noteBody.trim()) {
    return undefined
  }

  const note = createNoteDraft(noteBody)
  const summary = firstSummaryQuote(text)
  const category = metadataValue(text, 'Categoria')
  const tags = metadataValue(text, 'Etiquetas')

  note.title = title || note.title
  if (summary && normalizeHeading(summary) !== 'sin resumen') {
    note.summary = summary
  }
  if (category) {
    note.category = normalizeNoteCategory(category)
  }
  if (tags && normalizeHeading(tags) !== 'sin etiquetas') {
    note.tags = normalizeNoteTags([...tagValues(tags), ...note.tags])
  }

  return note
}

export function markdownSourcesToDrafts(sources: MarkdownImportSource[]): {
  drafts: MarkdownImportDraft[]
  skipped: number
} {
  const drafts: MarkdownImportDraft[] = []
  let skipped = 0

  for (const source of sources) {
    const fallbackName = path.basename(source.filePath, path.extname(source.filePath))
    const note = markdownToNoteDraft(source.content, fallbackName)

    if (!note) {
      skipped += 1
      continue
    }

    drafts.push({
      filePath: source.filePath,
      note
    })
  }

  return {
    drafts,
    skipped
  }
}

export function noteImportSignature(note: Pick<NoteRecord, 'title' | 'content'>): string {
  return `${normalizeSignatureText(note.title)}\n${normalizeSignatureText(note.content)}`
}

function normalizeMarkdown(content: string): string {
  return content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
}

function firstHeading(content: string): string | undefined {
  const match = content.match(/^#\s+(.+?)\s*$/m)
  return match ? unescapeMarkdown(match[1].trim()) : undefined
}

function removeLeadingHeading(content: string): string {
  return content.replace(/^#\s+.+?\s*(?:\n|$)/, '').trim()
}

function extractedNoteBody(content: string): string {
  const lines = content.split('\n')
  const start = lines.findIndex((line) => normalizeHeading(headingText(line)) === 'nota')

  if (start === -1) {
    return ''
  }

  const body: string[] = []

  for (const line of lines.slice(start + 1)) {
    const section = normalizeHeading(headingText(line))

    if (section && EXPORTED_NOTE_SECTIONS.has(section)) {
      break
    }

    body.push(line)
  }

  return body.join('\n').trim()
}

function headingText(line: string): string {
  const match = line.match(/^##\s+(.+?)\s*$/)
  return match ? unescapeMarkdown(match[1].trim()) : ''
}

function firstSummaryQuote(content: string): string {
  const match = content.match(/^>\s*(.+?)\s*$/m)
  return match ? cleanInlineMarkdown(match[1]) : ''
}

function metadataValue(content: string, label: string): string {
  const match = content.match(new RegExp(`^-\\s+${label}:\\s*(.+?)\\s*$`, 'mi'))
  return match ? unescapeMarkdown(match[1].trim()) : ''
}

function tagValues(value: string): string[] {
  const hashTags = [...value.matchAll(/#([\p{L}\p{N}][\p{L}\p{N}_-]{0,39})/gu)].map((match) => match[1])

  if (hashTags.length > 0) {
    return hashTags
  }

  return value
    .split(/[,;\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function titleFromFileName(fileName: string): string {
  return path
    .basename(fileName, path.extname(fileName))
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanInlineMarkdown(value: string): string {
  return unescapeMarkdown(value)
    .replace(/^\s*#+\s+/, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function unescapeMarkdown(value: string): string {
  return value.replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, '$1')
}

function normalizeHeading(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function normalizeSignatureText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}
