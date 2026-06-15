import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
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
import { noteToMarkdown, safeMarkdownFileName } from './export'
import { synchronizeRelatedGraph } from './linking'
import { addManualLink, removeManualLink } from './manualLinks'
import { normalizeNoteCategory, normalizeNoteTags } from './metadata'
import { createNoteDraft, listNotes, mutateDatabase, normalizeDatabase, readDatabase } from './storage'
import {
  AnalyzePendingResult,
  AppSettings,
  ActionItemStatus,
  DatabaseFile,
  LibraryExportResult,
  LibraryImportResult,
  NoteMarkdownExportResult,
  NoteRecord
} from './types'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1220,
    height: 780,
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

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.neuronotes.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

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
        note.content = updates.content.trim()
        note.analysisStatus = 'idle'
        note.analysisError = undefined
        note.analysisRun = undefined
        note.suggestedActions = []
      }

      if (typeof updates.title === 'string' && updates.title.trim()) {
        note.title = updates.title.trim()
      }

      if (typeof updates.category === 'string' && updates.category.trim()) {
        note.category = normalizeNoteCategory(updates.category)
      }

      if (Array.isArray(updates.tags)) {
        note.tags = normalizeNoteTags(updates.tags)
      }

      note.updatedAt = new Date().toISOString()
      syncActionNoteTitle(database, note)
      synchronizeRelatedGraph(database.notes, note.id)
      return note
    })
  })

  ipcMain.handle('notes:delete', async (_, id: string) => {
    await mutateDatabase((database) => {
      database.notes = database.notes
        .filter((note) => note.id !== id)
        .map((note) => ({
          ...note,
          related: note.related.filter((related) => related.noteId !== id)
      }))
      removeActionItemsForNote(database, id)
    })
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
      return addManualLink(database.notes, sourceId, targetId)
    })
  })

  ipcMain.handle('notes:removeLink', async (_, sourceId: string, targetId: string) => {
    return mutateDatabase((database) => {
      return removeManualLink(database.notes, sourceId, targetId)
    })
  })

  ipcMain.handle('notes:analyze', async (_, id: string) => {
    return analyzeAndPersistNote(id)
  })

  ipcMain.handle('notes:analyzePending', async () => {
    const initialDatabase = await readDatabase()
    const pendingIds = initialDatabase.notes.filter((note) => isPendingAnalysis(note)).map((note) => note.id)
    const result: AnalyzePendingResult = {
      total: pendingIds.length,
      analyzed: 0,
      failed: 0
    }

    for (const id of pendingIds) {
      try {
        const updated = await analyzeAndPersistNote(id)
        result.analyzed += 1
        result.lastUpdatedId = updated.id
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
        ollamaUrl: settings.ollamaUrl?.trim().replace(/\/$/, '') || database.settings.ollamaUrl
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
}

async function analyzeAndPersistNote(id: string): Promise<NoteRecord> {
  const database = await readDatabase()
  const note = database.notes.find((item) => item.id === id)

  if (!note) {
    throw new Error('Nota no encontrada')
  }

  const updated = await analyzeNoteSnapshot(note, database)

  await mutateDatabase((nextDatabase) => {
    const index = nextDatabase.notes.findIndex((item) => item.id === id)
    if (index !== -1) {
      nextDatabase.notes[index] = updated
      syncActionNoteTitle(nextDatabase, updated)
      synchronizeRelatedGraph(nextDatabase.notes, updated.id)
    }
  })

  return updated
}

async function analyzeNoteSnapshot(note: NoteRecord, database: DatabaseFile): Promise<NoteRecord> {
  const analysis = await analyzeNote(note, database.notes, database.settings)

  return {
    ...note,
    title: analysis.title || note.title,
    summary: analysis.summary,
    category: analysis.category,
    tags: analysis.tags,
    related: analysis.related,
    suggestedActions: analysis.suggestedActions,
    analysisStatus: analysis.status,
    analysisError: analysis.error,
    analysisRun: analysis.analysisRun,
    updatedAt: new Date().toISOString()
  }
}

function isPendingAnalysis(note: NoteRecord): boolean {
  return note.content.trim().length > 0 && note.analysisStatus !== 'qwen'
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
