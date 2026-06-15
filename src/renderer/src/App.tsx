import {
  BrainCircuit,
  Circle,
  CheckCircle2,
  CircleAlert,
  Download,
  FileDown,
  FileText,
  FileUp,
  Link2,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildPendingAnalysisKey,
  isPendingForAnalysis,
  pendingAnalysisButtonTitle,
  pendingAnalysisEngine,
  pendingAnalysisProgressMessage,
  pendingAnalysisResultMessage,
  shouldAutoAnalyzePending
} from './analysisAutomation'
import { createPreviewApi } from './previewApi'
import { GraphConnection, graphConnections, graphEdges } from './graph'
import { commandFromKeyboardShortcut } from './shortcuts'
import {
  ActionItem,
  AppCommand,
  AiHealth,
  AnalysisProvider,
  AppSettings,
  NoteRecord,
  NOTE_CATEGORIES,
  SuggestedAction,
  SuggestedActionKind
} from './types'

type NeuronotesApi = NonNullable<Window['neuronotes']>
type SaveState = 'saved' | 'dirty' | 'saving' | 'error'
type WorkspaceView = 'note' | 'network'

const emptySettings: AppSettings = {
  model: 'qwen3.5:0.8b',
  ollamaUrl: 'http://127.0.0.1:11434',
  autoAnalyze: true
}

