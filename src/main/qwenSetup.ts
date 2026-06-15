import { AppSettings } from './types'

export const OLLAMA_WINDOWS_INSTALL_COMMAND = 'irm https://ollama.com/install.ps1 | iex'
const DEFAULT_QWEN_MODEL = 'qwen3.5:0.8b'
const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434'

type QwenSetupSettings = Pick<AppSettings, 'model'> & Partial<Pick<AppSettings, 'ollamaUrl'>>

export function buildQwenWindowsSetupCommand(settings: QwenSetupSettings): string {
  const model = settings.model.trim() || DEFAULT_QWEN_MODEL
  const endpoint = normalizeEndpoint(settings.ollamaUrl)

  return [
    "$ErrorActionPreference = 'Stop'",
    'if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {',
    `  ${OLLAMA_WINDOWS_INSTALL_COMMAND}`,
    '}',
    `$endpoint = ${quotePowerShell(endpoint)}`,
    `$model = ${quotePowerShell(model)}`,
    '$tagsUrl = "$endpoint/api/tags"',
    '$generateUrl = "$endpoint/api/generate"',
    "$env:OLLAMA_HOST = $endpoint -replace '^https?://', ''",
    '$ollamaCommand = Get-Command ollama -ErrorAction SilentlyContinue',
    '$ollama = if ($ollamaCommand) { $ollamaCommand.Source } else { $null }',
    'if (-not $ollama) {',
    '  $ollama = @(',
    '    "$env:LOCALAPPDATA\\Programs\\Ollama\\ollama.exe",',
    '    "$env:LOCALAPPDATA\\Ollama\\ollama.exe",',
    '    "$env:ProgramFiles\\Ollama\\ollama.exe"',
    '  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1',
    '}',
    "if (-not $ollama) { throw 'Ollama executable not found after install.' }",
    'try { Invoke-RestMethod -Uri $tagsUrl -TimeoutSec 2 | Out-Null } catch {',
    "  Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden",
    '}',
    'for ($attempt = 0; $attempt -lt 30; $attempt++) {',
    '  try { Invoke-RestMethod -Uri $tagsUrl -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Seconds 2 }',
    '}',
    'Invoke-RestMethod -Uri $tagsUrl -TimeoutSec 5 | Out-Null',
    '& $ollama pull $model',
    "$body = @{ model = $model; stream = $false; format = 'json'; prompt = 'Devuelve solo JSON valido para Neuronotes: {\"ok\": true}' } | ConvertTo-Json -Depth 5",
    "Invoke-RestMethod -Uri $generateUrl -Method Post -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 5"
  ].join('\n')
}

function normalizeEndpoint(value?: string): string {
  return (value?.trim() || DEFAULT_OLLAMA_URL).replace(/\/$/, '')
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}
