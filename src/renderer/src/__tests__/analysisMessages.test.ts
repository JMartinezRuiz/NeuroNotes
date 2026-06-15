import { describe, expect, it } from 'vitest'
import { analysisResultMessage, quickCaptureProgressMessage, quickCaptureResultMessage } from '../analysisMessages'

describe('analysisResultMessage', () => {
  it('describes Qwen, local fallback, and stale analysis outcomes', () => {
    expect(analysisResultMessage({ analysisStatus: 'qwen' }, 'qwen')).toBe('Analisis Qwen listo.')
    expect(analysisResultMessage({ analysisStatus: 'fallback' }, 'local')).toBe(
      'Analisis local listo. Qwen puede actualizar esta nota cuando el modelo este disponible.'
    )
    expect(analysisResultMessage({ analysisStatus: 'fallback' }, 'qwen')).toBe(
      'Qwen no respondio; analisis local listo.'
    )
    expect(analysisResultMessage({ analysisStatus: 'idle' }, 'qwen')).toContain('La nota cambio')
  })
})

describe('quick capture messages', () => {
  it('reports quick capture progress based on the selected analysis engine', () => {
    expect(quickCaptureProgressMessage(false, 'qwen')).toBe('Nota creada.')
    expect(quickCaptureProgressMessage(true, 'qwen')).toBe('Nota creada. Analizando con Qwen...')
    expect(quickCaptureProgressMessage(true, 'local')).toBe('Nota creada. Analizando localmente...')
  })

  it('combines creation and analysis result messages', () => {
    expect(quickCaptureResultMessage({ analysisStatus: 'qwen' }, 'qwen')).toBe('Nota creada. Analisis Qwen listo.')
  })
})
