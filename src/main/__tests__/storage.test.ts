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

import { databasePaths, mutateDatabase, normalizeDatabase, readDatabase, writeDatabase } from '../storage'

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
})

describe('normalizeDatabase', () => {
  it('filters malformed notes and fills missing settings', () => {
    const normalized = normalizeDatabase({
      notes: [
        {
          id: 'valid',
          content: 'Nota importada',
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
          }
        },
        {
          content: 'sin id'
        }
      ],
      settings: {
        model: '',
        ollamaUrl: 'http://127.0.0.1:11434/',
        autoAnalyze: false
      },
      actions: [
        {
          id: 'action-1',
          noteId: 'valid',
          noteTitle: '  Nota importada  ',
          kind: 'REMINDER',
          title: '  Revisar despues  ',
          detail: '',
          toolHint: ' reminder.create ',
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
      autoAnalyze: false
    })
    expect(normalized.notes).toHaveLength(1)
    expect(normalized.notes[0]).toMatchObject({
      id: 'valid',
      title: 'Nota importada',
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
      confidence: 1,
      status: 'open',
      updatedAt: '2026-06-15T00:01:00.000Z'
    })
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
