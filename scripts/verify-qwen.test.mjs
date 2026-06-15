import { describe, expect, it } from 'vitest'
import { parseArgs, resolveOllamaHostEnv } from './verify-qwen.mjs'

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
})
