import { describe, expect, it } from 'vitest'
import { GLOBAL_SHORTCUTS, registerAppGlobalShortcuts } from '../globalShortcuts'
import { AppCommand } from '../commands'

describe('global shortcuts', () => {
  it('defines Windows-friendly quick capture shortcuts', () => {
    expect(GLOBAL_SHORTCUTS).toEqual([
      {
        accelerator: 'CommandOrControl+Alt+N',
        command: 'focus-capture',
        description: 'Abrir captura rapida'
      },
      {
        accelerator: 'CommandOrControl+Alt+V',
        command: 'capture-clipboard',
        description: 'Crear nota desde portapapeles'
      }
    ])
  })

  it('registers shortcuts and dispatches app commands', () => {
    const callbacks = new Map<string, () => void>()
    const dispatched: AppCommand[] = []
    const registrations = registerAppGlobalShortcuts(
      (accelerator, callback) => {
        callbacks.set(accelerator, callback)
        return accelerator !== 'CommandOrControl+Alt+V'
      },
      (command) => dispatched.push(command)
    )

    expect(registrations).toEqual([
      expect.objectContaining({
        accelerator: 'CommandOrControl+Alt+N',
        command: 'focus-capture',
        registered: true
      }),
      expect.objectContaining({
        accelerator: 'CommandOrControl+Alt+V',
        command: 'capture-clipboard',
        registered: false
      })
    ])

    callbacks.get('CommandOrControl+Alt+N')?.()
    callbacks.get('CommandOrControl+Alt+V')?.()

    expect(dispatched).toEqual(['focus-capture', 'capture-clipboard'])
  })
})
