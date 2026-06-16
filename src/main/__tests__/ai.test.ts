import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  analyzeNote,
  checkOllama,
  classifyOllamaConnectionFailure,
  prepareQwenRuntime,
  resolveOllamaHostEnv,
  runAiDiagnostics
} from '../ai'
import { AiHealth, AppSettings, NoteRecord } from '../types'

const settings: AppSettings = {
  model: 'qwen3.5:0.8b',
  ollamaUrl: 'http://127.0.0.1:11434',
  autoAnalyze: true,
  ragMaxNotes: 5,
  ragExcerptLength: 550
}

function note(overrides: Partial<NoteRecord> & Pick<NoteRecord, 'id' | 'content'>): NoteRecord {
  const now = '2026-06-15T00:00:00.000Z'

  return {
    title: overrides.id,
    summary: '',
    category: 'Inbox',
    tags: [],
    related: [],
    suggestedActions: [],
    analysisStatus: 'idle',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('checkOllama', () => {
  it('reports ready when Ollama exposes the configured model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [{ name: 'qwen3.5:0.8b' }]
          }),
          { status: 200 }
        )
      )
    )

    await expect(checkOllama(settings)).resolves.toMatchObject({
      ok: true,
      status: 'ready',
      modelInstalled: true,
      installedModels: ['qwen3.5:0.8b'],
      installedQwenModels: ['qwen3.5:0.8b']
    })
  })

  it('distinguishes a running Ollama server from a missing model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [{ name: 'llama3.2:latest' }]
          }),
          { status: 200 }
        )
      )
    )

    await expect(checkOllama(settings)).resolves.toMatchObject({
      ok: false,
      status: 'model-missing',
      ollamaAvailable: true,
      modelInstalled: false
    })
  })

  it('reports installed Qwen-family models when the configured Qwen tag is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [{ name: 'llama3.2:latest' }, { name: 'qwen3.5:1.7b' }, { name: 'Qwen2.5:0.5b' }]
          }),
          { status: 200 }
        )
      )
    )

    await expect(checkOllama(settings)).resolves.toMatchObject({
      ok: false,
      status: 'model-missing',
      message: expect.stringContaining('Qwen instalado:'),
      installedModels: expect.arrayContaining(['llama3.2:latest', 'qwen3.5:1.7b', 'Qwen2.5:0.5b']),
      installedQwenModels: expect.arrayContaining(['qwen3.5:1.7b', 'Qwen2.5:0.5b'])
    })
  })

  it('reports Ollama as not installed when the local API cannot be reached and no executable exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')))

    await expect(checkOllama(settings, { findExecutable: async () => undefined })).resolves.toMatchObject({
      ok: false,
      status: 'ollama-not-installed',
      message: 'Ollama no esta instalado',
      ollamaAvailable: false
    })
  })

  it('reports Ollama as missing when an executable exists but the local API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')))

    await expect(checkOllama(settings, { findExecutable: async () => 'C:\\Ollama\\ollama.exe' })).resolves.toMatchObject({
      ok: false,
      status: 'ollama-missing',
      message: 'Ollama no disponible en http://127.0.0.1:11434',
      ollamaAvailable: false
    })
  })

  it('times out health checks that do not answer', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: string, request: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        request.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'))
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const health = checkOllama(settings, { findExecutable: async () => 'C:\\Ollama\\ollama.exe' })
    await vi.advanceTimersByTimeAsync(3500)

    await expect(health).resolves.toMatchObject({
      ok: false,
      status: 'ollama-missing',
      message: 'Ollama no respondio en 3.5 s',
      ollamaAvailable: false
    })
  })
})

describe('classifyOllamaConnectionFailure', () => {
  it('separates missing local installation from an unavailable runtime', () => {
    expect(classifyOllamaConnectionFailure('http://127.0.0.1:11434')).toBe('ollama-not-installed')
    expect(classifyOllamaConnectionFailure('http://localhost:11434')).toBe('ollama-not-installed')
    expect(classifyOllamaConnectionFailure('http://127.0.0.1:11434', 'C:\\Ollama\\ollama.exe')).toBe(
      'ollama-missing'
    )
    expect(classifyOllamaConnectionFailure('http://192.168.1.25:11434')).toBe('ollama-missing')
  })
})

