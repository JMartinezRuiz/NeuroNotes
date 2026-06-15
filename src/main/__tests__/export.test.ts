import { describe, expect, it } from 'vitest'
import {
  buildFineTuneExamples,
  buildMcpHandoffPayload,
  fineTuneDatasetToJsonl,
  mcpHandoffToJson,
  noteToMarkdown,
  safeMarkdownFileName
} from '../export'
import { ActionItem, DatabaseFile, DEFAULT_SETTINGS, NoteRecord } from '../types'

function note(overrides: Partial<NoteRecord> = {}): NoteRecord {
  const now = '2026-06-15T00:00:00.000Z'

  return {
    id: 'note-1',
    title: 'Roadmap Neuronotes',
    content: 'Crear una app de notas con Qwen local.',
    summary: 'Plan para convertir notas rapidas en una base conectada.',
    category: 'Proyecto',
    tags: ['qwen', 'notas'],
    related: [
      {
        noteId: 'note-2',
        title: 'Interfaz minimalista',
        score: 0.82,
        reason: 'Comparte contexto de producto.'
      }
    ],
    suggestedActions: [
      {
        kind: 'task',
        title: 'Crear tarea',
        detail: 'Convertir esta nota en una tarea local.',
        toolHint: 'task.create',
        confidence: 0.75
      }
    ],
    analysisStatus: 'qwen',
    analysisRun: {
      provider: 'qwen',
      model: 'qwen3.5:0.8b',
      analyzedAt: now,
      durationMs: 840,
      ragNoteIds: ['note-2'],
      ragContext: [
        {
          noteId: 'note-2',
          title: 'Interfaz minimalista',
          category: 'Ideas',
          tags: ['ui', 'notas'],
          score: 0.82,
          reason: 'Comparte contexto de producto.',
          excerpt: 'Direccion visual para una interfaz sobria y centrada en escritura.'
        }
      ]
    },
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

describe('noteToMarkdown', () => {
  it('exports note content, metadata, and related notes', () => {
    const localActions: ActionItem[] = [
      {
        id: 'action-1',
        noteId: 'note-1',
        noteTitle: 'Roadmap Neuronotes',
        kind: 'task',
        title: 'Crear tarea',
        detail: 'Convertir esta nota en una tarea local.',
        toolHint: 'task.create',
        confidence: 0.75,
        status: 'open',
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z'
      }
    ]
    const markdown = noteToMarkdown(note(), localActions)

    expect(markdown).toContain('# Roadmap Neuronotes')
    expect(markdown).toContain('> Plan para convertir notas rapidas en una base conectada.')
    expect(markdown).toContain('- Categoria: Proyecto')
    expect(markdown).toContain('- Etiquetas: #qwen #notas')
    expect(markdown).toContain('## Nota')
    expect(markdown).toContain('Crear una app de notas con Qwen local.')
    expect(markdown).toContain('- Interfaz minimalista: Comparte contexto de producto. (82%)')
    expect(markdown).toContain('## Acciones sugeridas')
    expect(markdown).toContain('- Crear tarea (task, 75%) [task\\.create]: Convertir esta nota en una tarea local\\.')
    expect(markdown).toContain('## Plan local')
    expect(markdown).toContain('- [ ] Crear tarea (task) [task\\.create]: Convertir esta nota en una tarea local\\.')
    expect(markdown).toContain('## Contexto RAG')
    expect(markdown).toContain('- Interfaz minimalista (82%, Ideas #ui #notas): Direccion visual para una interfaz sobria y centrada en escritura\\.')
  })

  it('uses stable fallbacks when summary, tags, or links are missing', () => {
    const markdown = noteToMarkdown(note({ summary: '', tags: [], related: [], suggestedActions: [], analysisRun: undefined }))

    expect(markdown).toContain('> Sin resumen')
    expect(markdown).toContain('- Etiquetas: Sin etiquetas')
    expect(markdown).toContain('- Sin notas enlazadas')
    expect(markdown).toContain('- Sin acciones sugeridas')
    expect(markdown).toContain('- Sin acciones guardadas')
    expect(markdown).toContain('- Sin contexto RAG guardado')
  })
})

describe('safeMarkdownFileName', () => {
  it('creates a safe markdown filename from arbitrary titles', () => {
    expect(safeMarkdownFileName(' Reunión / Qwen: notas rápidas! ')).toBe('reunion-qwen-notas-rapidas.md')
  })

  it('uses a fallback for empty titles', () => {
    expect(safeMarkdownFileName(' *** ')).toBe('nota-neuronotes.md')
  })
})

describe('buildMcpHandoffPayload', () => {
  it('exports open local actions with source note context for MCP handoff', () => {
    const now = '2026-06-15T00:00:00.000Z'
    const sourceNote = note()
    const database: DatabaseFile = {
      version: 1,
      notes: [sourceNote],
      settings: { ...DEFAULT_SETTINGS },
      actions: [
        {
          id: 'action-open',
          noteId: sourceNote.id,
          noteTitle: sourceNote.title,
          kind: 'task',
          title: 'Crear tarea',
          detail: 'Convertir esta nota en una tarea local.',
          toolHint: 'task.create',
          confidence: 0.75,
          status: 'open',
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'action-done',
          noteId: sourceNote.id,
          noteTitle: sourceNote.title,
          kind: 'research',
          title: 'Buscar referencia',
          detail: 'Accion ya cerrada.',
          confidence: 0.55,
          status: 'done',
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'action-open-unassigned',
          noteId: sourceNote.id,
          noteTitle: sourceNote.title,
          kind: 'mcp',
          title: 'Preparar automatizacion',
          detail: 'Accion avanzada pendiente de herramienta concreta.',
          confidence: 0.61,
          status: 'open',
          createdAt: now,
          updatedAt: now
        }
      ]
    }

    const payload = buildMcpHandoffPayload(database, now)

    expect(payload).toMatchObject({
      schema: 'neuronotes.mcp-handoff.v1',
      exportedAt: now,
      execution: {
        mode: 'manual-user-approved',
        requiresUserApproval: true,
        sideEffects: 'none-export-only'
      },
      model: DEFAULT_SETTINGS.model,
      actionCount: 2,
      doneActionCount: 1
    })
    expect(payload.toolSummary).toEqual([
      {
        toolHint: 'task.create',
        actionCount: 1,
        kinds: ['task'],
        sourceNoteIds: [sourceNote.id]
      },
      {
        toolHint: 'unassigned',
        actionCount: 1,
        kinds: ['mcp'],
        sourceNoteIds: [sourceNote.id]
      }
    ])
    expect(payload.kindSummary).toEqual([
      {
        kind: 'mcp',
        actionCount: 1
      },
      {
        kind: 'task',
        actionCount: 1
      }
    ])
    expect(payload.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'action-open',
          kind: 'task',
          status: 'open',
          toolHint: 'task.create',
          sourceNote: expect.objectContaining({
            id: sourceNote.id,
            title: sourceNote.title,
            category: 'Proyecto',
            tags: ['qwen', 'notas'],
            relatedNoteIds: ['note-2'],
            analysis: expect.objectContaining({
              provider: 'qwen',
              model: 'qwen3.5:0.8b',
              ragNoteIds: ['note-2']
            })
          })
        }),
        expect.objectContaining({
          id: 'action-open-unassigned',
          kind: 'mcp',
          status: 'open',
          toolHint: null
        })
      ])
    )

    expect(payload.actions[0].sourceNote.contentExcerpt).toContain('Crear una app de notas con Qwen local.')
  })

  it('serializes the MCP handoff as formatted JSON', () => {
    const now = '2026-06-15T00:00:00.000Z'
    const database: DatabaseFile = {
      version: 1,
      notes: [note()],
      settings: { ...DEFAULT_SETTINGS },
      actions: []
    }

    const json = mcpHandoffToJson(database, now)
    const payload = JSON.parse(json) as ReturnType<typeof buildMcpHandoffPayload>

    expect(json.endsWith('\n')).toBe(true)
    expect(payload).toMatchObject({
      schema: 'neuronotes.mcp-handoff.v1',
      actionCount: 0,
      actions: []
    })
  })
})

