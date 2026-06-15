import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabaseChangeWatcher } from '../databaseWatcher'

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'neuronotes-db-watch-'))
  vi.useFakeTimers()
})

afterEach(async () => {
  vi.useRealTimers()
  await rm(tempDir, { recursive: true, force: true })
})

describe('createDatabaseChangeWatcher', () => {
  it('debounces neuronotes database changes and ignores temp or backup files', async () => {
    let listener: ((eventType: string, fileName: string) => void) | undefined
    const close = vi.fn()
    const watchDirectory = vi.fn((_directory: string, callback: (eventType: string, fileName: string) => void) => {
      listener = callback
      return {
        close
      }
    })
    const onChange = vi.fn()

    const watcher = await createDatabaseChangeWatcher({
      debounceMs: 50,
      onChange,
      userDataPath: tempDir,
      watchDirectory: watchDirectory as never
    })

    expect(watchDirectory).toHaveBeenCalledWith(tempDir, expect.any(Function))

    listener?.('rename', 'neuronotes.json.tmp')
    listener?.('change', 'neuronotes.json.bak')
    await vi.advanceTimersByTimeAsync(80)
    expect(onChange).not.toHaveBeenCalled()

    listener?.('rename', 'neuronotes.json')
    listener?.('change', 'neuronotes.json')
    await vi.advanceTimersByTimeAsync(49)
    expect(onChange).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(onChange).toHaveBeenCalledTimes(1)

    watcher.close()
    expect(close).toHaveBeenCalledTimes(1)
  })
})
