import { describe, expect, it } from 'vitest'
import { aiSetupSteps } from '../aiSetupReadiness'
import { AiHealth } from '../types'

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
    ...overrides
  }
}

describe('aiSetupSteps', () => {
  it('asks for Ollama and model setup when the runtime is missing', () => {
    expect(aiSetupSteps(health())).toEqual([
      {
        id: 'ollama',
        label: 'Ollama',
        state: 'action',
        detail: 'Instala o inicia Ollama.'
      },
      {
        id: 'model',
        label: 'Modelo',
        state: 'action',
        detail: 'Descarga qwen3.5:0.8b.'
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
      ['analysis', 'fallback']
    ])
  })

  it('marks the local AI stack as ready when Qwen is available', () => {
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
    ).toEqual(['ready', 'ready', 'ready'])
  })
})
