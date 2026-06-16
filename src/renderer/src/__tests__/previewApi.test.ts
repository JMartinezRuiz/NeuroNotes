import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewApi } from '../previewApi'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createPreviewApi', () => {
  it('starts each preview instance from a clean seeded state', async () => {
    const first = createPreviewApi()
    await first.createNote('Preparar tarea MCP temporal #Cliente')
    await first.updateSettings({
      model: 'custom-preview-model',
      ragMaxNotes: 0
    })
    await first.runAiDiagnostics()

    const second = createPreviewApi()

    await expect(second.listNotes()).resolves.toMatchObject([
      { id: 'preview-roadmap' },
      { id: 'preview-ui' }
    ])
    await expect(second.listActions()).resolves.toMatchObject([{ id: 'preview-action-roadmap' }])
    await expect(second.getSettings()).resolves.toMatchObject({
      model: 'qwen3.5:0.8b',
      ragMaxNotes: 5
    })
    await expect(second.getAiDiagnostics()).resolves.toBeNull()
  })

  it('mirrors the missing Ollama install state used by the setup UI', async () => {
    const api = createPreviewApi()

    await expect(api.checkAiHealth()).resolves.toMatchObject({
      ok: false,
      status: 'ollama-not-installed',
      message: 'Ollama no esta instalado'
    })

    await expect(api.startAiRuntime()).resolves.toMatchObject({
      ok: false,
      started: false,
      reason: 'not-installed',
      message: 'Ollama no esta instalado'
    })

    await expect(api.prepareAiRuntime()).resolves.toMatchObject({
      ok: false,
      stage: 'ollama-not-installed',
      started: false,
      pulled: false,
      message: 'Ollama no esta instalado. Instala Ollama y vuelve a preparar Qwen.',
      health: {
        status: 'ollama-not-installed'
      }
    })
  })

  it('copies the same complete Qwen setup flow shown by the desktop app', async () => {
    const api = createPreviewApi()
    const result = await api.copyAiSetupCommand()

    expect(result).toMatchObject({
      ok: true,
      message: 'Comandos de setup Qwen copiados.'
    })
    expect(result.command).toContain("$ErrorActionPreference = 'Stop'")
    expect(result.command).toContain('irm https://ollama.com/install.ps1 | iex')
    expect(result.command).toContain("$model = 'qwen3.5:0.8b'")
    expect(result.command).toContain("$endpoint = 'http://127.0.0.1:11434'")
    expect(result.command).toContain("Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden")
    expect(result.command).toContain('& $ollama pull $model')
    expect(result.command).toContain('think = $false')
    expect(result.command).toContain('Invoke-RestMethod -Uri $chatUrl')
  })

  it('exposes separate read-only and write-enabled MCP host configs in preview', async () => {
    const api = createPreviewApi()
    const config = await api.getMcpConfig()

    expect(JSON.parse(config.hostConfigJson)).toEqual({
      mcpServers: {
        neuronotes: {
          command: 'node',
          args: [
            'C:\\Program Files\\Neuronotes\\resources\\mcp\\neuronotes-mcp.mjs',
            '--db',
            'C:\\Users\\you\\AppData\\Roaming\\Neuronotes\\neuronotes.json'
          ]
        }
      }
    })
    expect(JSON.parse(config.writeHostConfigJson)).toEqual({
      mcpServers: {
        'neuronotes-write': {
          command: 'node',
          args: [
            'C:\\Program Files\\Neuronotes\\resources\\mcp\\neuronotes-mcp.mjs',
            '--db',
            'C:\\Users\\you\\AppData\\Roaming\\Neuronotes\\neuronotes.json',
            '--write'
          ]
        }
      }
    })

    const copied = await api.copyMcpWriteConfig()
    expect(copied.writeArgs).toContain('--write')
  })

  it('previews structured MCP handoff drafts in browser mode', async () => {
    const api = createPreviewApi()
    const preview = await api.previewMcpHandoff()

    expect(preview).toMatchObject({
      schema: 'neuronotes.mcp-handoff.v1',
      model: 'qwen3.5:0.8b',
      actionCount: 1,
      approvedActionCount: 1
    })
    expect(preview.actions[0]).toMatchObject({
      id: 'preview-action-roadmap',
      toolCallDraft: {
        status: 'ready-for-review',
        toolName: 'task.create',
        arguments: expect.objectContaining({
          taskTitle: 'Definir plan MCP',
          taskDetail: 'Convertir el roadmap en una lista de tareas para la integracion MCP.',
          requiresUserReview: true,
          draftCompleteness: 'ready'
        })
      }
    })
  })

  it('supports local and Qwen modes for single-note analysis', async () => {
    const api = createPreviewApi()

    const local = await api.analyzeNote('preview-roadmap', 'local')
    expect(local.analysisStatus).toBe('fallback')
    expect(local.analysisError).toContain('Vista previa')
    expect(local.analysisRun).toMatchObject({
      provider: 'local'
    })

    const qwen = await api.analyzeNote('preview-roadmap', 'qwen')
    expect(qwen.analysisStatus).toBe('qwen')
    expect(qwen.analysisError).toBeUndefined()
    expect(qwen.analysisRun).toMatchObject({
      provider: 'qwen'
    })
  })

  it('preserves saved tags and inline hashtags during preview analysis', async () => {
    const api = createPreviewApi()
    const created = await api.createNote('Preparar flujo MCP con #Cliente y #RAG local')
    await api.updateNote(created.id, {
      tags: ['manual']
    })

    const analyzed = await api.analyzeNote(created.id, 'local')

    expect(analyzed.category).toBe('Trabajo')
    expect(analyzed.tags).toEqual(expect.arrayContaining(['manual', 'cliente', 'rag']))
  })

  it('seeds preview draft metadata from quick-capture hashtags', async () => {
    const api = createPreviewApi()
    const created = await api.createNote('Preparar reminder MCP para #Cliente y #RAG local')

    expect(created).toMatchObject({
      title: 'Preparar reminder MCP para local',
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

  it('seeds preview action hints for calendar and email handoff', async () => {
    const api = createPreviewApi()
    const created = await api.createNote('Agendar reunion con cliente manana y enviar correo con resumen')

    expect(created.suggestedActions).toEqual([
      expect.objectContaining({ kind: 'task', title: 'Preparar correo', toolHint: 'email.compose' }),
      expect.objectContaining({ kind: 'reminder', title: 'Crear evento de calendario', toolHint: 'calendar.create_event' })
    ])
  })

  it('creates preview notes from clipboard text', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: vi.fn().mockResolvedValue('Preparar RAG desde portapapeles #MCP')
      }
    })
    const api = createPreviewApi()

    const created = await api.createNoteFromClipboard()

    expect(created).toMatchObject({
      title: 'Preparar RAG desde portapapeles',
      tags: ['mcp'],
      analysisStatus: 'idle'
    })
    await expect(api.listNotes()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          content: 'Preparar RAG desde portapapeles #MCP'
        })
      ])
    )
  })

  it('rejects empty preview clipboard capture', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: vi.fn().mockResolvedValue('   ')
      }
    })
    const api = createPreviewApi()

    await expect(api.createNoteFromClipboard()).rejects.toThrow('El portapapeles no contiene texto')
  })

  it('seeds preview related links from local note context before analysis', async () => {
    const api = createPreviewApi()
    const created = await api.createNote('Roadmap producto notas automaticas con #roadmap y resumen local')

    expect(created.title).toBe('Roadmap producto notas automaticas con resumen local')
    expect(created.related).toEqual([
      expect.objectContaining({
        noteId: 'preview-roadmap',
        title: 'Roadmap Neuronotes'
      })
    ])
  })

  it('previews RAG context without running analysis', async () => {
    const api = createPreviewApi()
    const created = await api.createNote('Roadmap producto notas automaticas con #roadmap y resumen local')

    const preview = await api.previewRagContext(created.id)
    const stored = await api.listNotes()

    expect(preview).toMatchObject({
      schema: 'neuronotes.rag-preview.v1',
      noteId: created.id,
      model: 'qwen3.5:0.8b'
    })
    expect(preview.noteIds).toContain('preview-roadmap')
    expect(preview.items[0]).toMatchObject({
      noteId: 'preview-roadmap',
      title: 'Roadmap Neuronotes'
    })
    expect(stored.find((note) => note.id === created.id)?.analysisRun).toBeUndefined()
  })

  it('seeds preview related links from explicit wiki and mention references', async () => {
    const api = createPreviewApi()
    const created = await api.createNote('Cruzar [[Roadmap Neuronotes]] con @preview-ui para contexto local')

    expect(created.related).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          noteId: 'preview-roadmap',
          score: 0.97,
          reason: 'Referencia explicita en la nota.'
        }),
        expect.objectContaining({
          noteId: 'preview-ui',
          score: 0.97,
          reason: 'Referencia explicita en la nota.'
        })
      ])
    )
  })

  it('reseeds preview explicit links after content edits', async () => {
    const api = createPreviewApi()
    const created = await api.createNote('Nota temporal sin relacion clara')

    const updated = await api.updateNote(created.id, {
      content: 'Ahora conecta con [[Roadmap Neuronotes]] para continuar el producto.'
    })
    const notes = await api.listNotes()

    expect(updated.related).toContainEqual(
      expect.objectContaining({
        noteId: 'preview-roadmap',
        reason: 'Referencia explicita en la nota.'
      })
    )
    expect(notes.find((note) => note.id === 'preview-roadmap')?.related).toContainEqual(
      expect.objectContaining({
        noteId: created.id,
        reason: 'Enlace reciproco: Referencia explicita en la nota.'
      })
    )
  })

  it('preserves preview initial related links when analysis does not return them', async () => {
    const api = createPreviewApi()
    const created = await api.createNote('Roadmap producto notas automaticas con #roadmap y resumen local')

    expect(created.related[0]?.reason).toContain('Relacion local inicial')

    await api.createNote('Senal distinta uno para ocupar el analisis simulado')
    await api.createNote('Senal distinta dos para ocupar el analisis simulado')
    await api.createNote('Senal distinta tres para ocupar el analisis simulado')

    const analyzed = await api.analyzeNote(created.id, 'qwen')

    expect(analyzed.related).toContainEqual(
      expect.objectContaining({
        noteId: 'preview-roadmap',
        reason: expect.stringContaining('Relacion local inicial')
      })
    )
  })

  it('marks reviewed notes for fine-tuning export', async () => {
    const api = createPreviewApi()
    const analyzed = await api.analyzeNote('preview-roadmap', 'qwen')

    expect(analyzed.trainingReviewedAt).toBeUndefined()

    const reviewed = await api.setTrainingReview(analyzed.id, true)
    expect(reviewed.trainingReviewedAt).toBeTruthy()

    const result = await api.exportFineTuneDataset()
    expect(result).toMatchObject({
      ok: true,
      examples: expect.any(Number)
    })
    expect(result.examples).toBeGreaterThan(0)

    const removed = await api.setTrainingReview(analyzed.id, false)
    expect(removed.trainingReviewedAt).toBeUndefined()
  })

  it('exports the preview library as a Markdown folder result', async () => {
    const api = createPreviewApi()

    await expect(api.exportLibraryMarkdown()).resolves.toMatchObject({
      ok: true,
      message: 'Biblioteca Markdown exportada (2 notas, 3 archivos)',
      path: 'preview/neuronotes-markdown',
      notes: 2,
      files: 3
    })
  })

  it('applies RAG context settings in preview analysis', async () => {
    const api = createPreviewApi()
    const settings = await api.updateSettings({
      ragMaxNotes: 0,
      ragExcerptLength: 2000
    })

    expect(settings).toMatchObject({
      ragMaxNotes: 0,
      ragExcerptLength: 1200
    })

    const analyzed = await api.analyzeNote('preview-roadmap', 'qwen')
    expect(analyzed.analysisRun?.ragNoteIds).toEqual([])
    expect(analyzed.analysisRun?.ragContext).toEqual([])
  })

  it('clears stale preview analysis after content edits while keeping manual links', async () => {
    const api = createPreviewApi()
    const source = await api.createNote('Plan de integracion MCP con acciones automaticas')
    const target = await api.createNote('Referencia manual para conectar notas')

    const analyzed = await api.analyzeNote(source.id, 'qwen')
    expect(analyzed.related.some((related) => related.reason === 'Relacion simulada para vista previa.')).toBe(true)

    await api.addManualLink(source.id, target.id)
    await api.setTrainingReview(source.id, true)

    const updated = await api.updateNote(source.id, {
      content: 'Contenido corregido que debe esperar un nuevo analisis local.'
    })

    expect(updated.summary).toBe('Contenido corregido que debe esperar un nuevo analisis local.')
    expect(updated.suggestedActions).toEqual([])
    expect(updated.analysisStatus).toBe('idle')
    expect(updated.analysisError).toBeUndefined()
    expect(updated.analysisRun).toBeUndefined()
    expect(updated.trainingReviewedAt).toBeUndefined()
    expect(updated.related).toHaveLength(1)
    expect(updated.related[0]).toMatchObject({
      noteId: target.id,
      title: target.title,
      reason: 'Enlace manual.'
    })
  })

  it('seeds preview draft metadata after content edits while preserving curated category', async () => {
    const api = createPreviewApi()
    const created = await api.createNote('Idea visual inicial')
    await api.updateNote(created.id, {
      category: 'Ideas',
      tags: ['manual']
    })

    const updated = await api.updateNote(created.id, {
      content: 'Preparar reminder MCP para #Cliente y #RAG local'
    })

    expect(updated).toMatchObject({
      summary: 'Preparar reminder MCP para local',
      category: 'Ideas',
      tags: ['manual', 'cliente', 'rag'],
      suggestedActions: [
        expect.objectContaining({ kind: 'task', toolHint: 'task.create' }),
        expect.objectContaining({ kind: 'reminder', toolHint: 'reminder.create' }),
        expect.objectContaining({ kind: 'mcp', toolHint: 'mcp.workflow.prepare' })
      ],
      analysisStatus: 'idle'
    })
  })

  it('keeps manual preview links when a note is analyzed again', async () => {
    const api = createPreviewApi()
    const source = await api.createNote('Nota sobre RAG local con Qwen')
    const target = await api.createNote('Referencia manual estable')

    await api.addManualLink(source.id, target.id)
    const analyzed = await api.analyzeNote(source.id, 'qwen')

    expect(analyzed.related).toContainEqual(
      expect.objectContaining({
        noteId: target.id,
        title: target.title,
        reason: 'Enlace manual.'
      })
    )
  })

  it('syncs preview related titles when a linked note is renamed', async () => {
    const api = createPreviewApi()
    const source = await api.createNote('Nota fuente sobre MCP')
    const target = await api.createNote('Referencia cliente estable')

    await api.addManualLink(source.id, target.id)
    await api.updateNote(target.id, {
      title: 'Referencia cliente actualizada'
    })

    const notes = await api.listNotes()
    const updatedSource = notes.find((note) => note.id === source.id)

    expect(updatedSource?.related).toContainEqual(
      expect.objectContaining({
        noteId: target.id,
        title: 'Referencia cliente actualizada',
        reason: 'Enlace manual.'
      })
    )
  })

  it('removes stale preview reciprocal links after content edits clear automatic links', async () => {
    const api = createPreviewApi()
    const source = await api.createNote('Roadmap producto notas automaticas con #roadmap y resumen local')
    const analyzed = await api.analyzeNote(source.id, 'qwen')
    const automaticTargetId = analyzed.related.find((related) =>
      related.reason.includes('Relacion simulada para vista previa')
    )?.noteId

    expect(automaticTargetId).toBeTruthy()

    const withBacklink = await api.listNotes()
    expect(withBacklink.find((note) => note.id === automaticTargetId)?.related).toContainEqual(
      expect.objectContaining({
        noteId: source.id,
        reason: expect.stringContaining('Enlace reciproco:')
      })
    )

    await api.updateNote(source.id, {
      content: 'Contenido corregido que debe esperar un nuevo analisis local.'
    })

    const afterEdit = await api.listNotes()

    expect(afterEdit.find((note) => note.id === source.id)?.related).toEqual([])
    expect(afterEdit.find((note) => note.id === automaticTargetId)?.related).not.toContainEqual(
      expect.objectContaining({
        noteId: source.id,
        reason: expect.stringContaining('Enlace reciproco:')
      })
    )
  })

  it('removes deleted note references and clears reviewed preview examples', async () => {
    const api = createPreviewApi()
    const source = await api.createNote('Nota revisada con enlace manual')
    const target = await api.createNote('Referencia que se eliminara')

    await api.analyzeNote(source.id, 'qwen')
    await api.addManualLink(source.id, target.id)
    await api.setTrainingReview(source.id, true)
    await api.deleteNote(target.id)

    const notes = await api.listNotes()
    const updated = notes.find((note) => note.id === source.id)

    expect(updated?.related.some((related) => related.noteId === target.id)).toBe(false)
    expect(updated?.trainingReviewedAt).toBeUndefined()
  })

  it('toggles MCP approval on saved preview actions', async () => {
    const api = createPreviewApi()
    const note = await api.createNote('Preparar accion MCP desde una nota nueva')
    await api.analyzeNote(note.id, 'qwen')

    const action = await api.createActionFromSuggestion(note.id, 0)
    const approved = await api.setActionMcpApproval(action.id, true)

    expect(approved.mcpApprovedAt).toBeTruthy()

    const revoked = await api.setActionMcpApproval(action.id, false)

    expect(revoked.mcpApprovedAt).toBeUndefined()
  })

  it('updates preview action tool hints and clears stale MCP approval', async () => {
    const api = createPreviewApi()
    const note = await api.createNote('Recordatorio sin herramienta para MCP')
    await api.analyzeNote(note.id, 'qwen')

    const action = await api.createActionFromSuggestion(note.id, 0)
    await api.setActionMcpApproval(action.id, true)

    const updated = await api.setActionToolHint(action.id, 'reminder.create')

    expect(updated.toolHint).toBe('reminder.create')
    expect(updated.mcpApprovedAt).toBeUndefined()
  })
})
