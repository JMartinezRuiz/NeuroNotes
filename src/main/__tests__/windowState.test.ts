import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  captureWindowState,
  defaultWindowState,
  normalizeWindowState,
  readWindowState,
  windowStatePath,
  writeWindowState
} from '../windowState'

let userDataPath = ''

beforeEach(async () => {
  userDataPath = await mkdtemp(path.join(tmpdir(), 'neuronotes-window-state-'))
})

afterEach(async () => {
  await rm(userDataPath, { recursive: true, force: true })
})

describe('normalizeWindowState', () => {
  it('clamps undersized windows and keeps valid coordinates', () => {
    expect(
      normalizeWindowState({
        width: 600,
        height: 400,
        x: 21.4,
        y: 42.8,
        isMaximized: true
      })
    ).toEqual({
      width: 940,
      height: 620,
      x: 21,
      y: 43,
      isMaximized: true
    })
  })

  it('falls back when state is malformed', () => {
    expect(normalizeWindowState(null)).toEqual(defaultWindowState())
    expect(normalizeWindowState({ width: Number.NaN, height: 'large' })).toEqual(defaultWindowState())
  })
})

describe('readWindowState and writeWindowState', () => {
  it('round-trips normalized state under userData', async () => {
    writeWindowState(userDataPath, {
      width: 1300,
      height: 820,
      x: 100,
      y: 80,
      isMaximized: false
    })

    expect(readWindowState(userDataPath)).toEqual({
      width: 1300,
      height: 820,
      x: 100,
      y: 80,
      isMaximized: false
    })

    const raw = JSON.parse(await readFile(windowStatePath(userDataPath), 'utf8'))
    expect(raw.width).toBe(1300)
  })

  it('falls back to defaults when persisted JSON is invalid', async () => {
    await writeFile(windowStatePath(userDataPath), '{broken', 'utf8')

    expect(readWindowState(userDataPath)).toEqual(defaultWindowState())
  })
})

describe('captureWindowState', () => {
  it('captures normal bounds and maximized state from a window-like source', () => {
    expect(
      captureWindowState({
        getNormalBounds: () => ({
          width: 1440,
          height: 900,
          x: 12,
          y: 20
        }),
        isMaximized: () => true
      })
    ).toEqual({
      width: 1440,
      height: 900,
      x: 12,
      y: 20,
      isMaximized: true
    })
  })
})
