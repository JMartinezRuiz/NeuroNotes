import { describe, expect, it } from 'vitest'
import { aiSetupSteps } from '../aiSetupReadiness'
import { AiDiagnosticsResult, AiHealth } from '../types'

function health(overrides: Partial<AiHealth> = {}): AiHealth {
  return {
    ok: false,
    status: 'ollama-missing',
    message: 'Ollama no disponible',
    model: 'qwen3.5:0.8b',
    ollamaUrl: 'http://127.0.0.1:11434',
    ollamaAvailable: false,
    modelInstalled: false,
    installedModels: [],
    installedQwenModels: [],
    ...overrides
  }
}

function diagnostics(overrides: Partial<AiDiagnosticsResult> = {}): AiDiagnosticsResult {
  return {
    ok: true,
    status: 'qwen',
    message: 'qwen3.5:0.8b respondio correctamente',
    model: 'qwen3.5:0.8b',
    ollamaUrl: 'http://127.0.0.1:11434',
    ragMaxNotes: 5,
    ragExcerptLength: 550,
    diagnosedAt: '2026-06-15T00:05:00.000Z',
    durationMs: 840,
    category: 'Proyecto',
    summary: 'Prueba JSON valida.',
    related: 1,
    ...overrides
  }
}

describe('aiSetupSteps', () => {
  it('asks for Ollama installation and model setup when the runtime is not installed', () => {
    expect(aiSetupSteps(health({ status: 'ollama-not-installed', message: 'Ollama no esta instalado' }))).toEqual([
      {
        id: 'ollama',
        label: 'Ollama',
        state: 'action',
        detail: 'Instala Ollama.'
      },
      {
        id: 'model',
        label: 'Modelo',
        state: 'action',
        detail: 'Descarga qwen3.5:0.8b.'
      },
      {
        id: 'contract',
        label: 'JSON',
        state: 'fallback',
        detail: 'Pendiente hasta activar Qwen.'
      },
      {
        id: 'analysis',
        label: 'Analisis',
        state: 'fallback',
        detail: 'Fallback local activo.'
      }
    ])
  })

  it('asks to start Ollama when the executable exists but the runtime is missing', () => {
    expect(aiSetupSteps(health())).toEqual([
      {
        id: 'ollama',
        label: 'Ollama',
        state: 'action',
        detail: 'Inicia Ollama.'
      },
      {
        id: 'model',
        label: 'Modelo',
        state: 'action',
        detail: 'Descarga qwen3.5:0.8b.'
      },
      {
        id: 'contract',
        label: 'JSON',
        state: 'fallback',
        detail: 'Pendiente hasta activar Qwen.'
      },
      {
        id: 'analysis',
        label: 'Analisis',
        state: 'fallback',
        detail: 'Fallback local activo.'
      }
    ])
  })

  it('separates Ollama readiness from a missing Qwen model', () => {
    const steps = aiSetupSteps(
      health({
        status: 'model-missing',
        message: 'Falta qwen3.5:0.8b',
        ollamaAvailable: true
      })
    )

    expect(steps.map((step) => [step.id, step.state])).toEqual([
      ['ollama', 'ready'],
      ['model', 'action'],
      ['contract', 'fallback'],
      ['analysis', 'fallback']
    ])
  })

  it('mentions an installed Qwen-family model when the exact configured tag is missing', () => {
    const steps = aiSetupSteps(
      health({
        status: 'model-missing',
        message: 'Falta qwen3.5:0.8b',
        ollamaAvailable: true,
        installedQwenModels: ['qwen3.5:1.7b']
      })
    )

    expect(steps.find((step) => step.id === 'model')).toMatchObject({
      state: 'action',
      detail: 'Descarga qwen3.5:0.8b o cambia a qwen3.5:1.7b.'
    })
  })

  it('asks for a JSON probe when Qwen is installed but the contract is untested', () => {
    expect(
      aiSetupSteps(
        health({
          ok: true,
          status: 'ready',
          message: 'qwen3.5:0.8b listo',
          ollamaAvailable: true,
          modelInstalled: true,
          installedModels: ['qwen3.5:0.8b']
        })
      ).map((step) => step.state)
    ).toEqual(['ready', 'ready', 'action', 'ready'])
  })

  it('marks the local AI stack as ready after a successful Qwen JSON diagnostic', () => {
    const steps = aiSetupSteps(
      health({
        ok: true,
        status: 'ready',
        message: 'qwen3.5:0.8b listo',
        ollamaAvailable: true,
        modelInstalled: true,
        installedModels: ['qwen3.5:0.8b']
      }),
      diagnostics()
    )

    expect(steps.map((step) => step.state)).toEqual(['ready', 'ready', 'ready', 'ready'])
    expect(steps.find((step) => step.id === 'contract')?.detail).toBe(
      'qwen3.5:0.8b genero JSON valido con 1 enlace(s) RAG.'
    )
  })

  it('keeps fallback analysis visible when the Qwen diagnostic does not pass', () => {
    const steps = aiSetupSteps(
      health({
        ok: true,
        status: 'ready',
        message: 'qwen3.5:0.8b listo',
        ollamaAvailable: true,
        modelInstalled: true,
        installedModels: ['qwen3.5:0.8b']
      }),
      diagnostics({
        ok: false,
        status: 'fallback',
        error: 'Qwen no devolvio JSON valido.'
      })
    )

    expect(steps.map((step) => [step.id, step.state])).toEqual([
      ['ollama', 'ready'],
      ['model', 'ready'],
      ['contract', 'action'],
      ['analysis', 'fallback']
    ])
    expect(steps.find((step) => step.id === 'contract')?.detail).toBe('Qwen no devolvio JSON valido.')
  })
})
