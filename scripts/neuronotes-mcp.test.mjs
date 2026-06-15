import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { callTool, handleMcpMessage, parseCliArgs, readNeuronotesDatabase, resolveDatabasePath } from './neuronotes-mcp.mjs'

let tempDir
let dbPath

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'neuronotes-mcp-'))
  dbPath = path.join(tempDir, 'neuronotes.json')
  await writeFile(dbPath, `${JSON.stringify(sampleDatabase(), null, 2)}\n`, 'utf8')
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('neuronotes MCP server', () => {
  it('resolves CLI database options', () => {
    const options = parseCliArgs(['--db', dbPath])

    expect(resolveDatabasePath(options)).toBe(path.resolve(dbPath))
    expect(resolveDatabasePath(parseCliArgs(['--user-data', tempDir]))).toBe(path.join(tempDir, 'neuronotes.json'))
  })

  it('handles MCP initialize and tools/list requests', async () => {
    await expect(
      handleMcpMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {}
      })
    ).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        serverInfo: {
          name: 'neuronotes'
        },
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      }
    })

    const response = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    })

    expect(response.result.tools.map((tool) => tool.name)).toEqual([
      'neuronotes_search_notes',
      'neuronotes_get_note',
      'neuronotes_list_open_actions',
      'neuronotes_library_summary'
    ])
  })

  it('exposes library, actions, and notes as MCP resources', async () => {
    const listResponse = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 'resources-1',
        method: 'resources/list',
        params: {}
      },
      { dbPath }
    )

    expect(listResponse.result.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uri: 'neuronotes://library/summary',
          title: 'Neuronotes Library Summary'
        }),
        expect.objectContaining({
          uri: 'neuronotes://actions/open',
          title: 'Open Neuronotes Actions'
        }),
        expect.objectContaining({
          uri: 'neuronotes://notes/note-health',
          title: 'Cita medico'
        })
      ])
    )

    const readResponse = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 'resources-2',
        method: 'resources/read',
        params: {
          uri: 'neuronotes://notes/note-health'
        }
      },
      { dbPath }
    )
    const payload = JSON.parse(readResponse.result.contents[0].text)

    expect(payload).toMatchObject({
      schema: 'neuronotes.mcp.note.v1',
      note: {
        id: 'note-health',
        savedActions: [
          {
            id: 'action-reminder'
          }
        ]
      }
    })
  })

  it('exposes MCP prompts for RAG review and action planning', async () => {
    const listResponse = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 'prompts-1',
      method: 'prompts/list',
      params: {}
    })

    expect(listResponse.result.prompts.map((prompt) => prompt.name)).toEqual([
      'neuronotes_review_rag_analysis',
      'neuronotes_prepare_action_plan',
      'neuronotes_library_brief'
    ])

    const reviewResponse = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 'prompts-2',
        method: 'prompts/get',
        params: {
          name: 'neuronotes_review_rag_analysis',
          arguments: {
            noteId: 'note-health'
          }
        }
      },
      { dbPath }
    )

    expect(reviewResponse.result.messages[0].content.text).toContain('Roadmap Neuronotes')
    expect(reviewResponse.result.messages[0].content.text).toContain('No ejecutes herramientas externas')

    const actionPlanResponse = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 'prompts-3',
        method: 'prompts/get',
        params: {
          name: 'neuronotes_prepare_action_plan',
          arguments: {
            kind: 'reminder'
          }
        }
      },
      { dbPath }
    )

    expect(actionPlanResponse.result.messages[0].content.text).toContain('action-reminder')
    expect(actionPlanResponse.result.messages[0].content.text).not.toContain('action-done')
  })

  it('searches local notes with normalized Spanish text', async () => {
    const result = await callTool(
      'neuronotes_search_notes',
      {
        query: 'medico qwen',
        tags: ['salud']
      },
      { dbPath }
    )

    expect(result).toMatchObject({
      schema: 'neuronotes.mcp.search.v1',
      count: 1,
      notes: [
        {
          id: 'note-health',
          category: 'Salud',
          analysisStatus: 'qwen',
          model: 'qwen3.5:0.8b'
        }
      ]
    })
  })

  it('returns a full note with saved actions and RAG audit context', async () => {
    const response = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 'call-1',
        method: 'tools/call',
        params: {
          name: 'neuronotes_get_note',
          arguments: {
            noteId: 'note-health'
          }
        }
      },
      { dbPath }
    )

    const payload = response.result.structuredContent

    expect(payload.note.content).toContain('medico')
    expect(payload.note.savedActions).toHaveLength(1)
    expect(payload.note.analysisRun.ragContext).toEqual([
      expect.objectContaining({
        noteId: 'note-project',
        title: 'Roadmap Neuronotes'
      })
    ])
  })

  it('normalizes stale note references before exposing MCP context', async () => {
    const staleDatabase = sampleDatabase()
    staleDatabase.notes[0].trainingReviewedAt = '2026-06-15T00:03:00.000Z'
    staleDatabase.notes[0].related.push(
      {
        noteId: 'missing-note',
        title: 'No existe',
        score: 0.8,
        reason: 'Debe filtrarse.'
      },
      {
        noteId: 'note-health',
        title: 'Self',
        score: 1,
        reason: 'Self link.'
      }
    )
    staleDatabase.notes[0].analysisRun.ragNoteIds.push('missing-note', 'note-health', 'note-project')
    staleDatabase.notes[0].analysisRun.ragContext.push(
      {
        noteId: 'missing-note',
        title: 'No existe',
        category: 'Ideas',
        tags: [],
        score: 0.8,
        reason: 'Debe filtrarse.',
        excerpt: 'Contexto stale.'
      },
      {
        noteId: 'note-health',
        title: 'Self',
        category: 'Salud',
        tags: ['salud'],
        score: 1,
        reason: 'Self context.',
        excerpt: 'No debe exponerse.'
      }
    )
    await writeFile(dbPath, `${JSON.stringify(staleDatabase, null, 2)}\n`, 'utf8')

    const database = await readNeuronotesDatabase(dbPath)
    const note = database.notes.find((item) => item.id === 'note-health')

    expect(note.related.map((related) => related.noteId)).toEqual(['note-project'])
    expect(note.analysisRun.ragNoteIds).toEqual(['note-project'])
    expect(note.analysisRun.ragContext.map((item) => item.noteId)).toEqual(['note-project'])
    expect(note.trainingReviewedAt).toBeUndefined()
  })

  it('lists open action intents without returning completed actions', async () => {
    const result = await callTool(
      'neuronotes_list_open_actions',
      {
        kind: 'reminder',
        limit: 5
      },
      { dbPath }
    )

    expect(result).toMatchObject({
      schema: 'neuronotes.mcp.actions.v1',
      count: 1,
      actions: [
        {
          id: 'action-reminder',
          status: 'open',
          toolHint: 'reminder.create',
          sourceNote: {
            id: 'note-health',
            category: 'Salud'
          }
        }
      ]
    })
  })

  it('summarizes library state and keeps MCP execution read-only', async () => {
    const result = await callTool('neuronotes_library_summary', {}, { dbPath })

    expect(result).toMatchObject({
      schema: 'neuronotes.mcp.summary.v1',
      noteCount: 2,
      actionCount: 2,
      openActionCount: 1,
      qwenAnalyzedCount: 1,
      fallbackAnalyzedCount: 1,
      execution: {
        mode: 'read-only-context',
        canModifyNotes: false,
        canExecuteExternalTools: false,
        requiresUserApprovalForFollowUp: true
      }
    })
  })
})

