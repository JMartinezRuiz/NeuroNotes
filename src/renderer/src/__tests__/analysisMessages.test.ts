import { describe, expect, it } from 'vitest'
import {
  analysisActionLabel,
  analysisActionTitle,
  analysisResultMessage,
  isolatedAnalysisProgressMessage,
  isolatedAnalysisResultMessage,
  quickCaptureProgressMessage,
  quickCaptureResultMessage
} from '../analysisMessages'

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

describe('analysis action text', () => {
  it('makes Qwen upgrade actions explicit for local fallback notes', () => {
    expect(analysisActionLabel({ analysisStatus: 'fallback' }, true)).toBe('Actualizar Qwen')
    expect(analysisActionTitle({ analysisStatus: 'fallback' }, true)).toContain('Actualizar esta nota con Qwen')
  })

  it('labels analysis actions by the runtime that will be used', () => {
    expect(analysisActionLabel({ analysisStatus: 'idle' }, true)).toBe('Analizar Qwen')
    expect(analysisActionLabel({ analysisStatus: 'idle' }, false)).toBe('Analizar local')
    expect(analysisActionLabel({ analysisStatus: 'fallback' }, false)).toBe('Reanalizar local')
  })
})

describe('isolated note analysis messages', () => {
  it('reports progress with the selected analysis engine', () => {
    expect(isolatedAnalysisProgressMessage('qwen', 2)).toBe('Reanalizando 2 notas aisladas con Qwen...')
    expect(isolatedAnalysisProgressMessage('local', 1)).toBe('Reanalizando 1 nota aislada localmente...')
  })

  it('uses singular and plural result text correctly', () => {
    expect(isolatedAnalysisResultMessage({ qwen: 0, local: 1, failed: 0 })).toBe(
      'Notas aisladas: 1 nota reanalizada (1 local).'
    )
    expect(isolatedAnalysisResultMessage({ qwen: 2, local: 1, failed: 1 })).toBe(
      'Notas aisladas: 3 notas reanalizadas (2 Qwen, 1 local, 1 fallo).'
    )
  })
})
