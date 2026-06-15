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
})