function sampleDatabase() {
  return {
    version: 1,
    settings: {
      model: 'qwen3.5:0.8b',
      ollamaUrl: 'http://127.0.0.1:11434',
      autoAnalyze: true,
      ragMaxNotes: 5,
      ragExcerptLength: 550
    },
    notes: [
      {
        id: 'note-health',
        title: 'Cita medico',
        content: 'Recordar cita con el medico manana y revisar Qwen local.',
        summary: 'Preparar la cita medica y validar Qwen local.',
        category: 'Salud',
        tags: ['salud', 'qwen'],
        related: [
          {
            noteId: 'note-project',
            title: 'Roadmap Neuronotes',
            score: 0.7,
            reason: 'Ambas notas mencionan Qwen local.'
          }
        ],
        suggestedActions: [
          {
            kind: 'reminder',
            title: 'Crear recordatorio',
            detail: 'La nota menciona manana.',
            toolHint: 'reminder.create',
            confidence: 0.8
          }
        ],
        analysisStatus: 'qwen',
        analysisRun: {
          provider: 'qwen',
          model: 'qwen3.5:0.8b',
          analyzedAt: '2026-06-15T00:00:00.000Z',
          durationMs: 1200,
          ragNoteIds: ['note-project'],
          ragContext: [
            {
              noteId: 'note-project',
              title: 'Roadmap Neuronotes',
              category: 'Proyecto',
              tags: ['rag', 'qwen'],
              score: 0.7,
              reason: 'Contexto recuperado por RAG local.',
              excerpt: 'Neuronotes usa Qwen 0.8B con RAG local.'
            }
          ]
        },
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:01:00.000Z'
      },
      {
        id: 'note-project',
        title: 'Roadmap Neuronotes',
        content: 'MCP local de solo lectura para exponer acciones y notas.',
        summary: 'Plan de MCP local.',
        category: 'Proyecto',
        tags: ['mcp', 'qwen'],
        related: [],
        suggestedActions: [],
        analysisStatus: 'fallback',
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:02:00.000Z'
      }
    ],
    actions: [
      {
        id: 'action-reminder',
        noteId: 'note-health',
        noteTitle: 'Cita medico',
        kind: 'reminder',
        title: 'Crear recordatorio',
        detail: 'La nota menciona manana.',
        toolHint: 'reminder.create',
        confidence: 0.8,
        status: 'open',
        createdAt: '2026-06-15T00:01:00.000Z',
        updatedAt: '2026-06-15T00:01:00.000Z'
      },
      {
        id: 'action-done',
        noteId: 'note-project',
        noteTitle: 'Roadmap Neuronotes',
        kind: 'task',
        title: 'Cerrar tarea antigua',
        detail: 'Ya hecha.',
        confidence: 0.7,
        status: 'done',
        createdAt: '2026-06-15T00:01:00.000Z',
        updatedAt: '2026-06-15T00:01:00.000Z'
      }
    ]
  }
}
