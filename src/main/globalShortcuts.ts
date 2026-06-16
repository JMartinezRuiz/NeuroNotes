import { AppCommand } from './commands'

export type GlobalShortcutDefinition = {
  accelerator: string
  command: AppCommand
  description: string
}

export type GlobalShortcutRegistration = GlobalShortcutDefinition & {
  registered: boolean
}

export const GLOBAL_SHORTCUTS: GlobalShortcutDefinition[] = [
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
]

export function registerAppGlobalShortcuts(
  register: (accelerator: string, callback: () => void) => boolean,
  dispatch: (command: AppCommand) => void
): GlobalShortcutRegistration[] {
  return GLOBAL_SHORTCUTS.map((shortcut) => ({
    ...shortcut,
    registered: register(shortcut.accelerator, () => dispatch(shortcut.command))
  }))
}
