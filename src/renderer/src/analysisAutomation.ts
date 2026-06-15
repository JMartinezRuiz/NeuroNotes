export interface PendingAnalysisNote {
  id: string
  content: string
  status?: PendingAnalysisStatus
}

export interface AutoAnalyzeDecision {
  autoAnalyze: boolean
  bootstrapped: boolean
  busy: string | null
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

export function buildPendingAnalysisKey(
  model: string,
  notes: PendingAnalysisNote[],
  engine: PendingAnalysisEngine = 'qwen'
): string {
  if (notes.length === 0) {
    return ''
  }

  const noteFingerprints = notes.map((note) => `${note.id}:${fingerprint(note.content)}`)
  return [engine, model.trim().toLowerCase(), ...noteFingerprints].join('|')
}

export function pendingAnalysisEngine(healthOk: boolean): PendingAnalysisEngine {
  return healthOk ? 'qwen' : 'local'
}

export function pendingAnalysisButtonTitle(engine: PendingAnalysisEngine): string {
  return engine === 'qwen' ? 'Analizar pendientes con Qwen' : 'Analizar pendientes con analisis local'
}

export function pendingAnalysisQueueLabel(
  engine: PendingAnalysisEngine,
  notes: PendingAnalysisNote[]
): string {
  if (notes.length === 0) {
    return engine === 'qwen' ? 'Qwen sin pendientes' : 'Local sin pendientes'
  }

  const counts = countPendingStatuses(notes)
  const parts =
    engine === 'qwen'
      ? [
          formatStatusCount(counts.idle, 'nueva', 'nuevas'),
          formatStatusCount(counts.fallback, 'mejora local', 'mejoras locales'),
          formatStatusCount(counts.error, 'con error', 'con error')
        ]
      : [formatStatusCount(counts.idle, 'nueva', 'nuevas'), formatStatusCount(counts.error, 'con error', 'con error')]
  const detail = parts.filter(Boolean)

  return `${engine === 'qwen' ? 'Qwen' : 'Local'}: ${detail.length > 0 ? detail.join(', ') : formatPendingCount(notes.length)}`
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
    return engine === 'qwen' ? `Qwen listo. Reanalizando ${pending}...` : `Analizando ${pending} localmente...`
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

function formatStatusCount(count: number, singular: string, plural: string): string {
  if (count === 0) {
    return ''
  }

  return `${count} ${count === 1 ? singular : plural}`
}

function countPendingStatuses(notes: PendingAnalysisNote[]): Record<PendingAnalysisStatus, number> {
  return notes.reduce(
    (counts, note) => {
      counts[note.status ?? 'idle'] += 1
      return counts
    },
    {
      idle: 0,
      qwen: 0,
      fallback: 0,
      error: 0
    }
  )
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
