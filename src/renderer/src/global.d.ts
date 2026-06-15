import type { NeuronotesApi } from '../../preload'

declare global {
  interface Window {
    neuronotes?: NeuronotesApi
  }
}

export {}
