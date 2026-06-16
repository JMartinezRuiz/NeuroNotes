import { describe, expect, it, vi } from 'vitest'
import { noteToMarkdown } from '../export'
import { markdownSourcesToDrafts, markdownToNoteDraft, noteImportSignature, shouldSkipMarkdownImport } from '../markdownImport'
import { ActionItem, NoteRecord } from '../types'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'preview-user-data')
  }
}))

function note(overrides: Partial<NoteRecord> = {}): NoteRecord {
  const now = '2026-06-15T00:00:00.000Z'

  return {
    id: 'note-1',
    title: 'Roadmap Neuronotes',
    content: 'Crear una app de notas con Qwen local.\n\n## Detalles\n\nDebe usar RAG y MCP sin salir del equipo.',
    summary: 'Plan para convertir notas rapidas en una base conectada.',
    category: 'Proyecto',
    tags: ['qwen', 'rag'],
    related: [],
    suggestedActions: [],
    analysisStatus: 'qwen',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

describe('markdownToNoteDraft', () => {
  it('imports a Neuronotes Markdown note as a pending local draft', () => {
    const localActions: ActionItem[] = [
      {
        id: 'action-1',
        noteId: 'note-1',
        noteTitle: 'Roadmap Neuronotes',
        kind: 'task',
        title: 'Preparar build',
        detail: 'Validar instalador Windows.',
        toolHint: 'task.create',
        confidence: 0.8,
        status: 'open',
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z'
      }
    ]
    const draft = markdownToNoteDraft(noteToMarkdown(note(), localActions), 'roadmap-neuronotes.md')

    expect(draft).toMatchObject({
      title: 'Roadmap Neuronotes',
      content: 'Crear una app de notas con Qwen local.\n\n## Detalles\n\nDebe usar RAG y MCP sin salir del equipo.',
      summary: 'Plan para convertir notas rapidas en una base conectada.',
      category: 'Proyecto',
      tags: ['qwen', 'rag'],
      analysisStatus: 'idle'
    })
    expect(draft?.suggestedActions).toEqual([
      expect.objectContaining({ kind: 'task', toolHint: 'task.create' }),
      expect.objectContaining({ kind: 'mcp', toolHint: 'mcp.workflow.prepare' })
    ])
    expect(draft?.analysisRun).toBeUndefined()
  })

  it('imports generic Markdown using the first heading or filename', () => {
    const draft = markdownToNoteDraft('Apuntes de investigacion sobre RAG local #Aprendizaje', 'rag-local.md')

    expect(draft).toMatchObject({
      title: 'rag local',
      content: 'Apuntes de investigacion sobre RAG local #Aprendizaje',
      category: 'Aprendizaje',
      tags: ['aprendizaje']
    })
  })

  it('skips the generated Markdown export index', () => {
    expect(shouldSkipMarkdownImport('# Neuronotes Markdown Export\n\n## Notas')).toBe(true)
    expect(markdownToNoteDraft('# Neuronotes Markdown Export\n\n## Notas', 'index.md')).toBeUndefined()
  })
})

describe('markdownSourcesToDrafts', () => {
  it('returns importable drafts and counts skipped files', () => {
    const result = markdownSourcesToDrafts([
      {
        filePath: 'index.md',
        content: '# Neuronotes Markdown Export\n'
      },
      {
        filePath: 'cliente.md',
        content: '# Cliente\n\nPreparar reunion MCP #Trabajo'
      }
    ])

    expect(result.skipped).toBe(1)
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0].note.title).toBe('Cliente')
  })
})

describe('noteImportSignature', () => {
  it('normalizes title and content for duplicate detection', () => {
    expect(noteImportSignature({ title: '  Roadmap  ', content: 'Qwen\n\nRAG' })).toBe(
      noteImportSignature({ title: 'roadmap', content: 'Qwen RAG' })
    )
  })
})
