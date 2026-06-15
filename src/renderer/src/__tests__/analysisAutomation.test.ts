import { describe, expect, it } from 'vitest'
import {
  buildPendingAnalysisKey,
  isPendingForAnalysis,
  pendingAnalysisButtonTitle,
  pendingAnalysisEngine,
  pendingAnalysisProgressMessage,
  pendingAnalysisResultMessage,
  shouldAutoAnalyzePending
} from '../analysisAutomation'

describe('buildPendingAnalysisKey', () => {
  it('returns an empty key when there are no pending notes', () => {
    expect(buildPendingAnalysisKey('qwen3.5:0.8b', [], 'local')).toBe('')
  })

  it('changes when the engine, model, or pending note content changes', () => {
    const original = buildPendingAnalysisKey(
      'qwen3.5:0.8b',
      [
        {
          id: 'note-1',
          content: 'Proyecto Neuronotes con Qwen.'
        }
      ],
      'qwen'
    )
    const changedEngine = buildPendingAnalysisKey(
      'qwen3.5:0.8b',
      [
        {
          id: 'note-1',
          content: 'Proyecto Neuronotes con Qwen.'
        }
      ],
      'local'
    )
    const changedModel = buildPendingAnalysisKey(
      'otro-modelo',
      [
        {
          id: 'note-1',
          content: 'Proyecto Neuronotes con Qwen.'
        }
      ],
      'qwen'
    )
    const changedContent = buildPendingAnalysisKey(
      'qwen3.5:0.8b',
      [
        {
          id: 'note-1',
          content: 'Proyecto Neuronotes con Qwen y RAG.'
        }
      ],
      'qwen'
    )

    expect(original).not.toBe(changedEngine)
    expect(original).not.toBe(changedModel)
    expect(original).not.toBe(changedContent)
  })
})

describe('shouldAutoAnalyzePending', () => {
  const readyDecision = {
    autoAnalyze: true,
    bootstrapped: true,
    busy: null,
    lastAttemptKey: '',
    pendingCount: 1,
    pendingKey: 'qwen|qwen3.5:0.8b|note-1:abc'
  }

  it('starts when auto analyze is enabled and there are pending notes', () => {
    expect(shouldAutoAnalyzePending(readyDecision)).toBe(true)
  })

  it('allows a local auto-analysis pass before a later Qwen upgrade pass', () => {
    const localKey = 'local|qwen3.5:0.8b|note-1:abc'
    const qwenKey = 'qwen|qwen3.5:0.8b|note-1:abc'

    expect(shouldAutoAnalyzePending({ ...readyDecision, pendingKey: localKey })).toBe(true)
    expect(
      shouldAutoAnalyzePending({
        ...readyDecision,
        lastAttemptKey: localKey,
        pendingKey: qwenKey
      })
    ).toBe(true)
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

  it('requires bootstrap, auto analyze, and pending notes', () => {
    expect(shouldAutoAnalyzePending({ ...readyDecision, bootstrapped: false })).toBe(false)
    expect(shouldAutoAnalyzePending({ ...readyDecision, autoAnalyze: false })).toBe(false)
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
    expect(pendingAnalysisResultMessage(engine, { analyzed: 3, failed: 0, total: 3, qwen: 2, local: 1, skipped: 0 })).toBe(
      'Qwen actualizo 3 pendientes (2 Qwen, 1 local).'
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
    expect(pendingAnalysisResultMessage(engine, { analyzed: 2, failed: 1, total: 4, qwen: 0, local: 2, skipped: 1 })).toBe(
      'Analisis local proceso 2 de 4 (2 local, 1 omitida); 1 fallo.'
    )
  })

  it('keeps auto retry labeled as Qwen because it only starts after health is ready', () => {
    expect(pendingAnalysisProgressMessage('auto', 'qwen', 3)).toBe('Qwen listo. Reanalizando 3 pendientes...')
  })

  it('labels automatic local fallback analysis without implying Qwen is ready', () => {
    expect(pendingAnalysisProgressMessage('auto', 'local', 2)).toBe('Analizando 2 pendientes localmente...')
  })
})

describe('isPendingForAnalysis', () => {
  it('keeps fallback notes out of local pending batches', () => {
    expect(isPendingForAnalysis('idle', 'local')).toBe(true)
    expect(isPendingForAnalysis('error', 'local')).toBe(true)
    expect(isPendingForAnalysis('fallback', 'local')).toBe(false)
    expect(isPendingForAnalysis('qwen', 'local')).toBe(false)
  })

  it('keeps fallback notes pending for Qwen upgrade batches', () => {
    expect(isPendingForAnalysis('idle', 'qwen')).toBe(true)
    expect(isPendingForAnalysis('error', 'qwen')).toBe(true)
    expect(isPendingForAnalysis('fallback', 'qwen')).toBe(true)
    expect(isPendingForAnalysis('qwen', 'qwen')).toBe(false)
  })
})
