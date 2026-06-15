import { AiHealth } from './types'

export type AiSetupStepId = 'ollama' | 'model' | 'analysis'
export type AiSetupStepState = 'ready' | 'action' | 'fallback'

export interface AiSetupStep {
  id: AiSetupStepId
  label: string
  state: AiSetupStepState
  detail: string
}

export function aiSetupSteps(health: Pick<AiHealth, 'ok' | 'ollamaAvailable' | 'modelInstalled' | 'model' | 'status'>): AiSetupStep[] {
  return [
    {
      id: 'ollama',
      label: 'Ollama',
      state: health.ollamaAvailable ? 'ready' : 'action',
      detail: health.ollamaAvailable ? 'Runtime local activo.' : 'Instala o inicia Ollama.'
    },
    {
      id: 'model',
      label: 'Modelo',
      state: health.modelInstalled ? 'ready' : 'action',
      detail: health.modelInstalled ? `${health.model} instalado.` : `Descarga ${health.model}.`
    },
    {
      id: 'analysis',
      label: 'Analisis',
      state: health.ok ? 'ready' : 'fallback',
      detail: health.ok ? 'Qwen listo para RAG.' : 'Fallback local activo.'
    }
  ]
}
