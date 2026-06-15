import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePreloadPath } from '../preloadPath'

describe('resolvePreloadPath', () => {
  it('matches the Electron Vite preload output file', () => {
    const mainDirectory = path.join('C:', 'app', 'out', 'main')

    expect(resolvePreloadPath(mainDirectory)).toBe(path.join('C:', 'app', 'out', 'preload', 'index.mjs'))
  })
})
