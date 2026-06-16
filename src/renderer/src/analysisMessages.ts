import { NoteRecord } from './types'

export type AnalysisMessageEngine = 'qwen' | 'local'

export interface IsolatedAnalysisResultSummary {
  failed: number
  local: number
  qwen: number
}

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

export function analysisActionLabel(note: Pick<NoteRecord, 'analysisStatus'>, qwenReady: boolean): string {
  if (qwenReady && note.analysisStatus === 'fallback') {
    return 'Actualizar Qwen'
  }

  if (qwenReady) {
    return 'Analizar Qwen'
  }

  if (note.analysisStatus === 'fallback') {
    return 'Reanalizar local'
  }

  return 'Analizar local'
}

export function analysisActionTitle(note: Pick<NoteRecord, 'analysisStatus'>, qwenReady: boolean): string {
  if (qwenReady && note.analysisStatus === 'fallback') {
    return 'Actualizar esta nota con Qwen usando RAG local'
  }

  if (qwenReady) {
    return 'Analizar esta nota con Qwen usando RAG local'
  }

  if (note.analysisStatus === 'fallback') {
    return 'Qwen no esta listo; reanalizar con fallback local'
  }

  return 'Analizar esta nota con fallback local'
}

export function quickCaptureProgressMessage(
  autoAnalyze: boolean,
  engine: AnalysisMessageEngine,
  createdMessage = 'Nota creada.'
): string {
  if (!autoAnalyze) {
    return createdMessage
  }

  return engine === 'qwen'
    ? `${createdMessage} Analizando con Qwen...`
    : `${createdMessage} Analizando localmente...`
}

export function quickCaptureResultMessage(
  note: Pick<NoteRecord, 'analysisStatus'>,
  requestedEngine: AnalysisMessageEngine,
  createdMessage = 'Nota creada.'
): string {
  return `${createdMessage} ${analysisResultMessage(note, requestedEngine)}`
}

export function isolatedAnalysisProgressMessage(engine: AnalysisMessageEngine, count: number): string {
  const isolatedLabel = count === 1 ? '1 nota aislada' : `${count} notas aisladas`

  return engine === 'qwen'
    ? `Reanalizando ${isolatedLabel} con Qwen...`
    : `Reanalizando ${isolatedLabel} localmente...`
}

export function isolatedAnalysisResultMessage(result: IsolatedAnalysisResultSummary): string {
  const analyzedCount = result.qwen + result.local
  const analyzedLabel = formatNoteCount(analyzedCount)
  const analyzedVerb = analyzedCount === 1 ? 'reanalizada' : 'reanalizadas'
  const detail = [
    result.qwen > 0 ? `${result.qwen} Qwen` : '',
    result.local > 0 ? `${result.local} local` : '',
    result.failed > 0 ? `${result.failed} fallo${result.failed === 1 ? '' : 's'}` : ''
  ].filter(Boolean)

  return `Notas aisladas: ${analyzedLabel} ${analyzedVerb}${detail.length > 0 ? ` (${detail.join(', ')})` : ''}.`
}

function formatNoteCount(count: number): string {
  return count === 1 ? '1 nota' : `${count} notas`
}
