import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  applyDatabaseSettings,
  buildChatPayload,
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

  it('loads model and endpoint from a Neuronotes database when requested', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'neuronotes-qwen-settings-'))
    const dbPath = path.join(tempDir, 'neuronotes.json')

    try {
      await writeFile(
        dbPath,
        JSON.stringify({
          settings: {
            model: 'qwen3.5:0.8b-custom',
            ollamaUrl: 'http://127.0.0.1:11435/'
          }
        }),
        'utf8'
      )

      await expect(applyDatabaseSettings(parseArgs(['--db', dbPath]))).resolves.toMatchObject({
        model: 'qwen3.5:0.8b-custom',
        endpoint: 'http://127.0.0.1:11435',
        settingsSource: dbPath
      })
      await expect(applyDatabaseSettings(parseArgs(['--user-data', tempDir]))).resolves.toMatchObject({
        model: 'qwen3.5:0.8b-custom',
        endpoint: 'http://127.0.0.1:11435',
        settingsSource: dbPath
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('keeps explicit verifier options ahead of database settings', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'neuronotes-qwen-settings-'))
    const dbPath = path.join(tempDir, 'neuronotes.json')

    try {
      await writeFile(
        dbPath,
        JSON.stringify({
          settings: {
            model: 'qwen3.5:0.8b-db',
            ollamaUrl: 'http://127.0.0.1:11435'
          }
        }),
        'utf8'
      )

      await expect(
        applyDatabaseSettings(
          parseArgs(['--db', dbPath, '--model', 'qwen3.5:0.8b-cli', '--endpoint', 'http://127.0.0.1:11436'])
        )
      ).resolves.toMatchObject({
        model: 'qwen3.5:0.8b-cli',
        endpoint: 'http://127.0.0.1:11436',
        settingsSource: dbPath
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
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

  it('prefers the Neuronotes payload when Qwen emits earlier JSON fragments', () => {
    expect(
      parseJson(`<think>{"scratch": true}</think>
Texto previo {"scratch": true}
{
  "title": "Contrato Qwen",
  "summary": "Verifica el contrato JSON aunque haya texto extra.",
  "category": "Proyecto",
  "tags": ["qwen", "json"],
  "related": [],
  "suggestedActions": []
}
Texto posterior {no-json}`)
    ).toMatchObject({
      title: 'Contrato Qwen',
      summary: 'Verifica el contrato JSON aunque haya texto extra.',
      category: 'Proyecto',
      tags: ['qwen', 'json']
    })
  })

  it('builds a non-thinking JSON chat probe request for Qwen 3.5', () => {
    expect(buildChatPayload('qwen3.5:0.8b')).toMatchObject({
      model: 'qwen3.5:0.8b',
      stream: false,
      think: false,
      format: 'json',
      options: {
        temperature: 0.2,
        num_ctx: 4096,
        num_predict: 320
      }
    })
    expect(buildChatPayload('qwen3.5:0.8b').messages[0].content).toContain('No incluyas razonamiento')
  })
})
