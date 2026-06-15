import path from 'node:path'

export function resolvePreloadPath(mainDirectory: string): string {
  return path.join(mainDirectory, '../preload/index.mjs')
}
