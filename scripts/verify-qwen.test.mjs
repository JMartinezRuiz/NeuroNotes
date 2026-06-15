import { describe, expect, it } from 'vitest'
import {
  classifyOllamaConnectionFailure,
  parseArgs,
  parseJson,
  recoveryNextSteps,
  recoverySetupCommands,
  resolveOllamaHostEnv
} from './verify-qwen.mjs'

describe('verify-qwen script options', () => {
  it('parses start and pull options with sane defaults', () => {
    expect(parseArgs(['--start', '--pull'])).toMatchObject({
      endpoint: 'http://127.0.0.1:11434',
      model: 'qwen3.5:0.8b',
      pull: true,
      start: true,
      startTimeoutMs: 15000
    })
  })

  it('normalizes custom endpoints and start timeouts', () => {
    expect(
      parseArgs([
        '--endpoint',
        'http://127.0.0.1:11435/',
        '--model=qwen3.5:0.8b',
        '--start-timeout-ms=25000'
      ])
    ).toMatchObject({
      endpoint: 'http://127.0.0.1:11435',
      model: 'qwen3.5:0.8b',
      startTimeoutMs: 25000
    })
  })

  it('builds OLLAMA_HOST for local runtime startup', () => {
    expect(resolveOllamaHostEnv('http://127.0.0.1:11435')).toEqual({
      OLLAMA_HOST: '127.0.0.1:11435'
    })
  })

  it('suggests Windows setup commands when Ollama is missing', () => {
    expect(recoveryNextSteps('ollama-not-installed', 'qwen3.5:0.8b')).toEqual([
      'Install Ollama locally.',
      'Pull the configured Qwen model: qwen3.5:0.8b.',
      'Run npm run setup:qwen:win:install on Windows to install Ollama, pull Qwen, and verify JSON generation.'
    ])
    expect(recoverySetupCommands('ollama-not-installed', 'qwen3.5:0.8b')).toEqual([
      'npm run setup:qwen:win:install',
      'irm https://ollama.com/install.ps1 | iex',
      'ollama pull qwen3.5:0.8b',
      'npm run verify:qwen:start:json'
    ])
  })

  it('distinguishes a missing local executable from an unavailable runtime', () => {
    expect(classifyOllamaConnectionFailure('http://127.0.0.1:11434')).toBe('ollama-not-installed')
    expect(classifyOllamaConnectionFailure('http://localhost:11434')).toBe('ollama-not-installed')
    expect(classifyOllamaConnectionFailure('http://127.0.0.1:11434', 'C:\\Ollama\\ollama.exe')).toBe(
      'ollama-unavailable'
    )
    expect(classifyOllamaConnectionFailure('http://192.168.1.8:11434')).toBe('ollama-unavailable')
  })

  it('suggests a model pull when Ollama is available but Qwen is missing', () => {
    expect(recoveryNextSteps('model-missing', 'qwen3.5:0.8b')[0]).toBe(
      'Pull the configured Qwen model: qwen3.5:0.8b.'
    )
    expect(recoverySetupCommands('model-missing', 'qwen3.5:0.8b')).toEqual([
      'ollama pull qwen3.5:0.8b',
      'npm run verify:qwen:start:json'
    ])
  })

  it('parses fenced Qwen JSON with thinking output and trailing commas', () => {
    expect(
      parseJson(`<think>razonamiento interno</think>
\`\`\`json
{
  "title": "Setup Qwen",
  "summary": "Verifica Qwen 0.8B local.",
  "category": "Proyecto",
  "tags": ["qwen", "rag",],
}
\`\`\``)
    ).toMatchObject({
      title: 'Setup Qwen',
      summary: 'Verifica Qwen 0.8B local.',
      category: 'Proyecto',
      tags: ['qwen', 'rag']
    })
  })
})
