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

export function buildPendingAnalysisKey(model: string, notes: PendingAnalysisNote[]): string {
  if (notes.length === 0) {
    return ''
  }

  const noteFingerprints = notes.map((note) => `${note.id}:${fingerprint(note.content)}`)
  return [model.trim().toLowerCase(), ...noteFingerprints].join('|')
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
