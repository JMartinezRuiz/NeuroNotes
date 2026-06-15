import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions, MessageBoxOptions } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { analyzeNote, checkOllama, pullQwenModel, runAiDiagnostics, startOllamaRuntime } from './ai'
import {
  createActionItemFromSuggestion,
  deleteActionItem,
  listActionItems,
  removeActionItemsForNote,
  setActionItemStatus,
  syncActionNoteTitle
} from './actions'
import { AppCommand } from './commands'
import { buildFineTuneExamples, buildMcpHandoffPayload, fineTuneDatasetToJsonl, noteToMarkdown, safeMarkdownFileName } from './export'
import { synchronizeRelatedGraph } from './linking'
import { addManualLink, removeManualLink } from './manualLinks'
import { buildMcpConnectionConfig, resolveMcpServerPath } from './mcpConfig'
import { normalizeNoteCategory, normalizeNoteTags } from './metadata'
import {
  canApplyAnalysisResult,
  clearTrainingReview,
  hasContentChanged,
  preserveManualLinksAfterAnalysis,
  removeDeletedNoteReferences,
  resetAnalysisAfterContentEdit
} from './noteLifecycle'
import { buildQwenWindowsSetupCommand } from './qwenSetup'
import { createNoteDraft, databasePaths, listNotes, mutateDatabase, normalizeDatabase, readDatabase } from './storage'
import { captureWindowState, readWindowState, writeWindowState } from './windowState'
import {
  AnalyzePendingResult,
  AnalyzePendingMode,
  AnalysisMode,
  AiSetupCommandResult,
  AppSettings,
  ActionItemStatus,
  DatabaseFile,
  DeleteNoteResult,
  FineTuneDatasetExportResult,
  LibraryExportResult,
  LibraryImportResult,
  McpHandoffExportResult,
  NoteMarkdownExportResult,
  NoteRecord
} from './types'

function createWindow(): void {
  const userDataPath = app.getPath('userData')
  const windowState = readWindowState(userDataPath)
  const mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 940,
    minHeight: 620,
    show: false,
    title: 'Neuronotes',
    icon: path.join(__dirname, '../../build/icon.ico'),
    backgroundColor: '#f7f5ef',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', () => {
    writeWindowState(userDataPath, captureWindowState(mainWindow))
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function focusMainWindow(): void {
  const window = BrowserWindow.getAllWindows()[0]

  if (!window) {
    return
  }

  if (window.isMinimized()) {
    window.restore()
  }

  if (!window.isVisible()) {
    window.show()
  }

  window.focus()
}

function sendCommand(command: AppCommand): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

  if (!window) {
    return
  }

  window.webContents.send('app:command', command)
}

function createAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Nueva nota',
          accelerator: 'CommandOrControl+N',
          click: () => sendCommand('focus-capture')
        },
        {
          label: 'Guardar nota',
          accelerator: 'CommandOrControl+S',
          click: () => sendCommand('save-note')
        },
        {
          label: 'Analizar nota',
          accelerator: 'CommandOrControl+Enter',
          click: () => sendCommand('analyze-note')
        },
        { type: 'separator' },
        {
          label: 'Exportar nota Markdown',
          accelerator: 'CommandOrControl+Shift+E',
          click: () => sendCommand('export-markdown')
        },
        {
          label: 'Importar biblioteca',
          click: () => sendCommand('import-library')
        },
        {
          label: 'Exportar biblioteca',
          click: () => sendCommand('export-library')
        },
        {
          label: 'Exportar handoff MCP',
          click: () => sendCommand('export-mcp-handoff')
        },
        {
          label: 'Exportar dataset fine-tuning',
          click: () => sendCommand('export-finetune-dataset')
        },
        { type: 'separator' },
        {
          role: process.platform === 'darwin' ? 'close' : 'quit',
          label: process.platform === 'darwin' ? 'Cerrar ventana' : 'Salir'
        }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
        { type: 'separator' },
        {
          label: 'Buscar',
          accelerator: 'CommandOrControl+F',
          click: () => sendCommand('focus-search')
        }
      ]
    },
    {
      label: 'Vista',
      submenu: [
        {
          label: 'Nota',
          accelerator: 'CommandOrControl+1',
          click: () => sendCommand('view-note')
        },
        {
          label: 'Red',
          accelerator: 'CommandOrControl+2',
          click: () => sendCommand('view-network')
        },
        {
          label: 'Plan',
          accelerator: 'CommandOrControl+3',
          click: () => sendCommand('view-plan')
        },
        { type: 'separator' },
        {
          label: 'Ajustes',
          accelerator: 'CommandOrControl+,',
          click: () => sendCommand('toggle-settings')
        },
        { type: 'separator' },
        { role: 'reload', label: 'Recargar' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

const singleInstanceLock = app.requestSingleInstanceLock()

if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    focusMainWindow()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.neuronotes.desktop')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerIpcHandlers()
    createAppMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
        return
      }

      focusMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle('notes:list', async () => listNotes())

  ipcMain.handle('notes:create', async (_, content: string) => {
    const note = createNoteDraft(content)
    await mutateDatabase((database) => {
      database.notes.unshift(note)
    })
    return note
  })

  ipcMain.handle('notes:update', async (_, id: string, updates: Partial<Pick<NoteRecord, 'content' | 'title' | 'category' | 'tags'>>) => {
    return mutateDatabase((database) => {
      const note = database.notes.find((item) => item.id === id)

      if (!note) {
        throw new Error('Nota no encontrada')
      }

      if (typeof updates.content === 'string') {
        const contentChanged = hasContentChanged(note, updates.content)
        note.content = updates.content.trim()
        if (contentChanged) {
          resetAnalysisAfterContentEdit(note)
        }
      }

      if (typeof updates.title === 'string' && updates.title.trim()) {
        note.title = updates.title.trim()
        clearTrainingReview(note)
      }

      if (typeof updates.category === 'string' && updates.category.trim()) {
        note.category = normalizeNoteCategory(updates.category)
        clearTrainingReview(note)
      }

      if (Array.isArray(updates.tags)) {
        note.tags = normalizeNoteTags(updates.tags)
        clearTrainingReview(note)
      }

      note.updatedAt = new Date().toISOString()
      syncActionNoteTitle(database, note)
      synchronizeRelatedGraph(database.notes, note.id)
      return note
    })
  })

  ipcMain.handle('notes:setTrainingReview', async (_, id: string, reviewed: unknown) => {
    return mutateDatabase((database) => {
      const note = database.notes.find((item) => item.id === id)

      if (!note) {
        throw new Error('Nota no encontrada')
      }

      if (reviewed === true) {
        if (!isFineTuneReviewable(note)) {
          throw new Error('Analiza la nota antes de aprobarla para fine-tuning')
        }

        note.trainingReviewedAt = new Date().toISOString()
        return note
      }

      clearTrainingReview(note)
      return note
    })
  })

  ipcMain.handle('notes:delete', async (event, id: string) => {
    const database = await readDatabase()
    const note = database.notes.find((item) => item.id === id)

    if (!note) {
      throw new Error('Nota no encontrada')
    }

    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const confirmationOptions: MessageBoxOptions = {
      type: 'warning',
      buttons: ['Cancelar', 'Eliminar'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: 'Eliminar nota',
      message: `Eliminar "${note.title}"`,
      detail: 'La nota, sus enlaces y sus acciones locales se eliminaran de Neuronotes.'
    }
    const confirmation = parent
      ? await dialog.showMessageBox(parent, confirmationOptions)
      : await dialog.showMessageBox(confirmationOptions)

    if (confirmation.response !== 1) {
      return {
        ok: false,
        canceled: true,
        deleted: false,
        message: 'Eliminacion cancelada',
        noteId: id
      } satisfies DeleteNoteResult
    }

    await mutateDatabase((database) => {
      database.notes = database.notes.filter((note) => note.id !== id)
      removeDeletedNoteReferences(database.notes, id)
      removeActionItemsForNote(database, id)
    })

    return {
      ok: true,
      canceled: false,
      deleted: true,
      message: 'Nota eliminada',
      noteId: id
    } satisfies DeleteNoteResult
  })

  ipcMain.handle('actions:list', async () => {
    const database = await readDatabase()
    return listActionItems(database)
  })

  ipcMain.handle('actions:createFromSuggestion', async (_, noteId: string, suggestionIndex: number) => {
    return mutateDatabase((database) => {
      return createActionItemFromSuggestion(database, noteId, suggestionIndex)
    })
  })

  ipcMain.handle('actions:setStatus', async (_, actionId: string, status: ActionItemStatus) => {
    if (status !== 'open' && status !== 'done') {
      throw new Error('Estado de accion invalido')
    }

    return mutateDatabase((database) => {
      return setActionItemStatus(database, actionId, status)
    })
  })

  ipcMain.handle('actions:delete', async (_, actionId: string) => {
    await mutateDatabase((database) => {
      deleteActionItem(database, actionId)
    })
  })

  ipcMain.handle('notes:addManualLink', async (_, sourceId: string, targetId: string) => {
    return mutateDatabase((database) => {
      const updated = addManualLink(database.notes, sourceId, targetId)
      const target = database.notes.find((note) => note.id === targetId)
      clearTrainingReview(updated)

      if (target) {
        clearTrainingReview(target)
      }

      return updated
    })
  })

  ipcMain.handle('notes:removeLink', async (_, sourceId: string, targetId: string) => {
    return mutateDatabase((database) => {
      const updated = removeManualLink(database.notes, sourceId, targetId)
      const target = database.notes.find((note) => note.id === targetId)
      clearTrainingReview(updated)

      if (target) {
        clearTrainingReview(target)
      }

      return updated
    })
  })

  ipcMain.handle('notes:analyze', async (_, id: string, requestedMode: unknown) => {
    return analyzeAndPersistNote(id, normalizeAnalysisMode(requestedMode))
  })

  ipcMain.handle('notes:analyzePending', async (_, requestedMode: unknown) => {
    const mode = normalizeAnalysisMode(requestedMode)
    const initialDatabase = await readDatabase()
    const pendingIds = initialDatabase.notes.filter((note) => isPendingAnalysis(note, mode)).map((note) => note.id)
    const result: AnalyzePendingResult = {
      total: pendingIds.length,
      analyzed: 0,
      failed: 0,
      qwen: 0,
      local: 0,
      skipped: 0
    }

    for (const id of pendingIds) {
      try {
        const updated = await analyzeAndPersistNote(id, mode)
        result.analyzed += 1
        result.lastUpdatedId = updated.id
        recordPendingAnalysisStatus(result, updated)
      } catch {
        result.failed += 1
      }
    }

    return result
  })

  ipcMain.handle('notes:exportMarkdown', async (_, id: string) => {
    const database = await readDatabase()
    const note = database.notes.find((item) => item.id === id)

    if (!note) {
      throw new Error('Nota no encontrada')
    }

    const result = await dialog.showSaveDialog({
      title: 'Exportar nota como Markdown',
      defaultPath: path.join(app.getPath('documents'), safeMarkdownFileName(note.title)),
      filters: [
        {
          name: 'Markdown',
          extensions: ['md']
        }
      ]
    })

    if (result.canceled || !result.filePath) {
      return {
        ok: false,
        canceled: true,
        message: 'Exportacion cancelada',
        noteId: note.id
      } satisfies NoteMarkdownExportResult
    }

    await writeFile(
      result.filePath,
      noteToMarkdown(
        note,
        listActionItems(database).filter((action) => action.noteId === note.id)
      ),
      'utf8'
    )

    return {
      ok: true,
      canceled: false,
      message: 'Nota exportada como Markdown',
      path: result.filePath,
      noteId: note.id
    } satisfies NoteMarkdownExportResult
  })

  ipcMain.handle('settings:get', async () => {
    const database = await readDatabase()
    return database.settings
  })

  ipcMain.handle('settings:update', async (_, settings: Partial<AppSettings>) => {
    return mutateDatabase((database) => {
      database.settings = {
        ...database.settings,
        ...settings,
        model: settings.model?.trim() || database.settings.model,
        ollamaUrl: settings.ollamaUrl?.trim().replace(/\/$/, '') || database.settings.ollamaUrl,
        ragMaxNotes: normalizeIntegerSetting(settings.ragMaxNotes, 0, 6, database.settings.ragMaxNotes),
        ragExcerptLength: normalizeIntegerSetting(
          settings.ragExcerptLength,
          160,
          1200,
          database.settings.ragExcerptLength
        )
      }
      return database.settings
    })
  })

  ipcMain.handle('library:export', async () => {
    const database = await readDatabase()
    const defaultPath = path.join(
      app.getPath('documents'),
      `neuronotes-backup-${new Date().toISOString().slice(0, 10)}.json`
    )
    const result = await dialog.showSaveDialog({
      title: 'Exportar biblioteca de Neuronotes',
      defaultPath,
      filters: [
        {
          name: 'Neuronotes JSON',
          extensions: ['json']
        }
      ]
    })

    if (result.canceled || !result.filePath) {
      return {
        ok: false,
        canceled: true,
        message: 'Exportacion cancelada',
        notes: database.notes.length
      } satisfies LibraryExportResult
    }

    await writeFile(result.filePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8')

    return {
      ok: true,
      canceled: false,
      message: `Biblioteca exportada (${database.notes.length} notas)`,
      path: result.filePath,
      notes: database.notes.length
    } satisfies LibraryExportResult
  })

  ipcMain.handle('library:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Importar biblioteca de Neuronotes',
      properties: ['openFile'],
      filters: [
        {
          name: 'Neuronotes JSON',
          extensions: ['json']
        }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return {
        ok: false,
        canceled: true,
        message: 'Importacion cancelada',
        total: 0,
        imported: 0,
        updated: 0,
        skipped: 0,
        actionsImported: 0,
        actionsUpdated: 0,
        actionsSkipped: 0
      } satisfies LibraryImportResult
    }

    const filePath = result.filePaths[0]
    const raw = await readFile(filePath, 'utf8')
    const importedDatabase = normalizeDatabase(JSON.parse(raw) as Partial<DatabaseFile>)
    const importResult = await mergeImportedDatabase(importedDatabase)

    return {
      ok: true,
      canceled: false,
      message: `Importacion lista: ${importResult.imported} notas nuevas, ${importResult.updated} notas actualizadas, ${importResult.actionsImported} acciones nuevas`,
      path: filePath,
      total: importedDatabase.notes.length,
      ...importResult
    } satisfies LibraryImportResult
  })

  ipcMain.handle('mcp:exportHandoff', async () => {
    const database = await readDatabase()
    const defaultPath = path.join(
      app.getPath('documents'),
      `neuronotes-mcp-handoff-${new Date().toISOString().slice(0, 10)}.json`
    )
    const result = await dialog.showSaveDialog({
      title: 'Exportar handoff MCP',
      defaultPath,
      filters: [
        {
          name: 'Neuronotes MCP JSON',
          extensions: ['json']
        }
      ]
    })
    const handoffPayload = buildMcpHandoffPayload(database)

    if (result.canceled || !result.filePath) {
      return {
        ok: false,
        canceled: true,
        message: 'Exportacion MCP cancelada',
        actions: handoffPayload.actionCount
      } satisfies McpHandoffExportResult
    }

    await writeFile(result.filePath, `${JSON.stringify(handoffPayload, null, 2)}\n`, 'utf8')

    return {
      ok: true,
      canceled: false,
      message: `Handoff MCP exportado (${formatActionCount(handoffPayload.actionCount)})`,
      path: result.filePath,
      actions: handoffPayload.actionCount
    } satisfies McpHandoffExportResult
  })

  ipcMain.handle('mcp:getConfig', async () => {
    return buildMcpConnectionConfig({
      databasePath: databasePaths().data,
      serverPath: resolveMcpServerPath()
    })
  })

  ipcMain.handle('mcp:copyConfig', async () => {
    const config = buildMcpConnectionConfig({
      databasePath: databasePaths().data,
      serverPath: resolveMcpServerPath()
    })

    clipboard.writeText(config.hostConfigJson)
    return config
  })

  ipcMain.handle('finetune:exportDataset', async () => {
    const database = await readDatabase()
    const exportedAt = new Date().toISOString()
    const examples = buildFineTuneExamples(database, exportedAt)

    if (examples.length === 0) {
      return {
        ok: false,
        canceled: false,
        message: 'No hay notas revisadas para fine-tuning',
        examples: 0
      } satisfies FineTuneDatasetExportResult
    }

    const defaultPath = path.join(
      app.getPath('documents'),
      `neuronotes-finetune-dataset-${exportedAt.slice(0, 10)}.jsonl`
    )
    const result = await dialog.showSaveDialog({
      title: 'Exportar dataset fine-tuning',
      defaultPath,
      filters: [
        {
          name: 'JSONL',
          extensions: ['jsonl']
        }
      ]
    })

    if (result.canceled || !result.filePath) {
      return {
        ok: false,
        canceled: true,
        message: 'Exportacion de dataset cancelada',
        examples: examples.length
      } satisfies FineTuneDatasetExportResult
    }

    await writeFile(result.filePath, fineTuneDatasetToJsonl(database, exportedAt), 'utf8')

    return {
      ok: true,
      canceled: false,
      message: `Dataset fine-tuning exportado (${formatExampleCount(examples.length)})`,
      path: result.filePath,
      examples: examples.length
    } satisfies FineTuneDatasetExportResult
  })

  ipcMain.handle('ai:health', async () => {
    const database = await readDatabase()
    return checkOllama(database.settings)
  })

  ipcMain.handle('ai:pullModel', async () => {
    const database = await readDatabase()
    return pullQwenModel(database.settings)
  })

  ipcMain.handle('ai:startRuntime', async () => {
    const database = await readDatabase()
    return startOllamaRuntime(database.settings)
  })

  ipcMain.handle('ai:diagnostics', async () => {
    const database = await readDatabase()
    return runAiDiagnostics(database.settings)
  })

  ipcMain.handle('ai:openOllamaDownload', async () => {
    await shell.openExternal('https://ollama.com/download')
  })

  ipcMain.handle('ai:copySetupCommand', async () => {
    const database = await readDatabase()
    const command = buildQwenWindowsSetupCommand(database.settings)

    clipboard.writeText(command)

    return {
      ok: true,
      message: 'Comandos de setup Qwen copiados.',
      command
    } satisfies AiSetupCommandResult
  })
}

async function analyzeAndPersistNote(id: string, mode: AnalysisMode = 'qwen'): Promise<NoteRecord> {
  const database = await readDatabase()
  const note = database.notes.find((item) => item.id === id)

  if (!note) {
    throw new Error('Nota no encontrada')
  }

  const updated = await analyzeNoteSnapshot(note, database, mode)
  let persisted = updated

  await mutateDatabase((nextDatabase) => {
    const index = nextDatabase.notes.findIndex((item) => item.id === id)
    if (index !== -1) {
      const current = nextDatabase.notes[index]

      if (!canApplyAnalysisResult(current, note)) {
        persisted = current
        return
      }

      nextDatabase.notes[index] = updated
      syncActionNoteTitle(nextDatabase, updated)
      synchronizeRelatedGraph(nextDatabase.notes, updated.id)
    }
  })

  return persisted
}

async function analyzeNoteSnapshot(note: NoteRecord, database: DatabaseFile, mode: AnalysisMode): Promise<NoteRecord> {
  const analysis = await analyzeNote(note, database.notes, database.settings, mode)

  return {
    ...note,
    title: analysis.title || note.title,
    summary: analysis.summary,
    category: analysis.category,
    tags: analysis.tags,
    related: preserveManualLinksAfterAnalysis(note, analysis.related),
    suggestedActions: analysis.suggestedActions,
    analysisStatus: analysis.status,
    analysisError: analysis.error,
    analysisRun: analysis.analysisRun,
    trainingReviewedAt: undefined,
    updatedAt: new Date().toISOString()
  }
}

function isPendingAnalysis(note: NoteRecord, mode: AnalyzePendingMode): boolean {
  if (note.content.trim().length === 0) {
    return false
  }

  if (mode === 'local') {
    return note.analysisStatus === 'idle' || note.analysisStatus === 'error'
  }

  return note.analysisStatus !== 'qwen'
}

function isFineTuneReviewable(note: NoteRecord): boolean {
  if (!note.content.trim() || (note.analysisStatus !== 'qwen' && note.analysisStatus !== 'fallback')) {
    return false
  }

  return Boolean(note.summary.trim() || note.tags.length > 0 || note.related.length > 0 || note.suggestedActions.length > 0)
}

function normalizeAnalysisMode(value: unknown): AnalysisMode {
  return value === 'local' ? 'local' : 'qwen'
}

function normalizeIntegerSetting(value: unknown, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.round(Number(value))))
}

