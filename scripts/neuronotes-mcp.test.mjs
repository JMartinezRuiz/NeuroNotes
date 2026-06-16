import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    expect(parseCliArgs(['--db', dbPath, '--write']).writeEnabled).toBe(true)
    expect(parseCliArgs(['--db', dbPath, '--write', '--read-only']).writeEnabled).toBe(false)
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
      'neuronotes_note_graph',
      'neuronotes_analysis_queue',
      'neuronotes_list_open_actions',
      'neuronotes_mcp_handoff',
      'neuronotes_library_summary',
      'neuronotes_qwen_setup',
      'neuronotes_finetune_readiness'
    ])

    const writeResponse = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
        params: {}
      },
      { dbPath, writeEnabled: true }
    )

    expect(writeResponse.result.tools.map((tool) => tool.name)).toEqual([
      'neuronotes_search_notes',
      'neuronotes_get_note',
      'neuronotes_note_graph',
      'neuronotes_analysis_queue',
      'neuronotes_list_open_actions',
      'neuronotes_mcp_handoff',
      'neuronotes_library_summary',
      'neuronotes_qwen_setup',
      'neuronotes_finetune_readiness',
      'neuronotes_create_note',
      'neuronotes_append_note',
      'neuronotes_create_action'
    ])
  })

  it('exposes library, actions, handoff, Qwen setup, fine-tuning readiness, and notes as MCP resources', async () => {
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
          uri: 'neuronotes://graph/links',
          title: 'Neuronotes Note Graph'
        }),
        expect.objectContaining({
          uri: 'neuronotes://actions/open',
          title: 'Open Neuronotes Actions'
        }),
        expect.objectContaining({
          uri: 'neuronotes://actions/handoff',
          title: 'Neuronotes MCP Handoff'
        }),
        expect.objectContaining({
          uri: 'neuronotes://analysis/queue',
          title: 'Neuronotes Analysis Queue'
        }),
        expect.objectContaining({
          uri: 'neuronotes://qwen/setup',
          title: 'Qwen Local Setup'
        }),
        expect.objectContaining({
          uri: 'neuronotes://finetune/readiness',
          title: 'Fine-Tuning Readiness'
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

    const graphResponse = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 'resources-graph',
        method: 'resources/read',
        params: {
          uri: 'neuronotes://graph/links'
        }
      },
      { dbPath }
    )
    const graphPayload = JSON.parse(graphResponse.result.contents[0].text)

    expect(graphPayload).toMatchObject({
      schema: 'neuronotes.mcp.graph.v1',
      nodeCount: 2,
      edgeCount: 1,
      orphanCount: 0
    })

    const fineTuneResponse = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 'resources-3',
        method: 'resources/read',
        params: {
          uri: 'neuronotes://finetune/readiness'
        }
      },
      { dbPath }
    )
    const fineTunePayload = JSON.parse(fineTuneResponse.result.contents[0].text)

    expect(fineTunePayload).toMatchObject({
      schema: 'neuronotes.mcp.finetune-readiness.v1',
      targetModel: 'qwen3.5:0.8b',
      reviewedExampleCount: 0,
      pendingReviewCount: 2,
      status: 'needs-review'
    })

    const handoffResponse = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 'resources-handoff',
        method: 'resources/read',
        params: {
          uri: 'neuronotes://actions/handoff'
        }
      },
      { dbPath }
    )
    const handoffPayload = JSON.parse(handoffResponse.result.contents[0].text)

    expect(handoffPayload).toMatchObject({
      schema: 'neuronotes.mcp-handoff.v1',
      execution: {
        requiresUserApproval: true,
        sideEffects: 'none-export-only'
      },
      actionCount: 1,
      approvedActionCount: 1,
      doneActionCount: 1,
      actions: [
        expect.objectContaining({
          id: 'action-reminder',
          toolHint: 'reminder.create',
          approval: {
            required: true,
            state: 'approved',
            approvedAt: '2026-06-15T00:01:30.000Z'
          }
        })
      ]
    })

    const queueResponse = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 'resources-4',
        method: 'resources/read',
        params: {
          uri: 'neuronotes://analysis/queue'
        }
      },
      { dbPath }
    )
    const queuePayload = JSON.parse(queueResponse.result.contents[0].text)

    expect(queuePayload).toMatchObject({
      schema: 'neuronotes.mcp.analysis-queues.v1',
      targetModel: 'qwen3.5:0.8b',
      qwen: {
        pendingCount: 1,
        statusCounts: {
          fallback: 1
        }
      },
      local: {
        pendingCount: 0
      }
    })

    const qwenSetupResponse = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 'resources-5',
        method: 'resources/read',
        params: {
          uri: 'neuronotes://qwen/setup'
        }
      },
      { dbPath }
    )
    const qwenSetupPayload = JSON.parse(qwenSetupResponse.result.contents[0].text)

    expect(qwenSetupPayload).toMatchObject({
      schema: 'neuronotes.mcp.qwen-setup.v1',
      targetModel: 'qwen3.5:0.8b',
      ollamaUrl: 'http://127.0.0.1:11434',
      diagnosticStatus: 'verified',
      mcpPosture: {
        readOnly: true,
        canInstallOllama: false,
        canPullModel: false,
        canRunDiagnostics: false
      }
    })
    expect(qwenSetupPayload.commands.manual.map((command) => command.command)).toContain('ollama pull qwen3.5:0.8b')
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
      'neuronotes_prepare_note_append',
      'neuronotes_prepare_action_plan',
      'neuronotes_review_mcp_handoff',
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

    const appendPromptResponse = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 'prompts-append',
        method: 'prompts/get',
        params: {
          name: 'neuronotes_prepare_note_append',
          arguments: {
            noteId: 'note-health'
          }
        }
      },
      { dbPath }
    )

    expect(appendPromptResponse.result.messages[0].content.text).toContain('Roadmap Neuronotes')
    expect(appendPromptResponse.result.messages[0].content.text).toContain('No ejecutes herramientas')
    expect(appendPromptResponse.result.messages[0].content.text).toContain('neuronotes_append_note')
    expect(appendPromptResponse.result.messages[0].content.text).toContain('privacyRisks')

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

    const handoffReviewResponse = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 'prompts-4',
        method: 'prompts/get',
        params: {
          name: 'neuronotes_review_mcp_handoff',
          arguments: {}
        }
      },
      { dbPath }
    )

    expect(handoffReviewResponse.result.messages[0].content.text).toContain('neuronotes.mcp-handoff.v1')
    expect(handoffReviewResponse.result.messages[0].content.text).toContain('No ejecutes herramientas')
    expect(handoffReviewResponse.result.messages[0].content.text).toContain('action-reminder')
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

  it('searches AI actions and stored RAG audit context', async () => {
    const actionResult = await callTool(
      'neuronotes_search_notes',
      {
        query: 'reminder.create'
      },
      { dbPath }
    )

    expect(actionResult.notes[0]).toMatchObject({
      id: 'note-health',
      suggestedActionCount: 1
    })

    const ragResult = await callTool(
      'neuronotes_search_notes',
      {
        query: 'contexto recuperado rag'
      },
      { dbPath }
    )

    expect(ragResult.notes[0]).toMatchObject({
      id: 'note-health',
      analysisProvider: 'qwen'
    })
  })

  it('searches saved local actions attached to source notes', async () => {
    const result = await callTool(
      'neuronotes_search_notes',
      {
        query: 'cerrar tarea antigua'
      },
      { dbPath }
    )

    expect(result.notes[0]).toMatchObject({
      id: 'note-project',
      suggestedActionCount: 0
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

  it('summarizes the note graph with backlinks and isolated notes', async () => {
    const graphDatabase = sampleDatabase()
    graphDatabase.notes.push({
      id: 'note-isolated',
      title: 'Idea aislada',
      content: 'Nota sin enlaces todavia.',
      summary: 'No tiene relaciones.',
      category: 'Ideas',
      tags: ['suelta'],
      related: [],
      suggestedActions: [],
      analysisStatus: 'idle',
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:03:00.000Z'
    })
    await writeFile(dbPath, `${JSON.stringify(graphDatabase, null, 2)}\n`, 'utf8')

    const result = await callTool('neuronotes_note_graph', {}, { dbPath })
    const healthNode = result.nodes.find((node) => node.id === 'note-health')
    const projectNode = result.nodes.find((node) => node.id === 'note-project')

    expect(result).toMatchObject({
      schema: 'neuronotes.mcp.graph.v1',
      targetModel: 'qwen3.5:0.8b',
      nodeCount: 3,
      edgeCount: 1,
      orphanCount: 1,
      backlinkCount: 1,
      edges: [
        expect.objectContaining({
          id: 'note-health::note-project',
          sourceId: 'note-health',
          targetId: 'note-project',
          bidirectional: false,
          relationCount: 1,
          reasons: ['Ambas notas mencionan Qwen local.'],
          directedLinks: [
            expect.objectContaining({
              sourceId: 'note-health',
              targetId: 'note-project',
              provenance: {
                label: 'RAG',
                title: 'Relacion usada o recuperada como contexto RAG local.',
                tone: 'rag'
              }
            })
          ]
        })
      ],
      orphanNotes: [
        expect.objectContaining({
          id: 'note-isolated',
          isolated: true
        })
      ],
      execution: {
        mode: 'read-only-context',
        canModifyNotes: false,
        canCreateLinks: false,
        canAnalyzeNotes: false
      }
    })
    expect(healthNode).toMatchObject({
      directLinkIds: ['note-project'],
      backlinkIds: [],
      linkedNoteIds: ['note-project'],
      isolated: false
    })
    expect(projectNode).toMatchObject({
      directLinkIds: [],
      backlinkIds: ['note-health'],
      linkedNoteIds: ['note-health'],
      isolated: false
    })

    await expect(callTool('neuronotes_note_graph', { category: 'Ideas' }, { dbPath })).resolves.toMatchObject({
      category: 'Ideas',
      nodeCount: 1,
      orphanCount: 1
    })
  })

  it('lists analysis queues for Qwen upgrades and local fallback retries', async () => {
    const queueDatabase = sampleDatabase()
    queueDatabase.notes.push({
      id: 'note-draft',
      title: 'Nota pendiente',
      content: 'Captura nueva que todavia no fue analizada.',
      summary: '',
      category: 'Inbox',
      tags: [],
      related: [],
      suggestedActions: [],
      analysisStatus: 'idle',
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:05:00.000Z'
    })
    await writeFile(dbPath, `${JSON.stringify(queueDatabase, null, 2)}\n`, 'utf8')

    const qwenQueue = await callTool('neuronotes_analysis_queue', { mode: 'qwen', limit: 10 }, { dbPath })
    const localQueue = await callTool('neuronotes_analysis_queue', { mode: 'local', limit: 10 }, { dbPath })

    expect(qwenQueue).toMatchObject({
      schema: 'neuronotes.mcp.analysis-queue.v1',
      mode: 'qwen',
      pendingCount: 2,
      statusCounts: {
        fallback: 1,
        idle: 1
      },
      notes: [
        expect.objectContaining({
          id: 'note-project',
          analysisStatus: 'fallback',
          reason: 'Local fallback result can be upgraded with Qwen and stored RAG context.'
        }),
        expect.objectContaining({
          id: 'note-draft',
          analysisStatus: 'idle',
          reason: 'New or edited note waiting for Qwen analysis.'
        })
      ]
    })
    expect(localQueue).toMatchObject({
      schema: 'neuronotes.mcp.analysis-queue.v1',
      mode: 'local',
      pendingCount: 1,
      notes: [
        expect.objectContaining({
          id: 'note-draft',
          reason: 'New or edited note waiting for local fallback analysis.'
        })
      ]
    })
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

  it('drops reviewed flags from notes that are not valid training examples', async () => {
    const staleDatabase = sampleDatabase()
    staleDatabase.notes.push({
      id: 'draft-reviewed',
      title: 'Borrador revisado por error',
      content: 'Borrador sin analisis.',
      summary: '',
      category: 'Inbox',
      tags: [],
      related: [],
      suggestedActions: [],
      analysisStatus: 'idle',
      trainingReviewedAt: '2026-06-15T00:04:00.000Z',
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z'
    })
    await writeFile(dbPath, `${JSON.stringify(staleDatabase, null, 2)}\n`, 'utf8')

    const result = await callTool('neuronotes_library_summary', {}, { dbPath })
    const database = await readNeuronotesDatabase(dbPath)

    expect(database.notes.find((note) => note.id === 'draft-reviewed').trainingReviewedAt).toBeUndefined()
    expect(result.reviewedFineTuneCount).toBe(0)
  })

  it('summarizes fine-tuning readiness for MCP hosts', async () => {
    const reviewedDatabase = sampleDatabase()
    reviewedDatabase.notes[0].trainingReviewedAt = '2026-06-15T00:03:00.000Z'
    await writeFile(dbPath, `${JSON.stringify(reviewedDatabase, null, 2)}\n`, 'utf8')

    const result = await callTool('neuronotes_finetune_readiness', {}, { dbPath })

    expect(result).toMatchObject({
      schema: 'neuronotes.mcp.finetune-readiness.v1',
      targetModel: 'qwen3.5:0.8b',
      reviewedExampleCount: 1,
      pendingReviewCount: 1,
      reviewableCount: 2,
      reviewedQwenCount: 1,
      reviewedLocalCount: 0,
      pendingQwenCount: 0,
      pendingLocalCount: 1,
      reviewedQualityCounts: {
        high: 1,
        medium: 0,
        low: 0
      },
      status: 'ready',
      reviewedExamples: [
        expect.objectContaining({
          id: 'note-health',
          analysisStatus: 'qwen',
          reviewedAt: '2026-06-15T00:03:00.000Z',
          ragNoteIds: ['note-project'],
          quality: expect.objectContaining({
            level: 'high',
            score: 1,
            warnings: []
          })
        })
      ],
      pendingReview: [
        expect.objectContaining({
          id: 'note-project',
          analysisStatus: 'fallback',
          quality: expect.objectContaining({
            warnings: expect.arrayContaining([
              'Ejemplo basado en fallback local; revisarlo antes de usarlo para ajustar Qwen.'
            ])
          })
        })
      ]
    })

    const summary = await callTool('neuronotes_library_summary', {}, { dbPath })

    expect(summary.fineTune).toMatchObject({
      schema: 'neuronotes.mcp.finetune-readiness.v1',
      reviewedExampleCount: 1,
      pendingReviewCount: 1,
      reviewedQualityCounts: {
        high: 1,
        medium: 0,
        low: 0
      },
      status: 'ready'
    })
    expect(summary.fineTune.reviewedExamples).toBeUndefined()
  })

  it('summarizes Qwen setup guidance for MCP hosts without side effects', async () => {
    const result = await callTool('neuronotes_qwen_setup', {}, { dbPath })

    expect(result).toMatchObject({
      schema: 'neuronotes.mcp.qwen-setup.v1',
      targetModel: 'qwen3.5:0.8b',
      ragSettings: {
        maxNotes: 5,
        excerptLength: 550
      },
      diagnosticStatus: 'verified',
      mcpPosture: {
        readOnly: true,
        sideEffects: 'none'
      },
      commands: {
        verification: {
          endpoint: 'http://127.0.0.1:11434',
          model: 'qwen3.5:0.8b'
        }
      }
    })
    expect(result.commands.windowsRepo.map((command) => command.command)).toContain('npm run setup:qwen:win:install')
    expect(result.commands.manual.map((command) => command.command)).toContain('ollama pull qwen3.5:0.8b')

    const staleDatabase = sampleDatabase()
    staleDatabase.settings.ragMaxNotes = 3
    await writeFile(dbPath, `${JSON.stringify(staleDatabase, null, 2)}\n`, 'utf8')

    await expect(callTool('neuronotes_qwen_setup', {}, { dbPath })).resolves.toMatchObject({
      diagnosticStatus: 'missing'
    })

    const failedDatabase = sampleDatabase()
    failedDatabase.aiDiagnostics.ok = false
    failedDatabase.aiDiagnostics.status = 'fallback'
    failedDatabase.aiDiagnostics.error = 'Qwen no devolvio JSON valido.'
    await writeFile(dbPath, `${JSON.stringify(failedDatabase, null, 2)}\n`, 'utf8')

    await expect(callTool('neuronotes_qwen_setup', {}, { dbPath })).resolves.toMatchObject({
      diagnosticStatus: 'failed'
    })
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
      approvedCount: 1,
      actions: [
        {
          id: 'action-reminder',
          status: 'open',
          toolHint: 'reminder.create',
          approval: {
            required: true,
            state: 'approved',
            approvedAt: '2026-06-15T00:01:30.000Z'
          },
          toolCallDraft: {
            status: 'ready-for-review',
            toolName: 'reminder.create',
            arguments: expect.objectContaining({
              kind: 'reminder',
              title: 'Crear recordatorio',
              sourceNoteId: 'note-health',
              relatedNoteIds: ['note-project'],
              relatedNotes: [
                {
                  noteId: 'note-project',
                  title: 'Roadmap Neuronotes',
                  score: 0.7,
                  reason: 'Ambas notas mencionan Qwen local.',
                  provenance: {
                    label: 'RAG',
                    title: 'Relacion usada o recuperada como contexto RAG local.',
                    tone: 'rag'
                  }
                }
              ]
            })
          },
          sourceNote: {
            id: 'note-health',
            category: 'Salud',
            relatedNoteIds: ['note-project'],
            relatedNotes: [
              {
                noteId: 'note-project',
                title: 'Roadmap Neuronotes',
                score: 0.7,
                reason: 'Ambas notas mencionan Qwen local.',
                provenance: {
                  label: 'RAG',
                  title: 'Relacion usada o recuperada como contexto RAG local.',
                  tone: 'rag'
                }
              }
            ]
          }
        }
      ]
    })
  })

  it('builds a read-only MCP handoff package for external review', async () => {
    const result = await callTool('neuronotes_mcp_handoff', {}, { dbPath })

    expect(result).toMatchObject({
      schema: 'neuronotes.mcp-handoff.v1',
      model: 'qwen3.5:0.8b',
      ollamaUrl: 'http://127.0.0.1:11434',
      execution: {
        mode: 'manual-user-approved',
        requiresUserApproval: true,
        sideEffects: 'none-export-only'
      },
      actionCount: 1,
      approvedActionCount: 1,
      doneActionCount: 1,
      toolSummary: [
        {
          toolHint: 'reminder.create',
          actionCount: 1,
          kinds: ['reminder'],
          sourceNoteIds: ['note-health']
        }
      ],
      kindSummary: [
        {
          kind: 'reminder',
          actionCount: 1
        }
      ],
      actions: [
        expect.objectContaining({
          id: 'action-reminder',
          status: 'open',
          toolCallDraft: {
            status: 'ready-for-review',
            toolName: 'reminder.create',
            arguments: expect.objectContaining({
              sourceNoteId: 'note-health',
              relatedNoteIds: ['note-project'],
              relatedNotes: [
                {
                  noteId: 'note-project',
                  title: 'Roadmap Neuronotes',
                  score: 0.7,
                  reason: 'Ambas notas mencionan Qwen local.',
                  provenance: {
                    label: 'RAG',
                    title: 'Relacion usada o recuperada como contexto RAG local.',
                    tone: 'rag'
                  }
                }
              ],
              ragContext: [
                expect.objectContaining({
                  noteId: 'note-project'
                })
              ]
            })
          },
          sourceNote: expect.objectContaining({
            id: 'note-health',
            contentExcerpt: 'Recordar cita con el medico manana y revisar Qwen local.',
            relatedNotes: [
              {
                noteId: 'note-project',
                title: 'Roadmap Neuronotes',
                score: 0.7,
                reason: 'Ambas notas mencionan Qwen local.',
                provenance: {
                  label: 'RAG',
                  title: 'Relacion usada o recuperada como contexto RAG local.',
                  tone: 'rag'
                }
              }
            ],
            analysis: expect.objectContaining({
              provider: 'qwen',
              ragNoteIds: ['note-project']
            })
          })
        })
      ]
    })
    expect(result.actions.map((action) => action.id)).not.toContain('action-done')
  })

  it('normalizes saved action note titles from linked notes', async () => {
    const staleDatabase = sampleDatabase()
    staleDatabase.actions[0].noteTitle = 'Titulo anterior'
    await writeFile(dbPath, `${JSON.stringify(staleDatabase, null, 2)}\n`, 'utf8')

    const result = await callTool(
      'neuronotes_list_open_actions',
      {
        kind: 'reminder',
        limit: 5
      },
      { dbPath }
    )

    expect(result.actions[0]).toMatchObject({
      id: 'action-reminder',
      noteTitle: 'Cita medico'
    })
  })

  it('normalizes related note titles from linked notes', async () => {
    const staleDatabase = sampleDatabase()
    staleDatabase.notes[0].related[0].title = 'Titulo anterior'
    staleDatabase.notes[0].trainingReviewedAt = '2026-06-15T00:03:00.000Z'
    await writeFile(dbPath, `${JSON.stringify(staleDatabase, null, 2)}\n`, 'utf8')

    const result = await callTool(
      'neuronotes_get_note',
      {
        noteId: 'note-health'
      },
      { dbPath }
    )
    const database = await readNeuronotesDatabase(dbPath)
    const note = database.notes.find((item) => item.id === 'note-health')

    expect(result.note.related[0]).toMatchObject({
      noteId: 'note-project',
      title: 'Roadmap Neuronotes'
    })
    expect(note.trainingReviewedAt).toBe('2026-06-15T00:03:00.000Z')
  })

  it('summarizes library state and keeps MCP execution read-only', async () => {
    const result = await callTool('neuronotes_library_summary', {}, { dbPath })

    expect(result).toMatchObject({
      schema: 'neuronotes.mcp.summary.v1',
      noteCount: 2,
      actionCount: 2,
      openActionCount: 1,
      mcpApprovedActionCount: 1,
      fineTune: expect.objectContaining({
        reviewedExampleCount: 0,
        pendingReviewCount: 2,
        status: 'needs-review'
      }),
      aiDiagnostics: expect.objectContaining({
        ok: true,
        model: 'qwen3.5:0.8b',
        ollamaUrl: 'http://127.0.0.1:11434',
        related: 1
      }),
      qwenAnalyzedCount: 1,
      fallbackAnalyzedCount: 1,
      execution: {
        mode: 'read-only-context',
        canModifyNotes: false,
        canCreateNotes: false,
        canExecuteExternalTools: false,
        requiresUserApprovalForFollowUp: true
      }
    })
  })

  it('creates notes only when MCP write mode is explicitly enabled', async () => {
    await expect(
      callTool(
        'neuronotes_create_note',
        {
          title: 'Captura desde MCP',
          content: 'Nueva idea capturada desde un host MCP autorizado.',
          category: 'product roadmap',
          tags: ['#MCP', 'Qwen', 'mcp']
        },
        { dbPath }
      )
    ).rejects.toThrow('MCP write mode is disabled')

    const created = await callTool(
      'neuronotes_create_note',
      {
        title: 'Captura desde MCP',
        content: 'Nueva idea capturada desde un host MCP autorizado.',
        category: 'product roadmap',
        tags: ['#MCP', 'Qwen', 'mcp']
      },
      { dbPath, writeEnabled: true }
    )

    expect(created).toMatchObject({
      schema: 'neuronotes.mcp.write-note.v1',
      writeMode: 'enabled',
      note: {
        title: 'Captura desde MCP',
        summary: 'Nueva idea capturada desde un host MCP autorizado.',
        category: 'Proyecto',
        tags: ['mcp', 'qwen'],
        analysisStatus: 'idle',
        content: 'Nueva idea capturada desde un host MCP autorizado.',
        related: [
          expect.objectContaining({
            noteId: 'note-project',
            title: 'Roadmap Neuronotes'
          }),
          expect.objectContaining({
            noteId: 'note-health',
            title: 'Cita medico'
          })
        ],
        suggestedActionCount: 1,
        suggestedActions: [
          expect.objectContaining({
            kind: 'mcp',
            toolHint: 'mcp.workflow.prepare'
          })
        ]
      },
      next: {
        analysisStatus: 'idle',
        qwenQueue: 'pending'
      }
    })

    const database = await readNeuronotesDatabase(dbPath)
    expect(database.notes[0]).toMatchObject({
      id: created.note.id,
      title: 'Captura desde MCP',
      analysisStatus: 'idle',
      summary: 'Nueva idea capturada desde un host MCP autorizado.',
      related: [
        expect.objectContaining({
          noteId: 'note-project',
          title: 'Roadmap Neuronotes',
          reason: 'Relacion local inicial por etiquetas y contenido.'
        }),
        expect.objectContaining({
          noteId: 'note-health',
          title: 'Cita medico'
        })
      ],
      suggestedActions: [
        expect.objectContaining({
          kind: 'mcp',
          toolHint: 'mcp.workflow.prepare'
        })
      ]
    })
    expect(database.notes.find((note) => note.id === 'note-project')?.related).toContainEqual(
      expect.objectContaining({
        noteId: created.note.id,
        title: 'Captura desde MCP',
        reason: expect.stringContaining('Enlace reciproco: Relacion local inicial')
      })
    )

    const projectSearch = await callTool('neuronotes_search_notes', { category: 'project' }, { dbPath })
    expect(projectSearch).toMatchObject({
      schema: 'neuronotes.mcp.search.v1',
      count: 2
    })
    expect(projectSearch.notes.every((note) => note.category === 'Proyecto')).toBe(true)

    const backup = JSON.parse(await readFile(path.join(tempDir, 'neuronotes.json.bak'), 'utf8'))
    expect(backup.notes[0]).toMatchObject({
      id: created.note.id,
      title: 'Captura desde MCP'
    })

    await expect(callTool('neuronotes_library_summary', {}, { dbPath, writeEnabled: true })).resolves.toMatchObject({
      noteCount: 3,
      execution: {
        mode: 'write-enabled-local',
        canModifyNotes: true,
        canCreateNotes: true,
        canAppendNotes: true,
        canCreateActions: true,
        canExecuteExternalTools: false
      }
    })
  })

  it('seeds MCP-captured quick notes with local metadata, actions, and initial links', async () => {
    const created = await callTool(
      'neuronotes_create_note',
      {
        content: 'Preparar workflow MCP para #Cliente y #RAG local'
      },
      { dbPath, writeEnabled: true }
    )

    expect(created).toMatchObject({
      schema: 'neuronotes.mcp.write-note.v1',
      note: {
        title: 'Preparar workflow MCP para local',
        summary: 'Preparar workflow MCP para local',
        category: 'Trabajo',
        tags: ['cliente', 'rag'],
        analysisStatus: 'idle',
        related: [
          expect.objectContaining({
            noteId: 'note-project',
            title: 'Roadmap Neuronotes'
          })
        ],
        suggestedActions: [
          expect.objectContaining({ kind: 'task', toolHint: 'task.create' }),
          expect.objectContaining({ kind: 'mcp', toolHint: 'mcp.workflow.prepare' })
        ]
      },
      next: {
        qwenQueue: 'pending'
      }
    })

    const database = await readNeuronotesDatabase(dbPath)
    expect(database.notes[0]).toMatchObject({
      id: created.note.id,
      title: 'Preparar workflow MCP para local',
      summary: 'Preparar workflow MCP para local',
      category: 'Trabajo',
      tags: ['cliente', 'rag'],
      suggestedActions: [
        expect.objectContaining({ kind: 'task' }),
        expect.objectContaining({ kind: 'mcp' })
      ],
      related: [
        expect.objectContaining({
          noteId: 'note-project',
          reason: expect.stringContaining('Relacion local inicial')
        })
      ]
    })
  })

  it('seeds MCP-captured notes from explicit wiki and mention links', async () => {
    const created = await callTool(
      'neuronotes_create_note',
      {
        content: 'Cruzar [[Roadmap Neuronotes]] con @cita-medico para preparar contexto local.'
      },
      { dbPath, writeEnabled: true }
    )

    expect(created.note.related).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          noteId: 'note-project',
          title: 'Roadmap Neuronotes',
          score: 0.97,
          reason: 'Referencia explicita en la nota.'
        }),
        expect.objectContaining({
          noteId: 'note-health',
          title: 'Cita medico',
          score: 0.97,
          reason: 'Referencia explicita en la nota.'
        })
      ])
    )

    const database = await readNeuronotesDatabase(dbPath)
    expect(database.notes.find((note) => note.id === 'note-project')?.related).toContainEqual(
      expect.objectContaining({
        noteId: created.note.id,
        reason: 'Enlace reciproco: Referencia explicita en la nota.'
      })
    )
  })

  it('appends context to existing notes only when MCP write mode is enabled', async () => {
    await expect(
      callTool(
        'neuronotes_append_note',
        {
          noteId: 'note-health',
          content: 'Nueva evidencia: revisar [[Roadmap Neuronotes]] para #RAG y preparar recordatorio MCP.'
        },
        { dbPath }
      )
    ).rejects.toThrow('MCP write mode is disabled')

    const updated = await callTool(
      'neuronotes_append_note',
      {
        noteId: 'note-health',
        content: 'Nueva evidencia: revisar [[Roadmap Neuronotes]] para #RAG y preparar recordatorio MCP.'
      },
      { dbPath, writeEnabled: true }
    )

    expect(updated).toMatchObject({
      schema: 'neuronotes.mcp.append-note.v1',
      writeMode: 'enabled',
      note: {
        id: 'note-health',
        title: 'Cita medico',
        category: 'Salud',
        tags: ['salud', 'qwen', 'rag'],
        analysisStatus: 'idle',
        content: expect.stringContaining('Nueva evidencia'),
        related: [
          expect.objectContaining({
            noteId: 'note-project',
            title: 'Roadmap Neuronotes',
            reason: 'Referencia explicita en la nota.'
          })
        ],
        suggestedActions: expect.arrayContaining([
          expect.objectContaining({ kind: 'reminder', toolHint: 'reminder.create' }),
          expect.objectContaining({ kind: 'mcp', toolHint: 'mcp.workflow.prepare' })
        ])
      },
      next: {
        analysisStatus: 'idle',
        qwenQueue: 'pending'
      }
    })

    const database = await readNeuronotesDatabase(dbPath)
    const note = database.notes.find((item) => item.id === 'note-health')
    expect(note).toMatchObject({
      analysisStatus: 'idle',
      analysisError: undefined,
      analysisRun: undefined,
      trainingReviewedAt: undefined
    })
    expect(database.notes.find((item) => item.id === 'note-project')?.related).toContainEqual(
      expect.objectContaining({
        noteId: 'note-health',
        reason: 'Enlace reciproco: Referencia explicita en la nota.'
      })
    )

    const backup = JSON.parse(await readFile(path.join(tempDir, 'neuronotes.json.bak'), 'utf8'))
    expect(backup.notes.find((item) => item.id === 'note-health')?.content).toContain('Nueva evidencia')
  })

  it('creates local action intents only when MCP write mode is explicitly enabled', async () => {
    const args = {
      noteId: 'note-health',
      kind: 'task',
      title: 'Preparar agenda MCP',
      detail: 'Convertir la nota medica en una tarea local antes del handoff.',
      toolHint: 'task.create',
      confidence: 0.72
    }

    await expect(callTool('neuronotes_create_action', args, { dbPath })).rejects.toThrow('MCP write mode is disabled')

    const created = await callTool('neuronotes_create_action', args, { dbPath, writeEnabled: true })

    expect(created).toMatchObject({
      schema: 'neuronotes.mcp.write-action.v1',
      writeMode: 'enabled',
      created: true,
      action: {
        noteId: 'note-health',
        noteTitle: 'Cita medico',
        kind: 'task',
        title: 'Preparar agenda MCP',
        detail: 'Convertir la nota medica en una tarea local antes del handoff.',
        toolHint: 'task.create',
        confidence: 0.72,
        status: 'open',
        approval: {
          required: true,
          state: 'needs-review',
          approvedAt: null
        },
        toolCallDraft: {
          status: 'ready-for-review',
          toolName: 'task.create',
          arguments: expect.objectContaining({
            sourceNoteId: 'note-health',
            relatedNoteIds: ['note-project'],
            relatedNotes: [
              {
                noteId: 'note-project',
                title: 'Roadmap Neuronotes',
                score: 0.7,
                reason: 'Ambas notas mencionan Qwen local.',
                provenance: {
                  label: 'RAG',
                  title: 'Relacion usada o recuperada como contexto RAG local.',
                  tone: 'rag'
                }
              }
            ],
            ragContext: [
              expect.objectContaining({
                noteId: 'note-project'
              })
            ]
          })
        },
        sourceNote: {
          id: 'note-health',
          title: 'Cita medico',
          relatedNoteIds: ['note-project'],
          relatedNotes: [
            {
              noteId: 'note-project',
              title: 'Roadmap Neuronotes',
              score: 0.7,
              reason: 'Ambas notas mencionan Qwen local.',
              provenance: {
                label: 'RAG',
                title: 'Relacion usada o recuperada como contexto RAG local.',
                tone: 'rag'
              }
            }
          ],
          analysisStatus: 'qwen'
        }
      },
      next: {
        status: 'open',
        mcpApproval: 'needs-review',
        handoff: 'ready-for-review'
      }
    })

    const database = await readNeuronotesDatabase(dbPath)
    expect(database.actions[0]).toMatchObject({
      id: created.action.id,
      noteId: 'note-health',
      noteTitle: 'Cita medico',
      kind: 'task',
      title: 'Preparar agenda MCP',
      toolHint: 'task.create',
      status: 'open'
    })
    expect(database.actions[0].mcpApprovedAt).toBeUndefined()

    const handoff = await callTool('neuronotes_mcp_handoff', {}, { dbPath })
    expect(handoff).toMatchObject({
      actionCount: 2,
      approvedActionCount: 1,
      actions: expect.arrayContaining([
        expect.objectContaining({
          id: created.action.id,
          approval: {
            required: true,
            state: 'needs-review',
            approvedAt: null
          },
          toolCallDraft: expect.objectContaining({
            status: 'ready-for-review',
            toolName: 'task.create'
          })
        })
      ])
    })

    const duplicate = await callTool('neuronotes_create_action', args, { dbPath, writeEnabled: true })
    const databaseAfterDuplicate = await readNeuronotesDatabase(dbPath)

    expect(duplicate).toMatchObject({
      created: false,
      action: {
        id: created.action.id,
        approval: {
          state: 'needs-review'
        }
      }
    })
    expect(databaseAfterDuplicate.actions).toHaveLength(database.actions.length)
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
    aiDiagnostics: {
      ok: true,
      status: 'qwen',
      message: 'qwen3.5:0.8b respondio correctamente',
      model: 'qwen3.5:0.8b',
      ollamaUrl: 'http://127.0.0.1:11434',
      ragMaxNotes: 5,
      ragExcerptLength: 550,
      diagnosedAt: '2026-06-15T00:05:00.000Z',
      durationMs: 842,
      category: 'Proyecto',
      summary: 'Diagnostico JSON valido.',
      related: 1
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
        mcpApprovedAt: '2026-06-15T00:01:30.000Z',
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
