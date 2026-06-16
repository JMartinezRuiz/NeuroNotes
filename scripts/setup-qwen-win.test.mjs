import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const powershell = process.platform === 'win32' ? 'powershell' : 'pwsh'
const canRunPowerShell = () => spawnSync(powershell, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major']).status === 0
const maybeIt = canRunPowerShell() ? it : it.skip

async function withDatabaseSettings(settings, test) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'neuronotes-setup-qwen-'))

  try {
    await writeFile(path.join(tempDir, 'neuronotes.json'), JSON.stringify({ settings }), 'utf8')
    await test(tempDir)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function printConfig(args) {
  const result = spawnSync(
    powershell,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/setup-qwen-win.ps1', '-PrintConfig', ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8'
    }
  )

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout)
  }

  return JSON.parse(result.stdout)
}

describe('setup-qwen-win.ps1', () => {
  maybeIt('prints model and endpoint from a Neuronotes userData database', async () => {
    await withDatabaseSettings(
      {
        model: 'qwen3.5:0.8b-db',
        ollamaUrl: 'http://127.0.0.1:11435/'
      },
      async (tempDir) => {
        expect(printConfig(['-UserDataPath', tempDir])).toMatchObject({
          Model: 'qwen3.5:0.8b-db',
          Endpoint: 'http://127.0.0.1:11435',
          SettingsSource: path.join(tempDir, 'neuronotes.json')
        })
      }
    )
  })

  maybeIt('keeps explicit setup parameters ahead of database settings', async () => {
    await withDatabaseSettings(
      {
        model: 'qwen3.5:0.8b-db',
        ollamaUrl: 'http://127.0.0.1:11435'
      },
      async (tempDir) => {
        expect(
          printConfig([
            '-UserDataPath',
            tempDir,
            '-Model',
            'qwen3.5:0.8b-cli',
            '-Endpoint',
            'http://127.0.0.1:11436/'
          ])
        ).toMatchObject({
          Model: 'qwen3.5:0.8b-cli',
          Endpoint: 'http://127.0.0.1:11436',
          SettingsSource: path.join(tempDir, 'neuronotes.json')
        })
      }
    )
  })
})