describe('fine-tune dataset export', () => {
  it('builds local supervised JSONL examples from analyzed notes', () => {
    const now = '2026-06-15T00:00:00.000Z'
    const sourceNote = note({ trainingReviewedAt: now })
    const database: DatabaseFile = {
      version: 1,
      notes: [
        sourceNote,
        note({
          id: 'unreviewed-note',
          title: 'Nota no revisada',
          content: 'Analisis correcto pero todavia no aprobado para entrenamiento.',
          summary: 'Ejemplo no revisado.',
          related: [],
          suggestedActions: [],
          analysisStatus: 'qwen'
        }),
        note({
          id: 'note-2',
          title: 'Interfaz minimalista',
          content: 'Contexto de UI para Neuronotes.',
          summary: '',
          tags: [],
          related: [],
          suggestedActions: [],
          analysisStatus: 'idle',
          analysisRun: undefined
        }),
        note({
          id: 'draft-note',
          content: 'Borrador sin analisis.',
          summary: '',
          tags: [],
          related: [],
          suggestedActions: [],
          analysisStatus: 'idle',
          analysisRun: undefined
        })
      ],
      settings: { ...DEFAULT_SETTINGS },
      actions: []
    }

    const examples = buildFineTuneExamples(database, now)

    expect(examples).toHaveLength(1)
    expect(examples[0]).toMatchObject({
      schema: 'neuronotes.finetune-example.v1',
      exportedAt: now,
      source: 'neuronotes',
      targetModel: 'qwen3.5:0.8b',
      metadata: {
        noteId: sourceNote.id,
        analysisStatus: 'qwen',
        analysisProvider: 'qwen',
        category: 'Proyecto',
        tagCount: 2,
        relatedCount: 1,
        suggestedActionCount: 1,
        ragNoteIds: ['note-2'],
        reviewedForTraining: true,
        reviewedAt: now
      }
    })
    expect(examples[0].messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant'])
    expect(examples[0].messages[1].content).toContain('Nota nueva:')
    expect(examples[0].messages[1].content).toContain('Contexto recuperado:')
    expect(examples[0].messages[1].content).toContain('ID: note-2')

    const assistantPayload = JSON.parse(examples[0].messages[2].content) as {
      title: string
      category: string
      tags: string[]
      related: Array<{ noteId: string; reason: string }>
      suggestedActions: Array<{ kind: string; toolHint?: string }>
    }

    expect(assistantPayload).toMatchObject({
      title: 'Roadmap Neuronotes',
      category: 'Proyecto',
      tags: ['qwen', 'notas'],
      related: [
        {
          noteId: 'note-2',
          reason: 'Comparte contexto de producto.'
        }
      ],
      suggestedActions: [
        {
          kind: 'task',
          toolHint: 'task.create'
        }
      ]
    })
  })

  it('serializes the fine-tune dataset as newline-delimited JSON', () => {
    const now = '2026-06-15T00:00:00.000Z'
    const database: DatabaseFile = {
      version: 1,
      notes: [note({ trainingReviewedAt: now })],
      settings: { ...DEFAULT_SETTINGS },
      actions: []
    }

    const jsonl = fineTuneDatasetToJsonl(database, now)
    const lines = jsonl.trim().split('\n')

    expect(jsonl.endsWith('\n')).toBe(true)
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({
      schema: 'neuronotes.finetune-example.v1',
      targetModel: 'qwen3.5:0.8b'
    })
  })

  it('does not export unreviewed analyzed notes for fine-tuning', () => {
    const now = '2026-06-15T00:00:00.000Z'
    const database: DatabaseFile = {
      version: 1,
      notes: [note()],
      settings: { ...DEFAULT_SETTINGS },
      actions: []
    }

    expect(buildFineTuneExamples(database, now)).toEqual([])
    expect(fineTuneDatasetToJsonl(database, now)).toBe('')
  })
})
