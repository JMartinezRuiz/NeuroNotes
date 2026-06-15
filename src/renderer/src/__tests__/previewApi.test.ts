import { describe, expect, it } from 'vitest'
import { createPreviewApi } from '../previewApi'

describe('createPreviewApi', () => {
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
})
