import { describe, expect, it } from 'vitest'
import { createPreviewApi } from '../previewApi'

describe('createPreviewApi', () => {
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

    expect(analyzed.tags).toEqual(expect.arrayContaining(['manual', 'cliente', 'rag']))
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

    expect(updated.summary).toBe('')
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