const emptyHealth: AiHealth = {
  ok: false,
  status: 'ollama-missing',
  message: 'Sin comprobar',
  model: emptySettings.model,
  ollamaUrl: emptySettings.ollamaUrl,
  ollamaAvailable: false,
  modelInstalled: false,
  installedModels: []
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function statusLabel(note: NoteRecord): string {
  if (note.analysisStatus === 'qwen') {
    return 'Qwen'
  }
  if (note.analysisStatus === 'fallback') {
    return 'Local'
  }
  if (note.analysisStatus === 'error') {
    return 'Error'
  }
  return 'Sin analizar'
}

function analysisProviderLabel(provider: AnalysisProvider): string {
  return provider === 'qwen' ? 'Qwen' : 'Local'
}

function suggestedActionKindLabel(kind: SuggestedActionKind): string {
  if (kind === 'task') {
    return 'Tarea'
  }
  if (kind === 'reminder') {
    return 'Recordatorio'
  }
  if (kind === 'research') {
    return 'Busqueda'
  }

  return 'MCP'
}

function actionIdentity(action: { kind: SuggestedActionKind; title: string; detail: string }): string {
  return `${action.kind}:${action.title.trim().toLowerCase()}:${action.detail.trim().toLowerCase()}`
}

function durationLabel(durationMs: number): string {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(1)} s`
  }

  return `${Math.round(durationMs)} ms`
}

function aiActionLabel(health: AiHealth): string {
  if (health.status === 'ready') {
    return 'Modelo listo'
  }
  if (health.status === 'ollama-missing') {
    return 'Activar Ollama'
  }
  return 'Descargar Qwen'
}

function saveStateLabel(saveState: SaveState): string {
  if (saveState === 'dirty') {
    return 'Cambios sin guardar'
  }
  if (saveState === 'saving') {
    return 'Guardando'
  }
  if (saveState === 'error') {
    return 'No se pudo guardar'
  }
  return 'Guardado'
}

function directionLabel(direction: GraphConnection['direction']): string {
  if (direction === 'both') {
    return 'Mutua'
  }

  if (direction === 'backlink') {
    return 'Entrada'
  }

  return 'Salida'
}

function parseTagInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,#]/)
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 10)
}

function resolveApi(): NeuronotesApi {
  if (window.neuronotes) {
    return window.neuronotes
  }

  if (import.meta.env.DEV) {
    return createPreviewApi()
  }

  throw new Error('Neuronotes preload no disponible')
}

export default function App(): JSX.Element {
  const api = useMemo(() => resolveApi(), [])
  const autoAnalyzeAttemptKey = useRef('')
  const quickCaptureRef = useRef<HTMLTextAreaElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [actions, setActions] = useState<ActionItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quickNote, setQuickNote] = useState('')
  const [editorTitle, setEditorTitle] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [metadataCategory, setMetadataCategory] = useState('Inbox')
  const [metadataTags, setMetadataTags] = useState('')
  const [metadataState, setMetadataState] = useState<SaveState>('saved')
  const [manualLinkTargetId, setManualLinkTargetId] = useState('')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('Todas')
  const [settings, setSettings] = useState<AppSettings>(emptySettings)
  const [health, setHealth] = useState<AiHealth>(emptyHealth)
  const [busy, setBusy] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [editorMessage, setEditorMessage] = useState<string>('')
  const [libraryMessage, setLibraryMessage] = useState<string>('')
  const [diagnosticsMessage, setDiagnosticsMessage] = useState<string>('')
  const [analysisQueueMessage, setAnalysisQueueMessage] = useState<string>('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('note')
  const [bootstrapped, setBootstrapped] = useState(false)

  const selectedNote = notes.find((note) => note.id === selectedId) ?? notes[0] ?? null
  const selectedActionItems = useMemo(
    () => (selectedNote ? actions.filter((action) => action.noteId === selectedNote.id) : []),
    [actions, selectedNote?.id]
  )
  const savedSuggestedActionKeys = useMemo(
    () => new Set(selectedActionItems.map((action) => actionIdentity(action))),
    [selectedActionItems]
  )
  const selectedTagsKey = selectedNote?.tags.join('|') ?? ''
  const allGraphEdges = useMemo(() => graphEdges(notes), [notes])
  const selectedConnections = useMemo(
    () => (selectedNote ? graphConnections(selectedNote, notes) : []),
    [notes, selectedNote]
  )
  const analysisContextNotes = useMemo(() => {
    if (!selectedNote?.analysisRun) {
      return []
    }

    const notesById = new Map(notes.map((note) => [note.id, note]))
    return selectedNote.analysisRun.ragNoteIds
      .map((id) => notesById.get(id))
      .filter((note): note is NoteRecord => Boolean(note))
  }, [notes, selectedNote])
  const analysisContextItems = selectedNote?.analysisRun?.ragContext ?? []
  const networkNodes = useMemo(() => {
    const visibleConnections = selectedConnections.slice(0, 8)

    return visibleConnections.map((connection, index) => {
      const angle = (Math.PI * 2 * index) / visibleConnections.length - Math.PI / 2

      return {
        ...connection,
        x: 50 + Math.cos(angle) * 34,
        y: 50 + Math.sin(angle) * 34
      }
    })
  }, [selectedConnections])
  const pendingEngine = pendingAnalysisEngine(health.ok)
  const pendingAnalysisNotes = useMemo(
    () =>
      notes
        .filter((note) => note.content.trim().length > 0 && isPendingForAnalysis(note.analysisStatus, pendingEngine))
        .map((note) => ({
          id: note.id,
          content: note.content
        })),
    [notes, pendingEngine]
  )
  const pendingAnalysisCount = pendingAnalysisNotes.length
  const pendingAnalysisKey = useMemo(
    () => buildPendingAnalysisKey(settings.model, pendingAnalysisNotes),
    [pendingAnalysisNotes, settings.model]
  )
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()

    for (const note of notes) {
      counts.set(note.category, (counts.get(note.category) ?? 0) + 1)
    }

    return [
      { name: 'Todas', count: notes.length },
      ...[...counts.entries()]
        .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
        .map(([name, count]) => ({ name, count }))
    ]
  }, [notes])
  const categoryOptions = useMemo(
    () => Array.from(new Set([...NOTE_CATEGORIES, ...categoryCounts.slice(1).map((category) => category.name)])),
    [categoryCounts]
  )
  const linkableNotes = useMemo(() => {
    if (!selectedNote) {
      return []
    }

    const linkedIds = new Set(selectedNote.related.map((related) => related.noteId))
    return notes.filter((note) => note.id !== selectedNote.id && !linkedIds.has(note.id))
  }, [notes, selectedNote])

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase()
    const categoryFilteredNotes =
      activeCategory === 'Todas' ? notes : notes.filter((note) => note.category === activeCategory)

    if (!query) {
      return categoryFilteredNotes
    }

    return categoryFilteredNotes.filter((note) => {
      const haystack = `${note.title} ${note.summary} ${note.content} ${note.category} ${note.tags.join(' ')}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [activeCategory, notes, search])

  useEffect(() => {
    return api.onCommand((command) => {
      void handleAppCommand(command as AppCommand)
    })
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      const command = commandFromKeyboardShortcut(event)

      if (!command) {
        return
      }

      event.preventDefault()
      void handleAppCommand(command)
    }

    window.addEventListener('keydown', listener)
    return () => {
      window.removeEventListener('keydown', listener)
    }
  })

  useEffect(() => {
    void bootstrap()
  }, [])

  useEffect(() => {
    if (!bootstrapped) {
      return
    }

    const timeout = window.setTimeout(() => {
      void refreshHealth().catch(() => undefined)
    }, 650)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [bootstrapped, settings.model, settings.ollamaUrl])

  useEffect(() => {
    if (
      !shouldAutoAnalyzePending({
        autoAnalyze: settings.autoAnalyze,
        bootstrapped,
        busy,
        healthOk: health.ok,
        lastAttemptKey: autoAnalyzeAttemptKey.current,
        pendingCount: pendingAnalysisCount,
        pendingKey: pendingAnalysisKey
      })
    ) {
      return
    }

    autoAnalyzeAttemptKey.current = pendingAnalysisKey
    void runPendingAnalysis('auto')
  }, [bootstrapped, busy, health.ok, pendingAnalysisCount, pendingAnalysisKey, settings.autoAnalyze])

  useEffect(() => {
    if (selectedNote) {
      setEditorTitle(selectedNote.title)
      setEditorContent(selectedNote.content)
      setEditingNoteId(selectedNote.id)
      setMetadataCategory(selectedNote.category)
      setMetadataTags(selectedNote.tags.join(', '))
      setSaveState('saved')
      setMetadataState('saved')
      setSelectedId(selectedNote.id)
    }
  }, [selectedNote?.id])

  useEffect(() => {
    if (!selectedNote || metadataState !== 'saved') {
      return
    }

    setMetadataCategory(selectedNote.category)
    setMetadataTags(selectedNote.tags.join(', '))
  }, [metadataState, selectedNote?.category, selectedTagsKey])

  useEffect(() => {
    if (activeCategory === 'Todas') {
      return
    }

    if (!notes.some((note) => note.category === activeCategory)) {
      setActiveCategory('Todas')
    }
  }, [activeCategory, notes])

  useEffect(() => {
    if (manualLinkTargetId && linkableNotes.some((note) => note.id === manualLinkTargetId)) {
      return
    }

    setManualLinkTargetId(linkableNotes[0]?.id ?? '')
  }, [linkableNotes, manualLinkTargetId])

  useEffect(() => {
    if (!selectedNote || editingNoteId !== selectedNote.id) {
      return
    }

    const titleChanged = editorTitle.trim() !== selectedNote.title
    const contentChanged = editorContent !== selectedNote.content

    if (!titleChanged && !contentChanged) {
      if (saveState !== 'saving') {
        setSaveState('saved')
      }
      return
    }

    setSaveState('dirty')

    if (!editorContent.trim() || !editorTitle.trim()) {
      return
    }

    const timeout = window.setTimeout(() => {
      void saveSelected(true).catch(() => undefined)
    }, 900)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [editorContent, editorTitle, editingNoteId, selectedNote?.id, selectedNote?.content, selectedNote?.title])

  async function bootstrap(): Promise<void> {
    const [storedNotes, storedSettings, storedActions] = await Promise.all([
      api.listNotes(),
      api.getSettings(),
      api.listActions()
    ])

    setNotes(storedNotes)
    setSettings(storedSettings)
    setActions(storedActions)
    setSelectedId(storedNotes[0]?.id ?? null)
    await refreshHealth()
    setBootstrapped(true)
  }

  async function refreshNotes(nextSelectedId?: string): Promise<void> {
    const storedNotes = await api.listNotes()
    setNotes(storedNotes)
    setSelectedId(nextSelectedId ?? selectedId ?? storedNotes[0]?.id ?? null)
  }

  async function refreshActions(): Promise<void> {
    const storedActions = await api.listActions()
    setActions(storedActions)
  }

  async function refreshHealth(): Promise<void> {
    const nextHealth = await api.checkAiHealth()
    setHealth(nextHealth)
  }

  async function handleAppCommand(command: AppCommand): Promise<void> {
    if (command === 'focus-capture') {
      setWorkspaceView('note')
      window.requestAnimationFrame(() => {
        quickCaptureRef.current?.focus()
      })
      return
    }

    if (command === 'focus-search') {
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      })
      return
    }

    if (command === 'save-note') {
      await saveSelected()
      return
    }

    if (command === 'analyze-note') {
      await runAnalysis()
      return
    }

    if (command === 'export-markdown') {
      await exportSelectedMarkdown()
      return
    }

    if (command === 'import-library') {
      await importLibrary()
      return
    }

    if (command === 'export-library') {
      await exportLibrary()
      return
    }

    if (command === 'export-mcp-handoff') {
      await exportMcpHandoff()
      return
    }

    if (command === 'toggle-settings') {
      setSettingsOpen((value) => !value)
      return
    }

    if (command === 'view-note') {
      setWorkspaceView('note')
      return
    }

    if (command === 'view-network') {
      setWorkspaceView('network')
    }
  }

  async function prepareAiRuntime(): Promise<void> {
    setDiagnosticsMessage('')

    if (!health.ollamaAvailable) {
      setBusy('startOllama')
      setHealth((current) => ({
        ...current,
        message: 'Iniciando Ollama...'
      }))

      try {
        const result = await api.startAiRuntime()

        if (result.health) {
          setHealth(result.health)
        } else {
          setHealth((current) => ({
            ...current,
            ok: false,
            status: 'ollama-missing',
            message: result.message
          }))
        }

        if (!result.ok && result.reason === 'not-installed') {
          await api.openOllamaDownload()
        }
      } catch (error) {
        setHealth((current) => ({
          ...current,
          ok: false,
          status: 'error',
          message: error instanceof Error ? error.message : 'No se pudo iniciar Ollama'
        }))
      } finally {
        setBusy(null)
      }
      return
    }

    setBusy('pull')
    setHealth((current) => ({
      ...current,
      message: `Descargando ${settings.model}...`
    }))

    try {
      await api.pullModel()
      await refreshHealth()
    } catch (error) {
      setHealth((current) => ({
        ...current,
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'No se pudo descargar el modelo'
      }))
    } finally {
      setBusy(null)
    }
  }

  async function runDiagnostics(): Promise<void> {
    setBusy('diagnostics')
    setDiagnosticsMessage('Probando Qwen...')

    try {
      const result = await api.runAiDiagnostics()
      setDiagnosticsMessage(
        result.ok
          ? `${result.message} (${result.durationMs} ms). ${result.summary}`
          : `${result.message} (${result.durationMs} ms).`
      )
    } catch (error) {
      setDiagnosticsMessage(error instanceof Error ? error.message : 'No se pudo probar Qwen')
    } finally {
      setBusy(null)
    }
  }

  async function createQuickNote(event: FormEvent): Promise<void> {
    event.preventDefault()
    const content = quickNote.trim()
    if (!content) {
      return
    }

    setBusy('create')
    try {
      const created = await api.createNote(content)
      setQuickNote('')
      setSelectedId(created.id)
      await refreshNotes(created.id)

      if (settings.autoAnalyze) {
        await runAnalysis(created.id)
      }
    } finally {
      setBusy(null)
    }
  }

  async function saveSelected(silent = false): Promise<NoteRecord | undefined> {
    if (!selectedNote || editingNoteId !== selectedNote.id || !editorContent.trim() || !editorTitle.trim()) {
      return
    }

    const title = editorTitle.trim()

    if (editorContent === selectedNote.content && title === selectedNote.title) {
      setSaveState('saved')
      return selectedNote
    }

    if (!silent) {
      setBusy('save')
    }

    setSaveState('saving')
    try {
      const updated = await api.updateNote(selectedNote.id, {
        content: editorContent,
        title
      })
      await refreshNotes(updated.id)
      setSaveState('saved')
      return updated
    } catch (error) {
      setSaveState('error')
      throw error
    } finally {
      if (!silent) {
        setBusy(null)
      }
    }
  }

  async function saveMetadata(): Promise<void> {
    if (!selectedNote) {
      return
    }

    const tags = parseTagInput(metadataTags)
    const category = metadataCategory.trim() || 'Inbox'
    const categoryChanged = category !== selectedNote.category
    const tagsChanged = tags.join('|') !== selectedNote.tags.join('|')

    if (!categoryChanged && !tagsChanged) {
      setMetadataState('saved')
      return
    }

    setBusy('metadata')
    setMetadataState('saving')

    try {
      const updated = await api.updateNote(selectedNote.id, {
        category,
        tags
      })
      await refreshNotes(updated.id)
      setMetadataTags(updated.tags.join(', '))
      setMetadataCategory(updated.category)
      setMetadataState('saved')
    } catch (error) {
      setMetadataState('error')
      throw error
    } finally {
      setBusy(null)
    }
  }

  async function addManualLink(): Promise<void> {
    if (!selectedNote || !manualLinkTargetId) {
      return
    }

    setBusy('manualLink')
    try {
      const updated = await api.addManualLink(selectedNote.id, manualLinkTargetId)
      await refreshNotes(updated.id)
    } finally {
      setBusy(null)
    }
  }

  async function removeManualLink(targetId: string): Promise<void> {
    if (!selectedNote) {
      return
    }

    setBusy(`removeLink:${targetId}`)
    try {
      const updated = await api.removeLink(selectedNote.id, targetId)
      await refreshNotes(updated.id)
    } finally {
      setBusy(null)
    }
  }

  async function runAnalysis(id = selectedNote?.id): Promise<void> {
    if (!id) {
      return
    }

    setBusy('analyze')
    try {
      if (
        selectedNote?.id === id &&
        (editorContent !== selectedNote.content || editorTitle.trim() !== selectedNote.title)
      ) {
        await saveSelected(true)
      }
      const analyzed = await api.analyzeNote(id)
      await refreshNotes(analyzed.id)
    } finally {
      setBusy(null)
    }
  }

  async function runPendingAnalysis(mode: 'manual' | 'auto' = 'manual'): Promise<void> {
    if (pendingAnalysisCount === 0) {
      return
    }

    const engine = pendingAnalysisEngine(health.ok)
    setBusy('analyzePending')
    setAnalysisQueueMessage(pendingAnalysisProgressMessage(mode, engine, pendingAnalysisCount))
    try {
      if (selectedNote && (editorContent !== selectedNote.content || editorTitle.trim() !== selectedNote.title)) {
        await saveSelected(true)
      }

      const result = await api.analyzePending(engine)
      await refreshNotes(result.lastUpdatedId ?? selectedId ?? undefined)
      setAnalysisQueueMessage(pendingAnalysisResultMessage(engine, result))
    } finally {
      setBusy(null)
    }
  }

  async function deleteSelected(): Promise<void> {
    if (!selectedNote) {
      return
    }

    setBusy('delete')
    try {
      const result = await api.deleteNote(selectedNote.id)

      if (!result.deleted) {
        setEditorMessage(result.message)
        return
      }

      const remaining = notes.filter((note) => note.id !== selectedNote.id)
      await refreshNotes(remaining[0]?.id)
      await refreshActions()
      setEditorMessage(result.message)
    } finally {
      setBusy(null)
    }
  }

  async function saveSuggestedAction(suggestionIndex: number): Promise<void> {
    if (!selectedNote) {
      return
    }

    setBusy(`saveAction:${suggestionIndex}`)
    try {
      const action = await api.createActionFromSuggestion(selectedNote.id, suggestionIndex)
      await refreshActions()
      setEditorMessage(`Accion guardada: ${action.title}`)
    } finally {
      setBusy(null)
    }
  }

  async function toggleActionStatus(action: ActionItem): Promise<void> {
    setBusy(`actionStatus:${action.id}`)
    try {
      await api.setActionStatus(action.id, action.status === 'done' ? 'open' : 'done')
      await refreshActions()
    } finally {
      setBusy(null)
    }
  }

  async function removeActionItem(actionId: string): Promise<void> {
    setBusy(`deleteAction:${actionId}`)
    try {
      await api.deleteAction(actionId)
      await refreshActions()
    } finally {
      setBusy(null)
    }
  }

  async function updateSettings(nextSettings: Partial<AppSettings>): Promise<void> {
    setDiagnosticsMessage('')
    setAnalysisQueueMessage('')
    const updated = await api.updateSettings(nextSettings)
    setSettings(updated)
  }

  async function restoreDefaultQwenSettings(): Promise<void> {
    await updateSettings({
      model: emptySettings.model,
      ollamaUrl: emptySettings.ollamaUrl
    })
  }

  async function exportLibrary(): Promise<void> {
    setBusy('export')
    try {
      const result = await api.exportLibrary()
      setLibraryMessage(result.message)
    } finally {
      setBusy(null)
    }
  }

  async function importLibrary(): Promise<void> {
    setBusy('import')
    try {
      const result = await api.importLibrary()
      setLibraryMessage(result.message)
      if (result.ok) {
        await refreshNotes(selectedId ?? undefined)
        await refreshActions()
      }
    } finally {
      setBusy(null)
    }
  }

  async function exportMcpHandoff(): Promise<void> {
    setBusy('exportMcp')
    try {
      const result = await api.exportMcpHandoff()
      setLibraryMessage(result.message)
    } finally {
      setBusy(null)
    }
  }

  async function exportSelectedMarkdown(): Promise<void> {
    if (!selectedNote) {
      return
    }

    setBusy('exportMarkdown')
    try {
      if (editorContent !== selectedNote.content || editorTitle.trim() !== selectedNote.title) {
        await saveSelected(true)
      }

      const result = await api.exportNoteMarkdown(selectedNote.id)
      setEditorMessage(result.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">
            <BrainCircuit size={20} />
          </div>
          <div>
            <h1>Neuronotes</h1>
            <span>{notes.length} notas</span>
          </div>
        </div>

        <form className="quick-capture" onSubmit={createQuickNote}>
          <textarea
            ref={quickCaptureRef}
            value={quickNote}
            onChange={(event) => setQuickNote(event.target.value)}
            placeholder="Nota rapida"
            rows={4}
          />
          <button type="submit" disabled={busy === 'create'} title="Crear nota">
            {busy === 'create' ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
            Crear
          </button>
        </form>

        <label className="search-box">
          <Search size={16} />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar"
          />
        </label>

        <div className="category-filter" aria-label="Categorias">
          {categoryCounts.map((category) => (
            <button
              key={category.name}
              type="button"
              className={category.name === activeCategory ? 'active' : ''}
              onClick={() => setActiveCategory(category.name)}
            >
              <span>{category.name}</span>
              <strong>{category.count}</strong>
            </button>
          ))}
        </div>

        <div className="note-list">
          {filteredNotes.length > 0 ? (
            filteredNotes.map((note) => (
              <button
                key={note.id}
                className={`note-row ${note.id === selectedNote?.id ? 'active' : ''}`}
                onClick={() => setSelectedId(note.id)}
                type="button"
              >
                <span className="note-title">{note.title}</span>
                <span className="note-meta">
                  {note.category} - {formatDate(note.updatedAt)}
                </span>
                {note.summary && <span className="note-summary">{note.summary}</span>}
              </button>
            ))
          ) : (
            <div className="empty-list">Sin notas en esta vista.</div>
          )}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="health-pill" data-ok={health.ok}>
            {health.ok ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
            <span>{health.message}</span>
          </div>
          <div className="view-tabs" aria-label="Vista">
            <button
              type="button"
              className={workspaceView === 'note' ? 'active' : ''}
              onClick={() => setWorkspaceView('note')}
              title="Vista nota"
            >
              <FileText size={16} />
              Nota
            </button>
            <button
              type="button"
              className={workspaceView === 'network' ? 'active' : ''}
              onClick={() => setWorkspaceView('network')}
              title="Vista red"
            >
              <Network size={16} />
              Red
            </button>
          </div>
          <div className="topbar-actions">
            {analysisQueueMessage && (
              <div className="queue-pill" data-active={busy === 'analyzePending'}>
                {busy === 'analyzePending' ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />}
                <span>{analysisQueueMessage}</span>
              </div>
            )}
            {pendingAnalysisCount > 0 && (
              <button
                type="button"
                className="batch-button"
                onClick={() => runPendingAnalysis('manual')}
                disabled={busy === 'analyzePending'}
                title={pendingAnalysisButtonTitle(pendingEngine)}
              >
                {busy === 'analyzePending' ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                Pendientes {pendingAnalysisCount}
              </button>
            )}
            <button type="button" className="icon-button" onClick={refreshHealth} title="Comprobar IA">
              <RefreshCw size={17} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setSettingsOpen((value) => !value)}
              title="Ajustes"
            >
              <Settings size={17} />
            </button>
          </div>
        </header>

        {settingsOpen && (
          <section className="settings-panel">
            <label>
              Modelo
              <input
                value={settings.model}
                onChange={(event) => updateSettings({ model: event.target.value })}
              />
            </label>
            <label>
              Ollama URL
              <input
                value={settings.ollamaUrl}
                onChange={(event) => updateSettings({ ollamaUrl: event.target.value })}
              />
            </label>
            <label className="toggle-row">
              <input
                checked={settings.autoAnalyze}
                onChange={(event) => updateSettings({ autoAnalyze: event.target.checked })}
                type="checkbox"
              />
              Analizar al crear
            </label>
            <div className="model-card">
              <div>
                <span>Motor local</span>
                <strong>{settings.model}</strong>
                <small>
                  {diagnosticsMessage ||
                  (health.ok
                    ? 'Listo para resumir, categorizar y enlazar notas.'
                    : health.ollamaAvailable
                      ? 'Ollama responde, pero falta el modelo configurado.'
                      : 'Instala Ollama para activar Qwen local.')}
                </small>
              </div>
              <div className="model-actions">
                <button
                  type="button"
                  onClick={prepareAiRuntime}
                  disabled={busy === 'pull' || busy === 'startOllama' || health.status === 'ready'}
                  title={aiActionLabel(health)}
                >
                  {busy === 'pull' || busy === 'startOllama' ? (
                    <Loader2 className="spin" size={16} />
                  ) : health.status === 'ollama-missing' ? (
                    <RefreshCw size={16} />
                  ) : (
                    <Download size={16} />
                  )}
                  {aiActionLabel(health)}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={runDiagnostics}
                  disabled={busy === 'diagnostics'}
                  title="Probar Qwen"
                >
                  {busy === 'diagnostics' ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                  Probar
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={restoreDefaultQwenSettings}
                  disabled={
                    settings.model === emptySettings.model &&
                    settings.ollamaUrl === emptySettings.ollamaUrl
                  }
                  title="Usar Qwen 0.8B"
                >
                  Qwen 0.8B
                </button>
              </div>
            </div>
            <div className="library-card">
              <div>
                <span>Biblioteca local</span>
                <strong>{notes.length} notas guardadas</strong>
                <small>{libraryMessage || 'Exporta o importa una copia JSON de tus notas.'}</small>
              </div>
              <div className="library-actions">
                <button
                  type="button"
                  onClick={exportLibrary}
                  disabled={busy === 'export' || busy === 'import' || busy === 'exportMcp'}
                  title="Exportar biblioteca"
                >
                  {busy === 'export' ? <Loader2 className="spin" size={16} /> : <FileDown size={16} />}
                  Exportar
                </button>
                <button
                  type="button"
                  onClick={importLibrary}
                  disabled={busy === 'export' || busy === 'import' || busy === 'exportMcp'}
                  title="Importar biblioteca"
                >
                  {busy === 'import' ? <Loader2 className="spin" size={16} /> : <FileUp size={16} />}
                  Importar
                </button>
                <button
                  type="button"
                  onClick={exportMcpHandoff}
                  disabled={busy === 'export' || busy === 'import' || busy === 'exportMcp'}
                  title="Exportar handoff MCP"
                >
                  {busy === 'exportMcp' ? <Loader2 className="spin" size={16} /> : <Network size={16} />}
                  MCP JSON
                </button>
              </div>
            </div>
          </section>
        )}

        {selectedNote && workspaceView === 'note' ? (
          <section className="note-workspace">
            <article className="editor-pane">
              <div className="note-heading">
                <div>
                  <p>{selectedNote.category}</p>
                  <textarea
                    className="title-editor"
                    value={editorTitle}
                    onChange={(event) => {
                      setEditorTitle(event.target.value)
                      setSaveState('dirty')
                    }}
                    rows={1}
                    spellCheck
                  />
                </div>
                <span className={`status-badge status-${selectedNote.analysisStatus}`}>
                  {statusLabel(selectedNote)}
                </span>
              </div>

              <textarea
                className="note-editor"
                value={editorContent}
                onChange={(event) => {
                  setEditorContent(event.target.value)
                  setSaveState('dirty')
                }}
                spellCheck
              />

              <div className="editor-actions">
                <span className={`save-indicator save-${saveState}`}>
                  {saveState === 'saving' ? (
                    <Loader2 className="spin" size={14} />
                  ) : saveState === 'error' ? (
                    <CircleAlert size={14} />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  {saveStateLabel(saveState)}
                </span>
                <button type="button" onClick={() => saveSelected()} disabled={busy === 'save' || saveState === 'saving'} title="Guardar">
                  {busy === 'save' ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
                  Guardar
                </button>
                <button type="button" onClick={() => runAnalysis()} disabled={busy === 'analyze'} title="Analizar">
                  {busy === 'analyze' ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
                  Analizar
                </button>
                <button
                  type="button"
                  onClick={exportSelectedMarkdown}
                  disabled={busy === 'exportMarkdown'}
                  title="Exportar Markdown"
                >
                  {busy === 'exportMarkdown' ? <Loader2 className="spin" size={17} /> : <FileText size={17} />}
                  Markdown
                </button>
                <button type="button" className="danger" onClick={deleteSelected} disabled={busy === 'delete'} title="Eliminar">
                  <Trash2 size={17} />
                </button>
              </div>
              {editorMessage && <div className="editor-message">{editorMessage}</div>}
            </article>

            <aside className="inspector">
              <section className="metadata-editor">
                <h3>Metadatos</h3>
                <label>
                  Categoria
                  <select
                    value={metadataCategory}
                    onChange={(event) => {
                      setMetadataCategory(event.target.value)
                      setMetadataState('dirty')
                    }}
                  >
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Etiquetas
                  <input
                    value={metadataTags}
                    onChange={(event) => {
                      setMetadataTags(event.target.value)
                      setMetadataState('dirty')
                    }}
                    placeholder="qwen, rag, producto"
                  />
                </label>
                <div className="metadata-actions">
                  <span className={`save-indicator save-${metadataState}`}>
                    {metadataState === 'saving' ? (
                      <Loader2 className="spin" size={14} />
                    ) : metadataState === 'error' ? (
                      <CircleAlert size={14} />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    {saveStateLabel(metadataState)}
                  </span>
                  <button
                    type="button"
                    onClick={() => saveMetadata()}
                    disabled={busy === 'metadata' || metadataState === 'saving'}
                    title="Guardar metadatos"
                  >
                    {busy === 'metadata' ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
                    Guardar
                  </button>
                </div>
              </section>

              <section>
                <h3>Resumen</h3>
                <p className="summary-text">{selectedNote.summary || 'Pendiente de analisis.'}</p>
              </section>

              <section>
                <h3>Etiquetas</h3>
                <div className="tag-row">
                  {selectedNote.tags.length > 0 ? (
                    selectedNote.tags.map((tag) => <span key={tag}>#{tag}</span>)
                  ) : (
                    <span className="muted">Sin etiquetas</span>
                  )}
                </div>
              </section>

              <section>
                <div className="section-title">
                  <h3>Acciones</h3>
                  <span>{selectedNote.suggestedActions.length}</span>
                </div>
                <div className="action-list">
                  {selectedNote.suggestedActions.length > 0 ? (
                    selectedNote.suggestedActions.map((action, index) => {
                      const isSaved = savedSuggestedActionKeys.has(actionIdentity(action))
                      const saveActionBusy = busy === `saveAction:${index}`

                      return (
                        <div className="action-row" key={`${action.kind}:${action.title}:${index}`}>
                          <span>
                            <strong>{action.title}</strong>
                            <small>{action.detail}</small>
                          </span>
                          <div>
                            <strong>{suggestedActionKindLabel(action.kind)}</strong>
                            <small>{Math.round(action.confidence * 100)}%</small>
                            <button
                              type="button"
                              onClick={() => saveSuggestedAction(index)}
                              disabled={isSaved || saveActionBusy}
                              title={isSaved ? 'Accion guardada' : 'Guardar accion'}
                            >
                              {saveActionBusy ? (
                                <Loader2 className="spin" size={13} />
                              ) : isSaved ? (
                                <CheckCircle2 size={13} />
                              ) : (
                                <Plus size={13} />
                              )}
                              {isSaved ? 'Guardada' : 'Guardar'}
                            </button>
                          </div>
                          {action.toolHint && <code>{action.toolHint}</code>}
                        </div>
                      )
                    })
                  ) : (
                    <p className="muted">Sin acciones sugeridas.</p>
                  )}
                </div>
              </section>

              <section>
                <div className="section-title">
                  <h3>Plan local</h3>
                  <span>{selectedActionItems.filter((action) => action.status === 'open').length}</span>
                </div>
                <div className="saved-action-list">
                  {selectedActionItems.length > 0 ? (
                    selectedActionItems.map((action) => (
                      <div className="saved-action-row" data-status={action.status} key={action.id}>
                        <span>
                          <strong>{action.title}</strong>
                          <small>{action.detail}</small>
                          {action.toolHint && <code>{action.toolHint}</code>}
                        </span>
                        <div className="saved-action-actions">
                          <button
                            type="button"
                            onClick={() => toggleActionStatus(action)}
                            disabled={busy === `actionStatus:${action.id}`}
                            title={action.status === 'done' ? 'Reabrir accion' : 'Marcar como hecha'}
                          >
                            {busy === `actionStatus:${action.id}` ? (
                              <Loader2 className="spin" size={14} />
                            ) : action.status === 'done' ? (
                              <CheckCircle2 size={14} />
                            ) : (
                              <Circle size={14} />
                            )}
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => removeActionItem(action.id)}
                            disabled={busy === `deleteAction:${action.id}`}
                            title="Eliminar accion"
                          >
                            {busy === `deleteAction:${action.id}` ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="muted">Sin acciones guardadas.</p>
                  )}
                </div>
              </section>

              {selectedNote.analysisRun && (
                <section>
                  <h3>Analisis</h3>
                  <div className="analysis-grid">
                    <span>
                      <strong>{analysisProviderLabel(selectedNote.analysisRun.provider)}</strong>
                      <small>Motor</small>
                    </span>
                    <span>
                      <strong>{durationLabel(selectedNote.analysisRun.durationMs)}</strong>
                      <small>Tiempo</small>
                    </span>
                    <span>
                      <strong>{selectedNote.analysisRun.ragNoteIds.length}</strong>
                      <small>RAG</small>
                    </span>
                  </div>
                  <div className="analysis-model">
                    <span>{selectedNote.analysisRun.model}</span>
                    <small>{formatDate(selectedNote.analysisRun.analyzedAt)}</small>
                  </div>
                  {analysisContextItems.length > 0 ? (
                    <div className="rag-context-list">
                      {analysisContextItems.map((item) => (
                        <button
                          type="button"
                          key={item.noteId}
                          onClick={() => setSelectedId(item.noteId)}
                          title="Abrir nota de contexto"
                        >
                          <span>
                            <strong>{item.title}</strong>
                            <small>
                              {item.category} - {Math.round(item.score * 100)}%
                            </small>
                          </span>
                          <small>{item.excerpt || item.reason}</small>
                        </button>
                      ))}
                    </div>
                  ) : analysisContextNotes.length > 0 ? (
                    <div className="analysis-context">
                      {analysisContextNotes.map((note) => (
                        <button
                          type="button"
                          key={note.id}
                          onClick={() => setSelectedId(note.id)}
                          title="Abrir nota de contexto"
                        >
                          {note.title}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </section>
              )}

              <section>
                <div className="section-title">
                  <h3>Notas enlazadas</h3>
                  <span>{selectedNote.related.length}</span>
                </div>
                <div className="manual-link-controls">
                  <select
                    value={manualLinkTargetId}
                    onChange={(event) => setManualLinkTargetId(event.target.value)}
                    disabled={linkableNotes.length === 0}
                    title="Nota para enlazar"
                  >
                    {linkableNotes.length > 0 ? (
                      linkableNotes.map((note) => (
                        <option key={note.id} value={note.id}>
                          {note.title}
                        </option>
                      ))
                    ) : (
                      <option value="">Sin notas disponibles</option>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={addManualLink}
                    disabled={!manualLinkTargetId || busy === 'manualLink'}
                    title="Enlazar nota"
                  >
                    {busy === 'manualLink' ? <Loader2 className="spin" size={15} /> : <Link2 size={15} />}
                    Enlazar
                  </button>
                </div>
                <div className="related-list">
                  {selectedNote.related.length > 0 ? (
                    selectedNote.related.map((related) => (
                      <div className="related-item" key={related.noteId}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(related.noteId)}
                          className="related-row"
                        >
                          <Link2 size={15} />
                          <span>
                            <strong>{related.title}</strong>
                            <small>{related.reason}</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="unlink-button"
                          onClick={() => removeManualLink(related.noteId)}
                          disabled={busy === `removeLink:${related.noteId}`}
                          title="Quitar enlace"
                        >
                          {busy === `removeLink:${related.noteId}` ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="muted">Sin enlaces todavia.</p>
                  )}
                </div>
              </section>

              {selectedNote.analysisError && (
                <section className="error-box">
                  <h3>IA local</h3>
                  <p>{selectedNote.analysisError}</p>
                </section>
              )}
            </aside>
          </section>
        ) : selectedNote ? (
          <section className="network-workspace">
            <article className="network-map">
              <div className="network-header">
                <div>
                  <p>{selectedNote.category}</p>
                  <h2>{selectedNote.title}</h2>
                </div>
                <span>{selectedConnections.length} enlaces</span>
              </div>

              <div className="network-canvas">
                <svg className="network-lines" viewBox="0 0 100 100" aria-hidden="true">
                  {networkNodes.map((connection) => (
                    <line
                      key={connection.note.id}
                      x1={50}
                      y1={50}
                      x2={connection.x}
                      y2={connection.y}
                    />
                  ))}
                </svg>

                <button
                  type="button"
                  className="graph-node graph-node-current"
                  style={{ left: '50%', top: '50%' }}
                  onClick={() => setWorkspaceView('note')}
                  title="Abrir nota"
                >
                  <strong>{selectedNote.title}</strong>
                  <span>{selectedNote.category}</span>
                </button>

                {networkNodes.map((connection) => (
                  <button
                    type="button"
                    key={connection.note.id}
                    className={`graph-node graph-node-${connection.direction}`}
                    style={{ left: `${connection.x}%`, top: `${connection.y}%` }}
                    onClick={() => setSelectedId(connection.note.id)}
                    title="Seleccionar nota"
                  >
                    <strong>{connection.note.title}</strong>
                    <span>
                      {Math.round(connection.score * 100)}% - {connection.note.category}
                    </span>
                  </button>
                ))}

                {networkNodes.length === 0 && (
                  <div className="network-empty">
                    <Link2 size={22} />
                    <span>Sin conexiones todavia.</span>
                  </div>
                )}
              </div>
            </article>

            <aside className="network-details">
              <section>
                <h3>Red local</h3>
                <div className="network-stats">
                  <span>
                    <strong>{notes.length}</strong>
                    Notas
                  </span>
                  <span>
                    <strong>{allGraphEdges.length}</strong>
                    Conexiones
                  </span>
                  <span>
                    <strong>{pendingAnalysisCount}</strong>
                    Pendientes
                  </span>
                </div>
              </section>

              <section>
                <div className="section-title">
                  <h3>Conexiones</h3>
                  <span>{selectedConnections.length}</span>
                </div>
                <div className="related-list">
                  {selectedConnections.length > 0 ? (
                    selectedConnections.map((connection) => (
                      <button
                        type="button"
                        key={connection.note.id}
                        onClick={() => setSelectedId(connection.note.id)}
                        className="related-row"
                      >
                        <Network size={15} />
                        <span>
                          <strong>{connection.note.title}</strong>
                          <small>
                            {directionLabel(connection.direction)} - {connection.reason}
                          </small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="muted">Sin conexiones todavia.</p>
                  )}
                </div>
              </section>

              <section>
                <h3>Categorias</h3>
                <div className="tag-row">
                  {categoryCounts.slice(1, 7).map((category) => (
                    <span key={category.name}>
                      {category.name} {category.count}
                    </span>
                  ))}
                </div>
              </section>
            </aside>
          </section>
        ) : (
          <section className="empty-state">
            <BrainCircuit size={38} />
            <h2>Neuronotes</h2>
            <p>Escribe la primera nota para crear tu base local.</p>
          </section>
        )}
      </main>
    </div>
  )
}
