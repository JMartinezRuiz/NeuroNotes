import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeNote, checkOllama, resolveOllamaHostEnv, runAiDiagnostics } from '../ai'
import { AppSettings, NoteRecord } from '../types'

const settings: AppSettings = {
  model: 'qwen3.5:0.8b',
  ollamaUrl: 'http://127.0.0.1:11434',
  autoAnalyze: true
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
      installedModels: ['qwen3.5:0.8b']
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

  it('reports Ollama as missing when the local API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')))

    await expect(checkOllama(settings)).resolves.toMatchObject({
      ok: false,
      status: 'ollama-missing',
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

    const health = checkOllama(settings)
    await vi.advanceTimersByTimeAsync(3500)

    await expect(health).resolves.toMatchObject({
      ok: false,
      status: 'ollama-missing',
      message: 'Ollama no respondio en 3.5 s',
      ollamaAvailable: false
    })
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

describe('analyzeNote', () => {
  it('sends retrieved context to Qwen and sanitizes the JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          response: `<think>razonamiento interno</think>
{
  "title": "Mapa de notas",
  "summary": "Convierte notas rapidas en una base enlazada.",
  "category": "proyecto",
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
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const source = note({
      id: 'source',
      content: 'Proyecto Neuronotes: usar Qwen 0.8b con RAG para enlazar notas rapidas.'
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
      tags: ['qwen', 'rag', 'notas', 'medico'],
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
      'http://127.0.0.1:11434/api/generate',
      expect.objectContaining({
        method: 'POST'
      })
    )

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(request.body)) as {
      format: string
      model: string
      prompt: string
      stream: boolean
    }

    expect(body).toMatchObject({
      model: 'qwen3.5:0.8b',
      stream: false,
      format: 'json'
    })
    expect(body.prompt).toContain('Contexto recuperado:')
    expect(body.prompt).toContain('ID: context-note')
    expect(body.prompt).toContain('Titulo: Roadmap RAG local')
    expect(body.prompt).toContain('Puntuacion:')
    expect(body.prompt).toContain('Motivo:')
    expect(body.prompt).toContain('No inventes IDs')
    expect(body.prompt).toContain('suggestedActions')
    expect(body.prompt).toContain('futura capa MCP')
  })

  it('keeps local related-note ranking when Qwen returns no links', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            response: JSON.stringify({
              title: 'Resumen local',
              summary: 'Nota analizada con Qwen.',
              category: 'Proyecto',
              tags: ['qwen'],
              related: []
            })
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
      suggestedActions: [
        expect.objectContaining({
          kind: 'task',
          toolHint: 'task.create'
        })
      ]
    })
    expect(analysis.error).toBeUndefined()
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
          toolHint: 'reminder.create'
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
            response: JSON.stringify({
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
