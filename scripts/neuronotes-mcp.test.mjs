import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { callTool, handleMcpMessage, parseCliArgs, resolveDatabasePath } from './neuronotes-mcp.mjs'

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
          tools: {}
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
