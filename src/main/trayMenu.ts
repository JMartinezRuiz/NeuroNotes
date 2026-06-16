import type { MenuItemConstructorOptions } from 'electron'

export type TrayMenuActions = {
  show: () => void
  capture: () => void
  captureClipboard: () => void
  quit: () => void
}

export function buildTrayMenuTemplate(actions: TrayMenuActions): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Mostrar Neuronotes',
      click: actions.show
    },
    { type: 'separator' },
    {
      label: 'Nueva nota',
      click: actions.capture
    },
    {
      label: 'Nota desde portapapeles',
      click: actions.captureClipboard
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: actions.quit
    }
  ]
}
