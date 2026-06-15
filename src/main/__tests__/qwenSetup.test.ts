import { describe, expect, it } from 'vitest'
import { buildQwenWindowsSetupCommand } from '../qwenSetup'

describe('buildQwenWindowsSetupCommand', () => {
  it('builds PowerShell commands for Ollama and the configured model', () => {
    expect(buildQwenWindowsSetupCommand({ model: 'qwen3.5:0.8b' })).toBe(
      ['irm https://ollama.com/install.ps1 | iex', 'ollama pull qwen3.5:0.8b'].join('\n')
    )
  })

  it('falls back to the default Qwen 0.8B model when the setting is blank', () => {
    expect(buildQwenWindowsSetupCommand({ model: '   ' })).toContain('ollama pull qwen3.5:0.8b')
  })
})
