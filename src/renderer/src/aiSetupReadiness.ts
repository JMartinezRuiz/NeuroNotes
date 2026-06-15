import { AiDiagnosticsResult, AiHealth } from './types'

export type AiSetupStepId = 'ollama' | 'model' | 'contract' | 'analysis'
export type AiSetupStepState = 'ready' | 'action' | 'fallback'

export interface AiSetupStep {
  id: AiSetupStepId
  label: string
  state: AiSetupStepState
  detail: string
}

export function aiSetupSteps(
  health: Pick<AiHealth, 'ok' | 'ollamaAvailable' | 'modelInstalled' | 'model' | 'status'>,
  diagnostics?: Pick<AiDiagnosticsResult, 'ok' | 'status' | 'model' | 'summary' | 'related' | 'error'> | null
): AiSetupStep[] {
  const canRunDiagnostics = health.ok && health.modelInstalled && health.ollamaAvailable
  const diagnosticsCurrent = Boolean(diagnostics && (!diagnostics.model || diagnostics.model === health.model))
  const hasDiagnostics = Boolean(diagnostics && diagnosticsCurrent)
  const contractReady = canRunDiagnostics && diagnosticsCurrent && Boolean(diagnostics?.ok)
  const analysisReady = health.ok && (!hasDiagnostics || diagnostics?.status === 'qwen')

  return [
    {
      id: 'ollama',
      label: 'Ollama',
      state: health.ollamaAvailable ? 'ready' : 'action',
      detail: health.ollamaAvailable
        ? 'Runtime local activo.'
        : health.status === 'ollama-not-installed'
          ? 'Instala Ollama.'
          : 'Inicia Ollama.'
    },
    {
      id: 'model',
      label: 'Modelo',
      state: health.modelInstalled ? 'ready' : 'action',
      detail: health.modelInstalled ? `${health.model} instalado.` : `Descarga ${health.model}.`
    },
    {
      id: 'contract',
      label: 'JSON',
      state: contractReady ? 'ready' : canRunDiagnostics ? 'action' : 'fallback',
      detail: contractDetail(health.model, diagnosticsCurrent ? diagnostics : null, canRunDiagnostics)
    },
    {
      id: 'analysis',
      label: 'Analisis',
      state: analysisReady ? 'ready' : 'fallback',
      detail: analysisReady ? 'Qwen listo para RAG.' : 'Fallback local activo.'
    }
  ]
}

function contractDetail(
  model: string,
  diagnostics: Pick<AiDiagnosticsResult, 'ok' | 'status' | 'model' | 'summary' | 'related' | 'error'> | null | undefined,
  canRunDiagnostics: boolean
): string {
  if (diagnostics?.ok) {
    return `${diagnostics.model || model} genero JSON valido con ${diagnostics.related} enlace(s) RAG.`
  }

  if (diagnostics) {
    return diagnostics.error || 'La prueba Qwen no produjo JSON valido.'
  }

  return canRunDiagnostics ? 'Pulsa Probar para validar JSON y RAG.' : 'Pendiente hasta activar Qwen.'
}
