import { describe, expect, it } from 'vitest'
import { buildPendingAnalysisKey, shouldAutoAnalyzePending } from '../analysisAutomation'

describe('buildPendingAnalysisKey', () => {
  it('returns an empty key when there are no pending notes', () => {
    expect(buildPendingAnalysisKey('qwen3.5:0.8b', [])).toBe('')
  })

  it('changes when the model or pending note content changes', () => {
    const original = buildPendingAnalysisKey('qwen3.5:0.8b', [
      {
        id: 'note-1',
        content: 'Proyecto Neuronotes con Qwen.'
      }
    ])
    const changedModel = buildPendingAnalysisKey('otro-modelo', [
      {
        id: 'note-1',
        content: 'Proyecto Neuronotes con Qwen.'
      }
    ])
    const changedContent = buildPendingAnalysisKey('qwen3.5:0.8b', [
      {
        id: 'note-1',
        content: 'Proyecto Neuronotes con Qwen y RAG.'
      }
    ])

    expect(original).not.toBe(changedModel)
    expect(original).not.toBe(changedContent)
  })
})

describe('shouldAutoAnalyzePending', () => {
  const readyDecision = {
    autoAnalyze: true,
    bootstrapped: true,
    busy: null,
    healthOk: true,
    lastAttemptKey: '',
    pendingCount: 1,
    pendingKey: 'qwen3.5:0.8b|note-1:abc'
  }

  it('starts when Qwen is ready and there are pending notes', () => {
    expect(shouldAutoAnalyzePending(readyDecision)).toBe(true)
  })

  it('does not start while another action is busy', () => {
    expect(
      shouldAutoAnalyzePending({
        ...readyDecision,
        busy: 'save'
      })
    ).toBe(false)
  })

  it('does not retry the same pending batch automatically', () => {
    expect(
      shouldAutoAnalyzePending({
        ...readyDecision,
        lastAttemptKey: readyDecision.pendingKey
      })
    ).toBe(false)
  })

  it('requires bootstrap, auto analyze, healthy Qwen, and pending notes', () => {
    expect(shouldAutoAnalyzePending({ ...readyDecision, bootstrapped: false })).toBe(false)
    expect(shouldAutoAnalyzePending({ ...readyDecision, autoAnalyze: false })).toBe(false)
    expect(shouldAutoAnalyzePending({ ...readyDecision, healthOk: false })).toBe(false)
    expect(shouldAutoAnalyzePending({ ...readyDecision, pendingCount: 0, pendingKey: '' })).toBe(false)
  })
})
