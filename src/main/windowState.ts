import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export interface WindowBounds {
  height: number
  width: number
  x?: number
  y?: number
}

export interface StoredWindowState extends WindowBounds {
  isMaximized: boolean
}

export interface WindowStateSource {
  getNormalBounds(): WindowBounds
  isMaximized(): boolean
}

const WINDOW_STATE_FILE = 'window-state.json'
const DEFAULT_WIDTH = 1220
const DEFAULT_HEIGHT = 780
const MIN_WIDTH = 940
const MIN_HEIGHT = 620

export function windowStatePath(userDataPath: string): string {
  return path.join(userDataPath, WINDOW_STATE_FILE)
}

export function defaultWindowState(): StoredWindowState {
  return {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    isMaximized: false
  }
}

export function readWindowState(userDataPath: string): StoredWindowState {
  const filePath = windowStatePath(userDataPath)

  if (!existsSync(filePath)) {
    return defaultWindowState()
  }

  try {
    return normalizeWindowState(JSON.parse(readFileSync(filePath, 'utf8')))
  } catch {
    return defaultWindowState()
  }
}

export function writeWindowState(userDataPath: string, state: StoredWindowState): void {
  mkdirSync(userDataPath, { recursive: true })
  writeFileSync(windowStatePath(userDataPath), `${JSON.stringify(normalizeWindowState(state), null, 2)}\n`, 'utf8')
}

export function captureWindowState(source: WindowStateSource): StoredWindowState {
  return normalizeWindowState({
    ...source.getNormalBounds(),
    isMaximized: source.isMaximized()
  })
}

export function normalizeWindowState(value: unknown): StoredWindowState {
  if (!value || typeof value !== 'object') {
    return defaultWindowState()
  }

  const source = value as Partial<StoredWindowState>
  const state: StoredWindowState = {
    width: clampSize(source.width, MIN_WIDTH, DEFAULT_WIDTH),
    height: clampSize(source.height, MIN_HEIGHT, DEFAULT_HEIGHT),
    isMaximized: source.isMaximized === true
  }
  const x = normalizeCoordinate(source.x)
  const y = normalizeCoordinate(source.y)

  if (x !== undefined) {
    state.x = x
  }

  if (y !== undefined) {
    state.y = y
  }

  return state
}

function clampSize(value: unknown, min: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(min, Math.round(Number(value)))
}

function normalizeCoordinate(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return Math.round(Number(value))
}
