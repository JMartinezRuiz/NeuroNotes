import { describe, expect, it } from 'vitest'
import {
  buildPendingAnalysisKey,
  pendingAnalysisButtonTitle,
  pendingAnalysisEngine,
  pendingAnalysisProgressMessage,
  pendingAnalysisResultMessage,
  shouldAutoAnalyzePending
} from '../analysisAutomation'

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

describe('pending analysis labels', () => {
  it('uses Qwen labels when the model is healthy', () => {
    const engine = pendingAnalysisEngine(true)

    expect(engine).toBe('qwen')
    expect(pendingAnalysisButtonTitle(engine)).toBe('Analizar pendientes con Qwen')
    expect(pendingAnalysisProgressMessage('manual', engine, 2)).toBe('Analizando 2 pendientes con Qwen...')
    expect(pendingAnalysisResultMessage(engine, { analyzed: 2, failed: 0, total: 2 })).toBe(
      'Qwen actualizo 2 pendientes.'
    )
  })

  it('uses local labels when Qwen is unavailable', () => {
    const engine = pendingAnalysisEngine(false)

    expect(engine).toBe('local')
    expect(pendingAnalysisButtonTitle(engine)).toBe('Analizar pendientes con analisis local')
    expect(pendingAnalysisProgressMessage('manual', engine, 1)).toBe('Analizando 1 pendiente localmente...')
    expect(pendingAnalysisResultMessage(engine, { analyzed: 1, failed: 1, total: 2 })).toBe(
      'Analisis local proceso 1 de 2; 1 fallo.'
    )
  })

  it('keeps auto retry labeled as Qwen because it only starts after health is ready', () => {
    expect(pendingAnalysisProgressMessage('auto', 'qwen', 3)).toBe('Qwen listo. Reanalizando 3 pendientes...')
  })
})
