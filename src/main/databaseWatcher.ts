import { FSWatcher, watch } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const DATABASE_FILE = 'neuronotes.json'
const DEFAULT_DEBOUNCE_MS = 350

export interface DatabaseChangeWatcher {
  close: () => void
}

export interface DatabaseChangeWatcherOptions {
  debounceMs?: number
  onChange: () => void
  userDataPath: string
  watchDirectory?: typeof watch
}

export async function createDatabaseChangeWatcher(
  options: DatabaseChangeWatcherOptions
): Promise<DatabaseChangeWatcher> {
  await mkdir(options.userDataPath, { recursive: true })

  const watchDirectory = options.watchDirectory ?? watch
  let timeout: NodeJS.Timeout | undefined
  const watcher = watchDirectory(options.userDataPath, (_eventType, fileName) => {
    if (!isDatabaseFileName(fileName)) {
      return
    }

    if (timeout) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(() => {
      timeout = undefined
      options.onChange()
    }, options.debounceMs ?? DEFAULT_DEBOUNCE_MS)
  })

  return {
    close: () => {
      if (timeout) {
        clearTimeout(timeout)
        timeout = undefined
      }

      watcher.close()
    }
  }
}

function isDatabaseFileName(fileName: string | Buffer | null): boolean {
  if (!fileName) {
    return false
  }

  return path.basename(fileName.toString()) === DATABASE_FILE
}
