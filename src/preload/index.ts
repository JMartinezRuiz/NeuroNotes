import { contextBridge, ipcRenderer } from 'electron'
import {
  ActionItem,
  ActionItemStatus,
  AiDiagnosticsResult,
  AiHealth,
  AiRuntimeStartResult,
  AnalyzePendingResult,
  AppSettings,
  LibraryExportResult,
  LibraryImportResult,
  NoteMarkdownExportResult,
  NoteRecord,
  PullModelResult
} from '../main/types'

const api = {
  listNotes: (): Promise<NoteRecord[]> => ipcRenderer.invoke('notes:list'),
  createNote: (content: string): Promise<NoteRecord> => ipcRenderer.invoke('notes:create', content),
  updateNote: (id: string, updates: Partial<Pick<NoteRecord, 'content' | 'title' | 'category' | 'tags'>>): Promise<NoteRecord> =>
    ipcRenderer.invoke('notes:update', id, updates),
  deleteNote: (id: string): Promise<void> => ipcRenderer.invoke('notes:delete', id),
  addManualLink: (sourceId: string, targetId: string): Promise<NoteRecord> =>
    ipcRenderer.invoke('notes:addManualLink', sourceId, targetId),
  removeLink: (sourceId: string, targetId: string): Promise<NoteRecord> =>
    ipcRenderer.invoke('notes:removeLink', sourceId, targetId),
  analyzeNote: (id: string): Promise<NoteRecord> => ipcRenderer.invoke('notes:analyze', id),
  analyzePending: (): Promise<AnalyzePendingResult> => ipcRenderer.invoke('notes:analyzePending'),
  listActions: (): Promise<ActionItem[]> => ipcRenderer.invoke('actions:list'),
  createActionFromSuggestion: (noteId: string, suggestionIndex: number): Promise<ActionItem> =>
    ipcRenderer.invoke('actions:createFromSuggestion', noteId, suggestionIndex),
  setActionStatus: (actionId: string, status: ActionItemStatus): Promise<ActionItem> =>
    ipcRenderer.invoke('actions:setStatus', actionId, status),
  deleteAction: (actionId: string): Promise<void> => ipcRenderer.invoke('actions:delete', actionId),
  exportNoteMarkdown: (id: string): Promise<NoteMarkdownExportResult> => ipcRenderer.invoke('notes:exportMarkdown', id),
  exportLibrary: (): Promise<LibraryExportResult> => ipcRenderer.invoke('library:export'),
  importLibrary: (): Promise<LibraryImportResult> => ipcRenderer.invoke('library:import'),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:update', settings),
  checkAiHealth: (): Promise<AiHealth> => ipcRenderer.invoke('ai:health'),
  pullModel: (): Promise<PullModelResult> => ipcRenderer.invoke('ai:pullModel'),
  startAiRuntime: (): Promise<AiRuntimeStartResult> => ipcRenderer.invoke('ai:startRuntime'),
  runAiDiagnostics: (): Promise<AiDiagnosticsResult> => ipcRenderer.invoke('ai:diagnostics'),
  openOllamaDownload: (): Promise<void> => ipcRenderer.invoke('ai:openOllamaDownload')
}

contextBridge.exposeInMainWorld('neuronotes', api)

export type NeuronotesApi = typeof api
