import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import {
  ActionItem,
  ActionItemStatus,
  AiDiagnosticsResult,
  AiHealth,
  AiRuntimePrepareResult,
  AiRuntimeStartResult,
  AiSetupCommandResult,
  AnalysisMode,
  AnalyzePendingMode,
  AnalyzePendingResult,
  AppSettings,
  DeleteNoteResult,
  FineTuneDatasetExportResult,
  LibraryExportResult,
  LibraryImportResult,
  McpConnectionConfig,
  McpHandoffExportResult,
  NoteMarkdownExportResult,
  NoteRecord,
  PullModelResult,
  RagPreviewResult
} from '../main/types'
import { AppCommand } from '../main/commands'

const api = {
  listNotes: (): Promise<NoteRecord[]> => ipcRenderer.invoke('notes:list'),
  createNote: (content: string): Promise<NoteRecord> => ipcRenderer.invoke('notes:create', content),
  createNoteFromClipboard: (): Promise<NoteRecord> => ipcRenderer.invoke('notes:createFromClipboard'),
  updateNote: (id: string, updates: Partial<Pick<NoteRecord, 'content' | 'title' | 'category' | 'tags'>>): Promise<NoteRecord> =>
    ipcRenderer.invoke('notes:update', id, updates),
  setTrainingReview: (id: string, reviewed: boolean): Promise<NoteRecord> =>
    ipcRenderer.invoke('notes:setTrainingReview', id, reviewed),
  deleteNote: (id: string): Promise<DeleteNoteResult> => ipcRenderer.invoke('notes:delete', id),
  addManualLink: (sourceId: string, targetId: string): Promise<NoteRecord> =>
    ipcRenderer.invoke('notes:addManualLink', sourceId, targetId),
  removeLink: (sourceId: string, targetId: string): Promise<NoteRecord> =>
    ipcRenderer.invoke('notes:removeLink', sourceId, targetId),
  previewRagContext: (id: string): Promise<RagPreviewResult> => ipcRenderer.invoke('notes:previewRag', id),
  analyzeNote: (id: string, mode: AnalysisMode = 'qwen'): Promise<NoteRecord> => ipcRenderer.invoke('notes:analyze', id, mode),
  analyzePending: (mode: AnalyzePendingMode): Promise<AnalyzePendingResult> =>
    ipcRenderer.invoke('notes:analyzePending', mode),
  listActions: (): Promise<ActionItem[]> => ipcRenderer.invoke('actions:list'),
  createActionFromSuggestion: (noteId: string, suggestionIndex: number): Promise<ActionItem> =>
    ipcRenderer.invoke('actions:createFromSuggestion', noteId, suggestionIndex),
  setActionStatus: (actionId: string, status: ActionItemStatus): Promise<ActionItem> =>
    ipcRenderer.invoke('actions:setStatus', actionId, status),
  setActionMcpApproval: (actionId: string, approved: boolean): Promise<ActionItem> =>
    ipcRenderer.invoke('actions:setMcpApproval', actionId, approved),
  setActionToolHint: (actionId: string, toolHint: string): Promise<ActionItem> =>
    ipcRenderer.invoke('actions:setToolHint', actionId, toolHint),
  deleteAction: (actionId: string): Promise<void> => ipcRenderer.invoke('actions:delete', actionId),
  exportNoteMarkdown: (id: string): Promise<NoteMarkdownExportResult> => ipcRenderer.invoke('notes:exportMarkdown', id),
  getMcpConfig: (): Promise<McpConnectionConfig> => ipcRenderer.invoke('mcp:getConfig'),
  copyMcpConfig: (): Promise<McpConnectionConfig> => ipcRenderer.invoke('mcp:copyConfig'),
  copyMcpWriteConfig: (): Promise<McpConnectionConfig> => ipcRenderer.invoke('mcp:copyWriteConfig'),
  exportMcpHandoff: (): Promise<McpHandoffExportResult> => ipcRenderer.invoke('mcp:exportHandoff'),
  exportFineTuneDataset: (): Promise<FineTuneDatasetExportResult> => ipcRenderer.invoke('finetune:exportDataset'),
  exportLibrary: (): Promise<LibraryExportResult> => ipcRenderer.invoke('library:export'),
  importLibrary: (): Promise<LibraryImportResult> => ipcRenderer.invoke('library:import'),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:update', settings),
  checkAiHealth: (): Promise<AiHealth> => ipcRenderer.invoke('ai:health'),
  pullModel: (): Promise<PullModelResult> => ipcRenderer.invoke('ai:pullModel'),
  startAiRuntime: (): Promise<AiRuntimeStartResult> => ipcRenderer.invoke('ai:startRuntime'),
  prepareAiRuntime: (): Promise<AiRuntimePrepareResult> => ipcRenderer.invoke('ai:prepareRuntime'),
  runAiDiagnostics: (): Promise<AiDiagnosticsResult> => ipcRenderer.invoke('ai:diagnostics'),
  getAiDiagnostics: (): Promise<AiDiagnosticsResult | null> => ipcRenderer.invoke('ai:getDiagnostics'),
  openOllamaDownload: (): Promise<void> => ipcRenderer.invoke('ai:openOllamaDownload'),
  copyAiSetupCommand: (): Promise<AiSetupCommandResult> => ipcRenderer.invoke('ai:copySetupCommand'),
  onLibraryChanged: (callback: () => void): (() => void) => {
    const listener = (): void => {
      callback()
    }

    ipcRenderer.on('library:changed', listener)
    return () => {
      ipcRenderer.removeListener('library:changed', listener)
    }
  },
  onCommand: (callback: (command: AppCommand) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, command: AppCommand): void => {
      callback(command)
    }

    ipcRenderer.on('app:command', listener)
    return () => {
      ipcRenderer.removeListener('app:command', listener)
    }
  }
}

contextBridge.exposeInMainWorld('neuronotes', api)

export type NeuronotesApi = typeof api
