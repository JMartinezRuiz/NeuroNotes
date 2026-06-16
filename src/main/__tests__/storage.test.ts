import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, DatabaseFile, NoteRecord } from '../types'

const mockState = vi.hoisted(() => ({
  userDataPath: ''
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => mockState.userDataPath)
  }
}))

import { createNoteDraft, databasePaths, mutateDatabase, normalizeDatabase, readDatabase, writeDatabase } from '../storage'

function note(id: string): NoteRecord {
  const now = '2026-06-15T00:00:00.000Z'

  return {
    id,
    title: id,
    content: `Contenido ${id}`,
    summary: '',
    category: 'Inbox',
    tags: [],
    related: [],
    suggestedActions: [],
    analysisStatus: 'idle',
    createdAt: now,
    updatedAt: now
  }
}

function database(notes: NoteRecord[]): DatabaseFile {
  return {
    version: 1,
    notes,
    actions: [],
    settings: { ...DEFAULT_SETTINGS }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

beforeEach(async () => {
  mockState.userDataPath = await mkdtemp(path.join(tmpdir(), 'neuronotes-storage-'))
})

afterEach(async () => {
  await rm(mockState.userDataPath, { recursive: true, force: true })
})

describe('writeDatabase', () => {
  it('writes the database and keeps a local backup copy', async () => {
    await writeDatabase(database([note('first')]))

    const paths = databasePaths(mockState.userDataPath)
    const main = JSON.parse(await readFile(paths.data, 'utf8')) as DatabaseFile
    const backup = JSON.parse(await readFile(paths.backup, 'utf8')) as DatabaseFile

    expect(main.notes.map((item) => item.id)).toEqual(['first'])
    expect(backup.notes.map((item) => item.id)).toEqual(['first'])
  })
})

describe('readDatabase', () => {
  it('restores from the backup when the main database JSON is invalid', async () => {
    await writeDatabase(database([note('recoverable')]))

    const paths = databasePaths(mockState.userDataPath)
    await writeFile(paths.data, '{broken json', 'utf8')

    const restored = await readDatabase()
    const repairedMain = JSON.parse(await readFile(paths.data, 'utf8')) as DatabaseFile

    expect(restored.notes.map((item) => item.id)).toEqual(['recoverable'])
    expect(repairedMain.notes.map((item) => item.id)).toEqual(['recoverable'])
  })

  it('serializes initial database creation across concurrent reads', async () => {
    const [first, second, third] = await Promise.all([readDatabase(), readDatabase(), readDatabase()])
    const paths = databasePaths(mockState.userDataPath)
    const created = JSON.parse(await readFile(paths.data, 'utf8')) as DatabaseFile

    expect(first).toMatchObject({ version: 1, notes: [], actions: [] })
    expect(second).toMatchObject({ version: 1, notes: [], actions: [] })
    expect(third).toMatchObject({ version: 1, notes: [], actions: [] })
    expect(created).toMatchObject({ version: 1, notes: [], actions: [] })
  })
})

describe('createNoteDraft', () => {
  it('seeds draft tags and category from quick-capture content', () => {
    const draft = createNoteDraft('  Preparar reminder MCP para #Cliente y #RAG local  ')

    expect(draft).toMatchObject({
      title: 'Preparar reminder MCP para local',
      content: 'Preparar reminder MCP para #Cliente y #RAG local',
      summary: 'Preparar reminder MCP para local',
      category: 'Trabajo',
      tags: ['cliente', 'rag'],
      suggestedActions: [
        expect.objectContaining({ kind: 'task', toolHint: 'task.create' }),
        expect.objectContaining({ kind: 'reminder', toolHint: 'reminder.create' }),
        expect.objectContaining({ kind: 'mcp', toolHint: 'mcp.workflow.prepare' })
      ],
      analysisStatus: 'idle'
    })
  })

  it('uses category hashtags as initial metadata when they are explicit', () => {
    const draft = createNoteDraft('- [ ] Leer paper sobre memoria local #Aprendizaje')

    expect(draft.title).toBe('Leer paper sobre memoria local')
    expect(draft.summary).toBe('Leer paper sobre memoria local')
    expect(draft.category).toBe('Aprendizaje')
    expect(draft.tags).toEqual(['aprendizaje'])
    expect(draft.suggestedActions).toEqual([
      expect.objectContaining({ kind: 'research', toolHint: 'documents.search' })
    ])
  })
})

describe('normalizeDatabase', () => {
  it('filters malformed notes and fills missing settings', () => {
    const normalized = normalizeDatabase({
      notes: [
        {
          id: 'valid',
          content: 'Nota importada',
          category: 'project roadmap',
          tags: ['#Qwen', 'qwen', '  local  ', 'm\u00e9dico'],
          related: [
            {
              noteId: 'target',
              score: 3,
              reason: ''
            }
          ],
          suggestedActions: [
            {
              kind: 'TASK',
              title: '  Crear tarea  ',
              detail: 'Preparar automatizacion local',
              toolHint: ' task.create ',
              confidence: 2
            },
            {
              kind: 'unknown',
              title: 'No entra'
            }
          ],
          analysisRun: {
            provider: 'qwen',
            model: ' qwen3.5:0.8b ',
            analyzedAt: '2026-06-15T00:00:00.000Z',
            durationMs: -20,
            ragNoteIds: ['target', '', 14],
            ragContext: [
              {
                noteId: 'target',
                title: '  Contexto RAG  ',
                category: ' Proyecto ',
                tags: ['#Qwen', 'local', 'ma\u00f1ana'],
                score: 5,
                reason: '',
                excerpt: '  Extracto   con   espacios  '
              },
              {
                noteId: '',
                title: 'No entra'
              }
            ]
          },
          analysisStatus: 'qwen',
          trainingReviewedAt: ' 2026-06-15T00:02:00.000Z '
        },
        {
          id: 'target',
          title: 'Contexto RAG',
          content: 'Nota de contexto valida para RAG local.'
        },
        {
          content: 'sin id'
        }
      ],
      settings: {
        model: '',
        ollamaUrl: 'http://127.0.0.1:11434/',
        autoAnalyze: false,
        ragMaxNotes: 99,
        ragExcerptLength: 20
      },
      actions: [
        {
          id: 'action-1',
          noteId: 'valid',
          noteTitle: '  Titulo viejo  ',
          kind: 'REMINDER',
          title: '  Revisar despues  ',
          detail: '',
          toolHint: ' reminder.create ',
          mcpApprovedAt: ' 2026-06-15T00:02:00.000Z ',
          confidence: 4,
          status: 'unknown',
          createdAt: '',
          updatedAt: '2026-06-15T00:01:00.000Z'
        },
        {
          id: '',
          noteId: 'valid',
          kind: 'task',
          title: 'No entra'
        }
      ]
    } as unknown as Partial<DatabaseFile>)

    expect(normalized.settings).toEqual({
      model: DEFAULT_SETTINGS.model,
      ollamaUrl: 'http://127.0.0.1:11434',
      autoAnalyze: false,
      ragMaxNotes: 6,
      ragExcerptLength: 160
    })
    expect(normalized.notes).toHaveLength(2)
    expect(normalized.notes[0]).toMatchObject({
      id: 'valid',
      title: 'Nota importada',
      category: 'Proyecto',
      tags: ['qwen', 'local', 'medico'],
      suggestedActions: [
        {
          kind: 'task',
          title: 'Crear tarea',
          detail: 'Preparar automatizacion local',
          toolHint: 'task.create',
          confidence: 1
        }
      ],
      analysisRun: {
        provider: 'qwen',
        model: 'qwen3.5:0.8b',
        analyzedAt: '2026-06-15T00:00:00.000Z',
        durationMs: 0,
        ragNoteIds: ['target'],
        ragContext: [
          {
            noteId: 'target',
            title: 'Contexto RAG',
            category: 'Proyecto',
            tags: ['qwen', 'local', 'manana'],
            score: 1,
            reason: 'Contexto recuperado por RAG local.',
            excerpt: 'Extracto con espacios'
          }
        ]
      },
      trainingReviewedAt: '2026-06-15T00:02:00.000Z',
      related: [
        {
          noteId: 'target',
          score: 1,
          reason: 'Relacion detectada por Neuronotes.'
        }
      ]
    })
    expect(normalized.actions).toHaveLength(1)
    expect(normalized.actions[0]).toMatchObject({
      id: 'action-1',
      noteId: 'valid',
      noteTitle: 'Nota importada',
      kind: 'reminder',
      title: 'Revisar despues',
      detail: 'Accion guardada en Neuronotes.',
      toolHint: 'reminder.create',
      mcpApprovedAt: '2026-06-15T00:02:00.000Z',
      confidence: 1,
      status: 'open',
      updatedAt: '2026-06-15T00:01:00.000Z'
    })
  })

  it('preserves current AI diagnostics and drops stale diagnostics after settings changes', () => {
    const aiDiagnostics = {
      ok: true,
      status: 'qwen',
      message: 'qwen3.5:0.8b respondio correctamente',
      model: DEFAULT_SETTINGS.model,
      ollamaUrl: DEFAULT_SETTINGS.ollamaUrl,
      ragMaxNotes: DEFAULT_SETTINGS.ragMaxNotes,
      ragExcerptLength: DEFAULT_SETTINGS.ragExcerptLength,
      diagnosedAt: '2026-06-15T00:05:00.000Z',
      durationMs: 842,
      category: 'health check',
      summary: '  Diagnostico JSON valido.  ',
      related: 1
    }

    expect(
      normalizeDatabase({
        settings: { ...DEFAULT_SETTINGS },
        aiDiagnostics
      } as unknown as Partial<DatabaseFile>).aiDiagnostics
    ).toMatchObject({
      ok: true,
      status: 'qwen',
      model: DEFAULT_SETTINGS.model,
      category: 'Salud',
      ollamaUrl: DEFAULT_SETTINGS.ollamaUrl,
      ragMaxNotes: DEFAULT_SETTINGS.ragMaxNotes,
      ragExcerptLength: DEFAULT_SETTINGS.ragExcerptLength,
      diagnosedAt: '2026-06-15T00:05:00.000Z',
      durationMs: 842,
      summary: 'Diagnostico JSON valido.',
      related: 1
    })

    expect(
      normalizeDatabase({
        settings: { ...DEFAULT_SETTINGS, ragMaxNotes: 3 },
        aiDiagnostics
      } as unknown as Partial<DatabaseFile>).aiDiagnostics
    ).toBeUndefined()
  })

  it('drops dangling note references and invalidates reviewed examples when the graph changes', () => {
    const normalized = normalizeDatabase({
      notes: [
        {
          id: 'reviewed',
          content: 'Nota revisada con referencias stale.',
          related: [
            {
              noteId: 'keep',
              title: 'Referencia valida',
              score: 0.7,
              reason: 'Relacion vigente.'
            },
            {
              noteId: 'missing',
              title: 'No existe',
              score: 0.8,
              reason: 'Debe salir.'
            },
            {
              noteId: 'reviewed',
              title: 'Self',
              score: 1,
              reason: 'Self link.'
            }
          ],
          analysisRun: {
            provider: 'qwen',
            model: 'qwen3.5:0.8b',
            analyzedAt: '2026-06-15T00:00:00.000Z',
            durationMs: 1000,
            ragNoteIds: ['keep', 'missing', 'reviewed', 'keep'],
            ragContext: [
              {
                noteId: 'keep',
                title: 'Referencia valida',
                category: 'Proyecto',
                tags: ['qwen'],
                score: 0.7,
                reason: 'Contexto vigente.',
                excerpt: 'Contexto valido.'
              },
              {
                noteId: 'missing',
                title: 'No existe',
                category: 'Ideas',
                tags: [],
                score: 0.8,
                reason: 'Debe salir.',
                excerpt: 'Contexto stale.'
              },
              {
                noteId: 'reviewed',
                title: 'Self',
                category: 'Inbox',
                tags: [],
                score: 1,
                reason: 'Self context.',
                excerpt: 'No debe usarse.'
              }
            ]
          },
          trainingReviewedAt: '2026-06-15T00:02:00.000Z'
        },
        {
          id: 'keep',
          content: 'Referencia valida.'
        }
      ]
    } as unknown as Partial<DatabaseFile>)

    expect(normalized.notes[0]).toMatchObject({
      id: 'reviewed',
      related: [
        {
          noteId: 'keep',
          title: 'Referencia valida.',
          score: 0.7,
          reason: 'Relacion vigente.'
        }
      ],
      analysisRun: {
        ragNoteIds: ['keep'],
        ragContext: [
          {
            noteId: 'keep',
            title: 'Referencia valida'
          }
        ]
      },
      trainingReviewedAt: undefined
    })
  })

  it('syncs related note titles without invalidating reviewed examples', () => {
    const normalized = normalizeDatabase({
      notes: [
        {
          id: 'source',
          content: 'Nota revisada con enlace valido.',
          summary: 'Resumen aprobado.',
          related: [
            {
              noteId: 'target',
              title: 'Titulo anterior',
              score: 0.7,
              reason: 'Relacion vigente.'
            }
          ],
          analysisStatus: 'qwen',
          trainingReviewedAt: '2026-06-15T00:02:00.000Z'
        },
        {
          id: 'target',
          title: 'Titulo actual',
          content: 'Nota destino.'
        }
      ]
    } as unknown as Partial<DatabaseFile>)

    expect(normalized.notes[0]).toMatchObject({
      id: 'source',
      related: [
        {
          noteId: 'target',
          title: 'Titulo actual',
          score: 0.7,
          reason: 'Relacion vigente.'
        }
      ],
      trainingReviewedAt: '2026-06-15T00:02:00.000Z'
    })
  })

  it('drops reviewed flags from notes that are no longer valid fine-tuning examples', () => {
    const normalized = normalizeDatabase({
      notes: [
        {
          id: 'draft-reviewed',
          content: 'Borrador marcado por error.',
          summary: '',
          tags: [],
          related: [],
          suggestedActions: [],
          analysisStatus: 'idle',
          trainingReviewedAt: '2026-06-15T00:02:00.000Z'
        },
        {
          id: 'empty-analysis',
          content: 'Analisis sin salida util.',
          summary: '',
          tags: [],
          related: [],
          suggestedActions: [],
          analysisStatus: 'qwen',
          trainingReviewedAt: '2026-06-15T00:03:00.000Z'
        },
        {
          id: 'valid-reviewed',
          content: 'Nota analizada y revisada.',
          summary: 'Resumen valido.',
          tags: [],
          related: [],
          suggestedActions: [],
          analysisStatus: 'fallback',
          trainingReviewedAt: '2026-06-15T00:04:00.000Z'
        }
      ]
    } as unknown as Partial<DatabaseFile>)

    expect(normalized.notes.map((note) => [note.id, note.trainingReviewedAt])).toEqual([
      ['draft-reviewed', undefined],
      ['empty-analysis', undefined],
      ['valid-reviewed', '2026-06-15T00:04:00.000Z']
    ])
  })
})

describe('mutateDatabase', () => {
  it('serializes overlapping mutations so notes are not overwritten', async () => {
    await writeDatabase(database([]))

    await Promise.all([
      mutateDatabase(async (stored) => {
        await delay(20)
        stored.notes.push(note('slow'))
      }),
      mutateDatabase((stored) => {
        stored.notes.push(note('fast'))
      })
    ])

    const stored = await readDatabase()

    expect(stored.notes.map((item) => item.id).sort()).toEqual(['fast', 'slow'])
  })
})