function formatActionCount(count: number): string {
  return count === 1 ? '1 accion' : `${count} acciones`
}

function formatExampleCount(count: number): string {
  return count === 1 ? '1 ejemplo' : `${count} ejemplos`
}

function recordPendingAnalysisStatus(result: AnalyzePendingResult, note: NoteRecord): void {
  if (note.analysisStatus === 'qwen') {
    result.qwen += 1
    return
  }

  if (note.analysisStatus === 'fallback') {
    result.local += 1
    return
  }

  result.skipped += 1
}

async function mergeImportedDatabase(
  importedDatabase: DatabaseFile
): Promise<
  Pick<
    LibraryImportResult,
    'imported' | 'updated' | 'skipped' | 'actionsImported' | 'actionsUpdated' | 'actionsSkipped'
  >
> {
  return mutateDatabase((database) => {
    let imported = 0
    let updated = 0
    let skipped = 0
    let actionsImported = 0
    let actionsUpdated = 0
    let actionsSkipped = 0

    for (const importedNote of importedDatabase.notes) {
      if (!importedNote.id || !importedNote.content?.trim()) {
        skipped += 1
        continue
      }

      const existingIndex = database.notes.findIndex((note) => note.id === importedNote.id)

      if (existingIndex === -1) {
        database.notes.push(importedNote)
        imported += 1
        continue
      }

      const existing = database.notes[existingIndex]
      if (importedNote.updatedAt.localeCompare(existing.updatedAt) > 0) {
        database.notes[existingIndex] = importedNote
        updated += 1
      } else {
        skipped += 1
      }
    }

    for (const note of [...database.notes]) {
      synchronizeRelatedGraph(database.notes, note.id)
    }

    const notesById = new Map(database.notes.map((note) => [note.id, note]))

    for (const importedAction of importedDatabase.actions) {
      const linkedNote = notesById.get(importedAction.noteId)

      if (!linkedNote) {
        actionsSkipped += 1
        continue
      }

      importedAction.noteTitle = linkedNote.title
      const existingIndex = database.actions.findIndex((action) => action.id === importedAction.id)

      if (existingIndex === -1) {
        database.actions.push(importedAction)
        actionsImported += 1
        continue
      }

      const existing = database.actions[existingIndex]
      if (importedAction.updatedAt.localeCompare(existing.updatedAt) > 0) {
        database.actions[existingIndex] = importedAction
        actionsUpdated += 1
      } else {
        actionsSkipped += 1
      }
    }

    return {
      imported,
      updated,
      skipped,
      actionsImported,
      actionsUpdated,
      actionsSkipped
    }
  })
}