describe('resolveOllamaHostEnv', () => {
  it('passes the configured Ollama host and port to a spawned runtime', () => {
    expect(resolveOllamaHostEnv('http://127.0.0.1:11435')).toEqual({
      OLLAMA_HOST: '127.0.0.1:11435'
    })
  })

  it('uses the Ollama default port when the URL omits one', () => {
    expect(resolveOllamaHostEnv('http://localhost')).toEqual({
      OLLAMA_HOST: 'localhost:11434'
    })
  })

  it('ignores invalid Ollama URLs', () => {
    expect(resolveOllamaHostEnv('not a url')).toEqual({})
  })
})

describe('prepareQwenRuntime', () => {
  const health = (overrides: Partial<AiHealth>): AiHealth => ({
    ok: false,
    status: 'ollama-missing',
    message: 'Ollama no disponible',
    model: settings.model,
    ollamaUrl: settings.ollamaUrl,
    ollamaAvailable: false,
    modelInstalled: false,
    installedModels: [],
    installedQwenModels: [],
    ...overrides
  })

  it('reports a missing Ollama installation without trying to pull the model', async () => {
    const pullModel = vi.fn()

    await expect(
      prepareQwenRuntime(settings, {
        startRuntime: async () => ({
          ok: false,
          started: false,
          reason: 'not-installed',
          message: 'Ollama no esta instalado'
        }),
        checkHealth: async () => health({ status: 'ollama-not-installed', message: 'Ollama no esta instalado' }),
        pullModel
      })
    ).resolves.toMatchObject({
      ok: false,
      stage: 'ollama-not-installed',
      started: false,
      pulled: false,
      message: 'Ollama no esta instalado. Instala Ollama y vuelve a preparar Qwen.'
    })
    expect(pullModel).not.toHaveBeenCalled()
  })

  it('starts Ollama and pulls Qwen when the runtime is available but the model is missing', async () => {
    const pullModel = vi.fn().mockResolvedValue({
      ok: true,
      message: `${settings.model} instalado`,
      model: settings.model
    })
    const checkHealth = vi.fn().mockResolvedValue(
      health({
        ok: true,
        status: 'ready',
        message: `${settings.model} listo`,
        ollamaAvailable: true,
        modelInstalled: true,
        installedModels: [settings.model]
      })
    )

    await expect(
      prepareQwenRuntime(settings, {
        startRuntime: async () => ({
          ok: true,
          started: true,
          message: 'Ollama activo. Falta qwen3.5:0.8b',
          health: health({
            status: 'model-missing',
            message: `Falta ${settings.model}`,
            ollamaAvailable: true
          })
        }),
        pullModel,
        checkHealth
      })
    ).resolves.toMatchObject({
      ok: true,
      stage: 'ready',
      started: true,
      pulled: true,
      message: `Ollama iniciado y ${settings.model} instalado. Pulsa Probar para validar JSON/RAG.`
    })
    expect(pullModel).toHaveBeenCalledOnce()
    expect(checkHealth).toHaveBeenCalledOnce()
  })

  it('keeps model download errors actionable', async () => {
    await expect(
      prepareQwenRuntime(settings, {
        startRuntime: async () => ({
          ok: true,
          started: false,
          message: 'Ollama activo. Falta qwen3.5:0.8b',
          health: health({
            status: 'model-missing',
            message: `Falta ${settings.model}`,
            ollamaAvailable: true
          })
        }),
        pullModel: async () => {
          throw new Error('pull failed')
        }
      })
    ).resolves.toMatchObject({
      ok: false,
      stage: 'error',
      started: false,
      pulled: false,
      message: 'pull failed',
      error: 'pull failed'
    })
  })
})

