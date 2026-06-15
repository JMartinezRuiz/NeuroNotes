export type RagBudgetState = 'compact' | 'balanced' | 'heavy'

export interface RagBudgetStatus {
  state: RagBudgetState
  label: string
  detail: string
  totalChars: number
  estimatedTokens: number
}

export function summarizeRagBudget(maxNotes: number, excerptLength: number): RagBudgetStatus {
  const safeMaxNotes = Math.max(0, Math.floor(Number.isFinite(maxNotes) ? maxNotes : 0))
  const safeExcerptLength = Math.max(0, Math.floor(Number.isFinite(excerptLength) ? excerptLength : 0))
  const totalChars = safeMaxNotes * safeExcerptLength
  const estimatedTokens = Math.ceil(totalChars / 4)

  if (totalChars <= 1800) {
    return {
      state: 'compact',
      label: 'RAG compacto',
      detail: 'Contexto ligero para respuestas rapidas de Qwen 0.8B.',
      totalChars,
      estimatedTokens
    }
  }

  if (totalChars <= 3600) {
    return {
      state: 'balanced',
      label: 'RAG balanceado',
      detail: 'Buen equilibrio entre contexto y velocidad para Qwen 0.8B.',
      totalChars,
      estimatedTokens
    }
  }

  return {
    state: 'heavy',
    label: 'RAG pesado',
    detail: 'Demasiado contexto puede ralentizar o distraer a Qwen 0.8B.',
    totalChars,
    estimatedTokens
  }
}
