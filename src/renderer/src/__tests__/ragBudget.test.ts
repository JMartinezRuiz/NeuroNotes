import { describe, expect, it } from 'vitest'
import { summarizeRagBudget } from '../ragBudget'

describe('summarizeRagBudget', () => {
  it('marks small RAG settings as compact', () => {
    expect(summarizeRagBudget(3, 400)).toMatchObject({
      state: 'compact',
      label: 'RAG compacto',
      totalChars: 1200,
      estimatedTokens: 300
    })
  })

  it('keeps the default Qwen 0.8B settings in the balanced range', () => {
    expect(summarizeRagBudget(5, 550)).toMatchObject({
      state: 'balanced',
      label: 'RAG balanceado',
      totalChars: 2750,
      estimatedTokens: 688
    })
  })

  it('warns when the configured RAG context is heavy for the local model', () => {
    expect(summarizeRagBudget(6, 1200)).toMatchObject({
      state: 'heavy',
      label: 'RAG pesado',
      totalChars: 7200,
      estimatedTokens: 1800
    })
  })

  it('sanitizes invalid values before estimating the context budget', () => {
    expect(summarizeRagBudget(Number.NaN, -300)).toMatchObject({
      state: 'compact',
      totalChars: 0,
      estimatedTokens: 0
    })
  })
})
