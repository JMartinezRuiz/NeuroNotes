import { describe, expect, it } from 'vitest'
import { buildQwenWindowsSetupCommand } from '../qwenSetup'

describe('buildQwenWindowsSetupCommand', () => {
  it('builds a complete PowerShell setup and verification flow for the configured model', () => {
    const command = buildQwenWindowsSetupCommand({
      model: 'qwen3.5:0.8b',
      ollamaUrl: 'http://127.0.0.1:11434'
    })

    expect(command).toContain("$ErrorActionPreference = 'Stop'")
    expect(command).toContain('if (-not (Get-Command ollama -ErrorAction SilentlyContinue))')
    expect(command).toContain('irm https://ollama.com/install.ps1 | iex')
    expect(command).toContain("$model = 'qwen3.5:0.8b'")
    expect(command).toContain("$endpoint = 'http://127.0.0.1:11434'")
    expect(command).toContain("$env:OLLAMA_HOST = $endpoint -replace '^https?://', ''")
    expect(command).toContain("Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden")
    expect(command).toContain('Invoke-RestMethod -Uri $tagsUrl')
    expect(command).toContain('& $ollama pull $model')
    expect(command).toContain('think = $false')
    expect(command).toContain('$chatUrl = "$endpoint/api/chat"')
    expect(command).toContain('sin razonamiento ni bloques <think>')
    expect(command).toContain('Invoke-RestMethod -Uri $chatUrl')
  })

  it('falls back to the default Qwen 0.8B model when the setting is blank', () => {
    expect(buildQwenWindowsSetupCommand({ model: '   ' })).toContain("$model = 'qwen3.5:0.8b'")
  })

  it('normalizes custom endpoints for copied setup commands', () => {
    expect(buildQwenWindowsSetupCommand({ model: 'qwen3.5:0.8b', ollamaUrl: 'http://127.0.0.1:11435/' })).toContain(
      "$endpoint = 'http://127.0.0.1:11435'"
    )
  })
})