describe('analyzeNote', () => {
  it('sends retrieved context to Qwen and sanitizes the JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            role: 'assistant',
            content: `<think>razonamiento interno</think>
{
  "title": "Mapa de notas #Cliente",
  "summary": "Convierte notas rapidas en una base enlazada.",
  "category": "project roadmap",
  "tags": ["#Qwen", "RAG", "Notas", "M\u00e9dico"],
  "related": [
    { "noteId": "context-note", "reason": "Usa el roadmap existente como contexto." },
    { "noteId": "missing-note", "reason": "No debe sobrevivir." }
  ],
  "suggestedActions": [
    {
      "kind": "task",
      "title": "Crear plan MCP",
      "detail": "Convertir el roadmap en tareas ejecutables.",
      "toolHint": "task.create",
      "confidence": 1.4
    }
  ]
}`
          }
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const source = note({
      id: 'source',
      title: 'Nota fuente Qwen',
      category: 'Proyecto',
      tags: ['producto'],
      content: 'Proyecto Neuronotes: usar Qwen 0.8b con RAG para enlazar notas rapidas. #Cliente'
    })
    const contextNote = note({
      id: 'context-note',
      title: 'Roadmap RAG local',
      category: 'Proyecto',
      tags: ['qwen', 'rag'],
      content: 'El roadmap define RAG local, resumen automatico y enlaces entre notas relacionadas.'
    })

    await expect(analyzeNote(source, [source, contextNote], settings)).resolves.toMatchObject({
      status: 'qwen',
      title: 'Mapa de notas',
      summary: 'Convierte notas rapidas en una base enlazada.',
      category: 'Proyecto',
      tags: ['producto', 'cliente', 'qwen', 'rag', 'notas', 'medico'],
      analysisRun: {
        provider: 'qwen',
        model: 'qwen3.5:0.8b',
        ragNoteIds: ['context-note'],
        ragContext: [
          expect.objectContaining({
            noteId: 'context-note',
            title: 'Roadmap RAG local',
            category: 'Proyecto',
            tags: ['qwen', 'rag']
          })
        ]
      },
      suggestedActions: [
        {
          kind: 'task',
          title: 'Crear plan MCP',
          detail: 'Convertir el roadmap en tareas ejecutables.',
          toolHint: 'task.create',
          confidence: 1
        }
      ],
      related: [
        expect.objectContaining({
          noteId: 'context-note',
          title: 'Roadmap RAG local',
          score: 0.92,
          reason: 'Usa el roadmap existente como contexto.'
        })
      ]
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/chat',
      expect.objectContaining({
        method: 'POST'
      })
    )

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(request.body)) as {
      format: string
      messages: Array<{ content: string; role: string }>
      model: string
      options: { num_ctx: number; num_predict: number; temperature: number }
      stream: boolean
      think: boolean
    }

    expect(body).toMatchObject({
      model: 'qwen3.5:0.8b',
      stream: false,
      think: false,
      format: 'json'
    })
    expect(body.options).toMatchObject({
      temperature: 0.2,
      num_ctx: 4096,
      num_predict: 550
    })
    expect(body.messages).toEqual([expect.objectContaining({ role: 'user', content: expect.any(String) })])
    expect(body.messages[0].content).toContain('Contexto recuperado:')
    expect(body.messages[0].content).toContain('ID: context-note')
    expect(body.messages[0].content).toContain('Titulo: Roadmap RAG local')
    expect(body.messages[0].content).toContain('Puntuacion:')
    expect(body.messages[0].content).toContain('Motivo:')
    expect(body.messages[0].content).toContain('No inventes IDs')
    expect(body.messages[0].content).toContain('suggestedActions')
    expect(body.messages[0].content).toContain('futura capa MCP')
    expect(body.messages[0].content).toContain('No incluyas razonamiento')
    expect(body.messages[0].content).toContain('Fecha de referencia:\n2026-06-15')
    expect(body.messages[0].content).toContain('Metadatos actuales:')
    expect(body.messages[0].content).toContain('Titulo: Nota fuente Qwen')
    expect(body.messages[0].content).toContain('Categoria actual: Proyecto')
    expect(body.messages[0].content).toContain('Etiquetas actuales: producto')
  })

  it('bounds long note content in the Qwen prompt while keeping retrieved context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            role: 'assistant',
            content: JSON.stringify({
              title: 'Nota extensa',
              summary: 'Resume una nota extensa con contexto RAG.',
              category: 'Proyecto',
              tags: ['qwen', 'rag'],
              related: [{ noteId: 'context-note', reason: 'Comparte el plan RAG local.' }]
            })
          }
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const sentinel = 'sentinel-final-que-no-debe-llegar-al-prompt'
    const source = note({
      id: 'source',
      title: 'Nota larga Qwen',
      category: 'Proyecto',
      tags: ['qwen'],
      content: `${'Proyecto Neuronotes Qwen RAG local con enlaces automaticos. '.repeat(90)}${sentinel}`
    })
    const contextNote = note({
      id: 'context-note',
      title: 'Contexto RAG local',
      category: 'Proyecto',
      tags: ['qwen', 'rag'],
      content: 'El contexto RAG local ayuda a resumir y enlazar notas de Neuronotes con Qwen.'
    })

    await expect(analyzeNote(source, [source, contextNote], settings)).resolves.toMatchObject({
      status: 'qwen',
      analysisRun: {
        ragNoteIds: ['context-note']
      }
    })

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(request.body)) as {
      messages: Array<{ content: string; role: string }>
    }

    expect(body.messages[0].content).toContain('Contexto recuperado:')
    expect(body.messages[0].content).toContain('ID: context-note')
    expect(body.messages[0].content).toContain('[Contenido truncado')
    expect(body.messages[0].content).not.toContain(sentinel)
  })

  it('keeps local related-note ranking when Qwen returns no links', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: JSON.stringify({
                title: 'Resumen local',
                summary: 'Nota analizada con Qwen.',
                category: 'Proyecto',
                tags: ['qwen'],
                related: []
              })
            }
          }),
          { status: 200 }
        )
      )
    )

    const source = note({
      id: 'source',
      content: 'Proyecto Neuronotes: resumen automatico con Qwen y enlaces inteligentes.',
      tags: ['qwen'],
      category: 'Proyecto'
    })
    const localMatch = note({
      id: 'local-match',
      title: 'Enlaces inteligentes',
      category: 'Proyecto',
      tags: ['qwen'],
      content: 'Los enlaces inteligentes usan Qwen, resumen automatico y categorias de proyecto.'
    })

    await expect(analyzeNote(source, [source, localMatch], settings)).resolves.toMatchObject({
      status: 'qwen',
      related: [
        expect.objectContaining({
          noteId: 'local-match',
          title: 'Enlaces inteligentes'
        })
      ]
    })
  })

  it('repairs fenced Qwen JSON with trailing commas before falling back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: `\`\`\`json
{
  "title": "Respuesta reparada",
  "summary": "Qwen devolvio JSON con formato tolerable.",
  "category": "Proyecto",
  "tags": ["qwen", "rag",],
  "related": [],
  "suggestedActions": [
    {
      "kind": "task",
      "title": "Revisar salida Qwen",
      "detail": "Confirmar que la respuesta reparada conserva acciones.",
      "toolHint": "task.create",
      "confidence": 0.8,
    },
  ],
}
\`\`\``
            }
          }),
          { status: 200 }
        )
      )
    )

    const source = note({
      id: 'source',
      content: 'Proyecto Neuronotes: revisar tolerancia JSON para Qwen 0.8B.'
    })

    await expect(analyzeNote(source, [source], settings)).resolves.toMatchObject({
      status: 'qwen',
      title: 'Respuesta reparada',
      category: 'Proyecto',
      tags: ['qwen', 'rag'],
      suggestedActions: [
        expect.objectContaining({
          kind: 'task',
          title: 'Revisar salida Qwen',
          toolHint: 'task.create'
        })
      ]
    })
  })

  it('skips non-analysis JSON fragments before the real Qwen payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: `<think>{"scratch": true, "step": "draft"}</think>
Texto previo con datos internos {"scratch": true}
{
  "title": "Contrato JSON",
  "summary": "Qwen devolvio un payload valido despues de texto extra.",
  "category": "Proyecto",
  "tags": ["qwen", "json"],
  "related": [],
  "suggestedActions": []
}
Texto posterior {no-json}`
            }
          }),
          { status: 200 }
        )
      )
    )

    const source = note({
      id: 'source',
      content: 'Proyecto Neuronotes: reforzar parser JSON de Qwen para notas automaticas.'
    })

    await expect(analyzeNote(source, [source], settings)).resolves.toMatchObject({
      status: 'qwen',
      title: 'Contrato JSON',
      summary: 'Qwen devolvio un payload valido despues de texto extra.',
      category: 'Proyecto',
      tags: ['qwen', 'json']
    })
  })

  it('falls back to local categorization and related-note ranking when Qwen is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Ollama no disponible')))

    const source = note({
      id: 'source',
      content: 'Proyecto Neuronotes: preparar roadmap de producto y nueva feature de notas inteligentes.'
    })
    const related = note({
      id: 'related',
      title: 'Roadmap de producto',
      category: 'Proyecto',
      tags: ['roadmap'],
      content: 'El roadmap del producto incluye notas inteligentes, resumen local y enlaces automaticos.'
    })

    await expect(analyzeNote(source, [source, related], settings)).resolves.toMatchObject({
      status: 'fallback',
      category: 'Proyecto',
      analysisRun: {
        provider: 'local',
        model: 'qwen3.5:0.8b',
        ragNoteIds: ['related'],
        ragContext: [
          expect.objectContaining({
            noteId: 'related',
            title: 'Roadmap de producto'
          })
        ]
      },
      suggestedActions: [
        expect.objectContaining({
          kind: 'task',
          toolHint: 'task.create'
        })
      ],
      related: [
        expect.objectContaining({
          noteId: 'related',
          title: 'Roadmap de producto'
        })
      ]
    })
  })

  it('falls back locally when Qwen generation does not answer in time', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: string, request: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        request.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'))
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const source = note({
      id: 'source',
      content: 'Proyecto Neuronotes: preparar tarea de producto y revisar enlaces automaticos.'
    })

    const analysis = analyzeNote(source, [source], settings)
    await vi.advanceTimersByTimeAsync(45000)

    await expect(analysis).resolves.toMatchObject({
      status: 'fallback',
      error: 'qwen3.5:0.8b no respondio en 45 s',
      category: 'Proyecto',
      suggestedActions: [
        expect.objectContaining({
          kind: 'task',
          toolHint: 'task.create'
        })
      ]
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('can run local analysis without contacting Ollama', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const source = note({
      id: 'source',
      content: 'Proyecto Neuronotes: revisar tarea local para enlazar notas y preparar MCP.'
    })
    const related = note({
      id: 'related',
      title: 'Plan MCP local',
      category: 'Proyecto',
      tags: ['mcp'],
      content: 'Preparar MCP local requiere acciones guardadas, enlaces y contexto de notas.'
    })

    const analysis = await analyzeNote(source, [source, related], settings, 'local')

    expect(analysis).toMatchObject({
      status: 'fallback',
      category: 'Proyecto',
      analysisRun: {
        provider: 'local',
        model: 'qwen3.5:0.8b',
        ragNoteIds: ['related']
      },
      related: [
        expect.objectContaining({
          noteId: 'related',
          title: 'Plan MCP local'
        })
      ],
      suggestedActions: expect.arrayContaining([
        expect.objectContaining({
          kind: 'task',
          toolHint: 'task.create'
        }),
        expect.objectContaining({
          kind: 'mcp',
          toolHint: 'mcp.workflow.prepare'
        })
      ])
    })
    expect(analysis.error).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps existing tags and infers local Qwen, RAG, and MCP topic tags', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const source = note({
      id: 'source',
      tags: ['cliente'],
      content: 'Cliente pide revisar MCP y RAG para Qwen, preparar automatizacion y enlaces de notas. #Prioridad'
    })

    const analysis = await analyzeNote(source, [source], settings, 'local')

    expect(analysis).toMatchObject({
      status: 'fallback',
      title: 'Cliente pide revisar MCP y RAG para Qwen, preparar automatizacion y enlaces de notas.',
      summary: 'Cliente pide revisar MCP y RAG para Qwen, preparar automatizacion y enlaces de notas.',
      tags: expect.arrayContaining(['cliente', 'prioridad', 'qwen', 'rag', 'mcp', 'tarea'])
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('normalizes Spanish accents in local fallback analysis', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const source = note({
      id: 'source',
      content: 'Cita m\u00e9dica ma\u00f1ana para revisar salud y preparar tarea de seguimiento.'
    })

    const analysis = await analyzeNote(source, [source], settings, 'local')

    expect(analysis).toMatchObject({
      status: 'fallback',
      category: 'Salud',
      tags: expect.arrayContaining(['medica', 'manana']),
      suggestedActions: [
        expect.objectContaining({
          kind: 'task',
          toolHint: 'task.create'
        }),
        expect.objectContaining({
          kind: 'reminder',
          toolHint: 'calendar.create_event'
        })
      ]
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('runAiDiagnostics', () => {
  it('reports an ok diagnostic when Qwen returns a valid analysis', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: JSON.stringify({
                title: 'Diagnostico listo',
                summary: 'Qwen analizo la prueba de Neuronotes.',
                category: 'Proyecto',
                tags: ['qwen', 'rag'],
                related: [
                  {
                    noteId: 'diagnostic-context',
                    reason: 'Usa el contexto RAG local.'
                  }
                ]
              })
            }
          }),
          { status: 200 }
        )
      )
    )

    await expect(runAiDiagnostics(settings)).resolves.toMatchObject({
      ok: true,
      status: 'qwen',
      model: 'qwen3.5:0.8b',
      category: 'Proyecto',
      summary: 'Qwen analizo la prueba de Neuronotes.',
      related: 1
    })
  })
})
