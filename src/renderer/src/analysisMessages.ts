import { NoteRecord } from './types'

export type AnalysisMessageEngine = 'qwen' | 'local'

export function analysisResultMessage(
  note: Pick<NoteRecord, 'analysisStatus'>,
  requestedEngine: AnalysisMessageEngine
): string {
  if (note.analysisStatus === 'qwen') {
    return 'Analisis Qwen listo.'
  }

  if (note.analysisStatus === 'fallback') {
    return requestedEngine === 'local'
      ? 'Analisis local listo. Qwen puede actualizar esta nota cuando el modelo este disponible.'
      : 'Qwen no respondio; analisis local listo.'
  }

  if (note.analysisStatus === 'error') {
    return 'No se pudo analizar la nota.'
  }

  return 'La nota cambio durante el analisis. Vuelve a analizarla para actualizar la IA.'
}

export function quickCaptureProgressMessage(autoAnalyze: boolean, engine: AnalysisMessageEngine): string {
  if (!autoAnalyze) {
    return 'Nota creada.'
  }

  return engine === 'qwen' ? 'Nota creada. Analizando con Qwen...' : 'Nota creada. Analizando localmente...'
}

export function quickCaptureResultMessage(
  note: Pick<NoteRecord, 'analysisStatus'>,
  requestedEngine: AnalysisMessageEngine
): string {
  return `Nota creada. ${analysisResultMessage(note, requestedEngine)}`
}
