export interface PendingAnalysisNote {
  id: string
  content: string
}

export interface AutoAnalyzeDecision {
  autoAnalyze: boolean
  bootstrapped: boolean
  busy: string | null
  healthOk: boolean
  lastAttemptKey: string
  pendingCount: number
  pendingKey: string
}

export type PendingAnalysisEngine = 'qwen' | 'local'
export type PendingAnalysisStatus = 'idle' | 'qwen' | 'fallback' | 'error'

export interface PendingAnalysisResultSummary {
  analyzed: number
  failed: number
  local?: number
  qwen?: number
  skipped?: number
  total: number
}

export function buildPendingAnalysisKey(model: string, notes: PendingAnalysisNote[]): string {
  if (notes.length === 0) {
    return ''
  }

  const noteFingerprints = notes.map((note) => `${note.id}:${fingerprint(note.content)}`)
  return [model.trim().toLowerCase(), ...noteFingerprints].join('|')
}

export function pendingAnalysisEngine(healthOk: boolean): PendingAnalysisEngine {
  return healthOk ? 'qwen' : 'local'
}

export function pendingAnalysisButtonTitle(engine: PendingAnalysisEngine): string {
  return engine === 'qwen' ? 'Analizar pendientes con Qwen' : 'Analizar pendientes con analisis local'
}

export function isPendingForAnalysis(status: PendingAnalysisStatus, engine: PendingAnalysisEngine): boolean {
  if (engine === 'local') {
    return status === 'idle' || status === 'error'
  }

  return status !== 'qwen'
}

export function pendingAnalysisProgressMessage(
  mode: 'manual' | 'auto',
  engine: PendingAnalysisEngine,
  count: number
): string {
  const pending = formatPendingCount(count)

  if (mode === 'auto') {
    return `Qwen listo. Reanalizando ${pending}...`
  }

  return engine === 'qwen'
    ? `Analizando ${pending} con Qwen...`
    : `Analizando ${pending} localmente...`
}

export function pendingAnalysisResultMessage(
  engine: PendingAnalysisEngine,
  result: PendingAnalysisResultSummary
): string {
  const label = engine === 'qwen' ? 'Qwen' : 'Analisis local'
  const detail = pendingAnalysisDetail(result)

  if (result.failed > 0) {
    return `${label} proceso ${result.analyzed} de ${result.total}${detail}; ${formatFailureCount(result.failed)}.`
  }

  return `${label} actualizo ${formatPendingCount(result.analyzed)}${detail}.`
}

function formatPendingCount(count: number): string {
  return count === 1 ? '1 pendiente' : `${count} pendientes`
}

function formatFailureCount(count: number): string {
  return count === 1 ? '1 fallo' : `${count} fallaron`
}

function pendingAnalysisDetail(result: PendingAnalysisResultSummary): string {
  const parts = [
    typeof result.qwen === 'number' && result.qwen > 0 ? `${result.qwen} Qwen` : '',
    typeof result.local === 'number' && result.local > 0 ? `${result.local} local` : '',
    typeof result.skipped === 'number' && result.skipped > 0 ? `${result.skipped} omitida${result.skipped === 1 ? '' : 's'}` : ''
  ].filter(Boolean)

  return parts.length > 0 ? ` (${parts.join(', ')})` : ''
}

export function shouldAutoAnalyzePending(decision: AutoAnalyzeDecision): boolean {
  return (
    decision.bootstrapped &&
    decision.autoAnalyze &&
    decision.healthOk &&
    decision.pendingCount > 0 &&
    decision.busy === null &&
    decision.pendingKey.length > 0 &&
    decision.pendingKey !== decision.lastAttemptKey
  )
}

function fingerprint(value: string): string {
  let hash = 5381

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }

  return (hash >>> 0).toString(36)
}
