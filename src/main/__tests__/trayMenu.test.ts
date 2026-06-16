import { describe, expect, it, vi } from 'vitest'
import { buildTrayMenuTemplate } from '../trayMenu'

describe('tray menu', () => {
  it('exposes quick note capture actions from the system tray', () => {
    const actions = {
      show: vi.fn(),
      capture: vi.fn(),
      captureClipboard: vi.fn(),
      quit: vi.fn()
    }

    const template = buildTrayMenuTemplate(actions)

    expect(template.map((item) => item.label ?? item.type)).toEqual([
      'Mostrar Neuronotes',
      'separator',
      'Nueva nota',
      'Nota desde portapapeles',
      'separator',
      'Salir'
    ])

    template[0].click?.(undefined as never, undefined as never, undefined as never)
    template[2].click?.(undefined as never, undefined as never, undefined as never)
    template[3].click?.(undefined as never, undefined as never, undefined as never)
    template[5].click?.(undefined as never, undefined as never, undefined as never)

    expect(actions.show).toHaveBeenCalledTimes(1)
    expect(actions.capture).toHaveBeenCalledTimes(1)
    expect(actions.captureClipboard).toHaveBeenCalledTimes(1)
    expect(actions.quit).toHaveBeenCalledTimes(1)
  })
})
