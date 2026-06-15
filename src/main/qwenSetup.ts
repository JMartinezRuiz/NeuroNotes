import { AppSettings } from './types'

export const OLLAMA_WINDOWS_INSTALL_COMMAND = 'irm https://ollama.com/install.ps1 | iex'

export function buildQwenWindowsSetupCommand(settings: Pick<AppSettings, 'model'>): string {
  const model = settings.model.trim() || 'qwen3.5:0.8b'

  return [OLLAMA_WINDOWS_INSTALL_COMMAND, `ollama pull ${model}`].join('\n')
}
