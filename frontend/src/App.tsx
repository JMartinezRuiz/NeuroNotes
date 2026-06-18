import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import * as THREE from "three";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  FileText,
  Folder,
  FolderKanban,
  Eye,
  Inbox,
  Image as ImageIcon,
  Link,
  Loader2,
  Moon,
  Network,
  Plug,
  Plus,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Sun,
  Tags,
  Wand2,
} from "lucide-react";

declare global {
  interface Window {
    neuronotes?: {
      apiBase?: string;
      apiToken?: string;
      desktop?: boolean;
    };
  }
}

type ViewMode = "notes" | "map" | "llm";
type ThemeMode = "light" | "dark";
type ScopeType = "all" | "project" | "folder" | "category" | "loose";
type AiMode = "grammar" | "clean" | "format" | "categorize";
type SidebarSectionId = "library" | "folders" | "categories" | "projects";

type LibraryScope = {
  type: ScopeType;
  id: string;
  label: string;
};

type Project = {
  id: string;
  name: string;
  goal: string;
  status: string;
  summary: string;
  tags: string[];
};

type Note = {
  id: string;
  project_id: string;
  title: string;
  content: string;
  type: string;
  status: string;
  folder: string;
  category: string;
  agent: string;
  created_by_agent_id: string;
  color: string;
  tokens: number;
  excerpt: string;
  created_at: string;
};

type Dashboard = {
  project: Project;
  projects: Project[];
  agents: Array<{
    id: string;
    name: string;
    role: string;
    color: string;
    status: "online" | "ready" | "offline";
    permissions: string[];
    pendingWrites: number;
  }>;
  decisions: Array<{ id: string; text: string; status: string; agent: string }>;
  tasks: Task[];
  notes: Array<Omit<Note, "content" | "project_id" | "created_by_agent_id" | "created_at">>;
  inbox: unknown[];
  activity: unknown[];
  health: Record<string, number>;
  pending_patches: string[];
};

type Task = {
  id: string;
  project_id: string;
  title: string;
  status: "open" | "in_progress" | "review" | "implemented";
  source_note_id?: string | null;
  source_agent_id?: string;
  source: string;
  created_at?: string;
};

type Relation = {
  id: string;
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  relation_type: string;
  created_by_agent_id: string;
  created_by: string;
  status: string;
  created_at: string;
};

type SearchResult = {
  id: string;
  project_id: string;
  project_name: string;
  kind: string;
  title: string;
  status: string;
  folder?: string;
  category?: string;
  snippet: string;
};

type ModelHealth = {
  online: boolean;
  provider?: string;
  model: string;
  base_url: string;
  message: string;
};

type CountItem = {
  id: string;
  label: string;
  count: number;
};

type VectorNode = {
  id: string;
  project_id: string;
  title: string;
  type: string;
  status: string;
  folder: string;
  category: string;
  agent: string;
  color: string;
  excerpt: string;
  dimensions: number;
  model: string;
  x: number;
  y: number;
  z: number;
  updated_at: string;
};

type VectorEdge = {
  id: string;
  from_id: string;
  to_id: string;
  relation_type: string;
  score: number;
  source: "relation" | "vector";
};

type VectorMap = {
  nodes: VectorNode[];
  edges: VectorEdge[];
  dimensions: number;
  model: string;
  sources: {
    relation_edges: number;
    semantic_edges: number;
  };
};

type GraphNode = (VectorNode | Note) & {
  graphX: number;
  graphY: number;
  linkCount: number;
};

type ThreeCluster = {
  id: string;
  label: string;
  count: number;
  radius: number;
  color: string;
  position: THREE.Vector3;
  labelPosition: THREE.Vector3;
};

const fallbackProject: Project = {
  id: "agent-memory-hub",
  name: "Agent Memory Hub",
  goal: "Crear una app local-first donde humanos y agentes compartan memoria.",
  status: "MVP",
  summary: "Single brain local para notas, tareas, relaciones y contexto de LLMs.",
  tags: ["single-brain", "LLM", "local-first"],
};

const fallbackDashboard: Dashboard = {
  project: fallbackProject,
  projects: [fallbackProject],
  agents: [],
  decisions: [],
  tasks: [],
  notes: [],
  inbox: [],
  activity: [],
  health: {},
  pending_patches: [],
};

const emptyDraft: Partial<Note> = {
  project_id: fallbackProject.id,
  title: "",
  content: "",
  type: "Human Note",
  status: "draft",
  folder: "",
  category: "General",
  created_by_agent_id: "user",
};

const defaultScope: LibraryScope = {
  type: "project",
  id: fallbackProject.id,
  label: fallbackProject.name,
};

const defaultSidebarOrder: SidebarSectionId[] = ["library", "folders", "categories", "projects"];

const modes: Array<{ id: ViewMode; label: string; icon: typeof FileText }> = [
  { id: "notes", label: "Notes", icon: FileText },
  { id: "map", label: "Map", icon: Network },
  { id: "llm", label: "LLM", icon: Plug },
];

const aiModes: Array<{ id: AiMode; label: string; goal: string }> = [
  {
    id: "grammar",
    label: "Grammar",
    goal: "Only correct grammar, spelling, punctuation and casing. Preserve the note structure.",
  },
  {
    id: "clean",
    label: "Clean",
    goal: "Turn this messy capture into a clean note with concise headings or bullets. Do not add facts.",
  },
  {
    id: "format",
    label: "Format",
    goal: "Format and polish this quick note. Correct phrasing and structure without adding information.",
  },
  {
    id: "categorize",
    label: "Categorize",
    goal: "Assign the best project, folder, category, type and links. Keep the content almost unchanged.",
  },
];

function apiUrl(path: string) {
  const base = window.neuronotes?.apiBase ?? import.meta.env.VITE_API_BASE ?? "";
  return `${base}${path}`;
}

function apiToken(): string {
  return window.neuronotes?.apiToken ?? import.meta.env.VITE_API_TOKEN ?? "";
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = apiToken();
  const response = await fetch(apiUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Neuronotes-Token": token } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function App() {
  const [mode, setMode] = useState<ViewMode>("notes");
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = window.localStorage.getItem("neuronotes-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [dashboard, setDashboard] = useState<Dashboard>(fallbackDashboard);
  const [scope, setScope] = useState<LibraryScope>(defaultScope);
  const [selectedProjectId, setSelectedProjectId] = useState(fallbackProject.id);
  const [notes, setNotes] = useState<Note[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [aiWorking, setAiWorking] = useState(false);
  const [modelHealth, setModelHealth] = useState<ModelHealth>({
    online: false,
    model: "qwen3:4b",
    base_url: "http://localhost:11434",
    message: "Modelo local no comprobado.",
  });

  const selectedProject =
    dashboard.projects.find((project) => project.id === selectedProjectId) ?? dashboard.project;
  const folders = useMemo(() => buildCountItems(allNotes, (note) => note.folder), [allNotes]);
  const categories = useMemo(() => buildCountItems(allNotes, (note) => note.category || "General"), [allNotes]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("neuronotes-theme", theme);
  }, [theme]);

  async function refresh(nextScope: LibraryScope = scope) {
    const dashboardProjectId = nextScope.type === "project" ? nextScope.id : selectedProjectId || fallbackProject.id;
    const scopedNotesPath = notesPathForScope(nextScope);
    const taskPath =
      nextScope.type === "project" ? `/api/tasks?project_id=${encodeURIComponent(nextScope.id)}` : "/api/tasks";
    const relationPath =
      nextScope.type === "project"
        ? `/api/relations?project_id=${encodeURIComponent(nextScope.id)}`
        : "/api/relations";

    const [dash, noteRows, allNoteRows, taskRows, relationRows] = await Promise.all([
      api<Dashboard>(`/api/dashboard?project_id=${encodeURIComponent(dashboardProjectId)}`),
      api<Note[]>(scopedNotesPath),
      api<Note[]>("/api/notes"),
      api<Task[]>(taskPath),
      api<Relation[]>(relationPath),
    ]);

    const nextProjectId = nextScope.type === "project" ? dash.project.id : noteRows[0]?.project_id ?? dashboardProjectId;
    setDashboard(dash);
    setSelectedProjectId(nextProjectId);
    setNotes(noteRows);
    setAllNotes(allNoteRows);
    setTasks(taskRows);
    setRelations(relationRows);
    setSelectedNoteId((current) => (noteRows.some((note) => note.id === current) ? current : noteRows[0]?.id || ""));

    try {
      setModelHealth(await api<ModelHealth>("/api/health/model"));
    } catch {
      setModelHealth((current) => ({
        ...current,
        online: false,
        message: "Qwen no responde; notas, tareas y mapa siguen activos.",
      }));
    }
  }

  useEffect(() => {
    refresh(defaultScope).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!notes.length) {
      setSelectedNoteId("");
      return;
    }
    if (!selectedNoteId || !notes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(notes[0].id);
    }
  }, [notes, selectedNoteId]);

  useEffect(() => {
    let cancelled = false;
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    api<SearchResult[]>(`/api/search?query=${encodeURIComponent(searchQuery)}&limit=9`)
      .then((results) => {
        if (!cancelled) setSearchResults(results);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  async function chooseScope(nextScope: LibraryScope) {
    setScope(nextScope);
    setSelectedNoteId("");
    if (nextScope.type === "project") {
      setSelectedProjectId(nextScope.id);
    }
    await refresh(nextScope);
    setMode("notes");
  }

  async function openNoteInProject(note: Note) {
    const project = dashboard.projects.find((item) => item.id === note.project_id);
    const nextScope = projectScope(project ?? { ...fallbackProject, id: note.project_id, name: note.project_id });
    setScope(nextScope);
    await refresh(nextScope);
    setSelectedNoteId(note.id);
    setMode("notes");
  }

  async function openSearchResult(result: SearchResult) {
    if (result.project_id) {
      const project = dashboard.projects.find((item) => item.id === result.project_id);
      const nextScope = projectScope(project ?? { ...fallbackProject, id: result.project_id, name: result.project_name });
      await chooseScope(nextScope);
    }
    if (result.kind === "note") {
      setSelectedNoteId(result.id);
      setMode("notes");
    } else if (result.project_id) {
      setMode("notes");
    }
    setSearchQuery("");
    setSearchResults([]);
  }

  return (
    <div className="singlebrain-app">
      <ProjectSidebar
        projects={dashboard.projects}
        scope={scope}
        selectedProject={selectedProject}
        folders={folders}
        categories={categories}
        allNotesCount={allNotes.length}
        looseNotesCount={allNotes.filter((note) => !note.folder?.trim()).length}
        onChooseScope={chooseScope}
        onProjectCreated={(project) => chooseScope(projectScope(project))}
      />

      <main className="brain-main">
        <Topbar
          mode={mode}
          setMode={setMode}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchResults={searchResults}
          openSearchResult={openSearchResult}
          aiWorking={aiWorking}
          modelHealth={modelHealth}
          theme={theme}
          toggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        />

        {mode === "notes" ? (
          <NotesWorkspace
            projects={dashboard.projects}
            selectedProject={selectedProject}
            scope={scope}
            notes={notes}
            allNotes={allNotes}
            folders={folders}
            categories={categories}
            tasks={tasks}
            relations={relations}
            selectedNoteId={selectedNoteId}
            setSelectedNoteId={setSelectedNoteId}
            setMode={setMode}
            refresh={() => refresh(scope)}
            openNoteInProject={openNoteInProject}
            setAiWorking={setAiWorking}
          />
        ) : null}

        {mode === "map" ? (
          <MapWorkspace
            scope={scope}
            projects={dashboard.projects}
            notes={notes}
            allNotes={allNotes}
            tasks={tasks}
            relations={relations}
            selectedNoteId={selectedNoteId}
            onSelectNote={setSelectedNoteId}
            onOpenNote={openNoteInProject}
          />
        ) : null}

        {mode === "llm" ? <LLMWorkspace selectedProject={selectedProject} modelHealth={modelHealth} /> : null}
      </main>
    </div>
  );
}

function ProjectSidebar({
  projects,
  scope,
  selectedProject,
  folders,
  categories,
  allNotesCount,
  looseNotesCount,
  onChooseScope,
  onProjectCreated,
}: {
  projects: Project[];
  scope: LibraryScope;
  selectedProject: Project;
  folders: CountItem[];
  categories: CountItem[];
  allNotesCount: number;
  looseNotesCount: number;
  onChooseScope: (scope: LibraryScope) => Promise<void>;
  onProjectCreated: (project: Project) => void | Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<SidebarSectionId, boolean>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("neuronotes-sidebar-collapsed") || "{}");
    } catch {
      return {};
    }
  });
  const [sectionOrder, setSectionOrder] = useState<SidebarSectionId[]>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("neuronotes-sidebar-order") || "[]");
      if (Array.isArray(saved) && defaultSidebarOrder.every((item) => saved.includes(item))) {
        return saved;
      }
    } catch {
      return defaultSidebarOrder;
    }
    return defaultSidebarOrder;
  });

  useEffect(() => {
    window.localStorage.setItem("neuronotes-sidebar-collapsed", JSON.stringify(collapsedSections));
  }, [collapsedSections]);

  useEffect(() => {
    window.localStorage.setItem("neuronotes-sidebar-order", JSON.stringify(sectionOrder));
  }, [sectionOrder]);

  async function createProject() {
    if (!name.trim()) return;
    const created = await api<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name,
        goal: "",
        status: "active",
        summary: "",
        tags: [],
      }),
    });
    setName("");
    setCreating(false);
    await onProjectCreated(created);
  }

  function toggleSection(section: SidebarSectionId) {
    setCollapsedSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function moveSection(section: SidebarSectionId, direction: -1 | 1) {
    setSectionOrder((current) => {
      const index = current.indexOf(section);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  const sections: Record<SidebarSectionId, { label: string; actions?: ReactNode; content: ReactNode }> = {
    library: {
      label: "Library",
      content: (
        <div className="library-list">
          <ScopeButton
            active={scope.type === "all"}
            icon={Archive}
            label="All notes"
            count={allNotesCount}
            onClick={() => onChooseScope({ type: "all", id: "all", label: "All notes" })}
          />
          <ScopeButton
            active={scope.type === "loose"}
            icon={Inbox}
            label="Loose notes"
            count={looseNotesCount}
            onClick={() => onChooseScope({ type: "loose", id: "loose", label: "Loose notes" })}
          />
        </div>
      ),
    },
    folders: {
      label: "Folders",
      content: (
        <div className="library-list">
          {folders.length ? (
            folders.map((folder) => (
              <ScopeButton
                active={scope.type === "folder" && scope.id === folder.id}
                icon={Folder}
                key={folder.id}
                label={folder.label}
                count={folder.count}
                onClick={() => onChooseScope({ type: "folder", id: folder.id, label: folder.label })}
              />
            ))
          ) : (
            <p className="empty-sidebar">No folders yet</p>
          )}
        </div>
      ),
    },
    categories: {
      label: "Categories",
      content: (
        <div className="library-list">
          {categories.map((category) => (
            <ScopeButton
              active={scope.type === "category" && scope.id === category.id}
              icon={Tags}
              key={category.id}
              label={category.label}
              count={category.count}
              onClick={() => onChooseScope({ type: "category", id: category.id, label: category.label })}
            />
          ))}
        </div>
      ),
    },
    projects: {
      label: "Projects",
      actions: (
        <button className="ghost-icon" type="button" title="New project" onClick={() => setCreating(true)}>
          <Plus size={15} />
        </button>
      ),
      content: (
        <>
          {creating ? (
            <div className="new-project-box">
              <input
                autoFocus
                placeholder="Project name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createProject();
                  if (event.key === "Escape") setCreating(false);
                }}
              />
              <button className="primary-button small" type="button" onClick={createProject}>
                Create
              </button>
            </div>
          ) : null}
          <div className="project-list">
            {projects.map((project) => (
              <ScopeButton
                active={scope.type === "project" && scope.id === project.id}
                icon={FolderKanban}
                key={project.id}
                label={project.name}
                onClick={() => onChooseScope(projectScope(project))}
              />
            ))}
          </div>
        </>
      ),
    },
  };

  return (
    <aside className="project-sidebar">
      <div className="brand">
        <div className="brand-mark">N2</div>
        <div>
          <strong>Neuronotes</strong>
          <span>single brain</span>
        </div>
      </div>

      {sectionOrder.map((sectionId) => {
        const section = sections[sectionId];
        return (
          <SidebarSection
            collapsed={Boolean(collapsedSections[sectionId])}
            key={sectionId}
            label={section.label}
            onMoveDown={() => moveSection(sectionId, 1)}
            onMoveUp={() => moveSection(sectionId, -1)}
            onToggle={() => toggleSection(sectionId)}
            actions={section.actions}
          >
            {section.content}
          </SidebarSection>
        );
      })}

      <section className="project-summary">
        <span>{selectedProject.status}</span>
        <p>{selectedProject.summary || selectedProject.goal || "No project summary yet."}</p>
      </section>
    </aside>
  );
}

function SidebarSection({
  label,
  collapsed,
  actions,
  children,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  label: string;
  collapsed: boolean;
  actions?: ReactNode;
  children: ReactNode;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <section className={collapsed ? "sidebar-section collapsed" : "sidebar-section"}>
      <div className="section-title">
        <button className="section-toggle" type="button" onClick={onToggle} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <span>{label}</span>
        </button>
        <div className="section-actions">
          <button className="tiny-icon" type="button" title="Move up" onClick={onMoveUp}>
            <ArrowUp size={13} />
          </button>
          <button className="tiny-icon" type="button" title="Move down" onClick={onMoveDown}>
            <ArrowDown size={13} />
          </button>
          {actions}
        </div>
      </div>
      {collapsed ? null : children}
    </section>
  );
}

function ScopeButton({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: typeof FileText;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button className={active ? "project-row active" : "project-row"} type="button" onClick={onClick}>
      <Icon size={15} />
      <span>{label}</span>
      {typeof count === "number" ? <small>{count}</small> : null}
    </button>
  );
}

function Topbar({
  mode,
  setMode,
  searchQuery,
  setSearchQuery,
  searchResults,
  openSearchResult,
  aiWorking,
  modelHealth,
  theme,
  toggleTheme,
}: {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  openSearchResult: (result: SearchResult) => void | Promise<void>;
  aiWorking: boolean;
  modelHealth: ModelHealth;
  theme: ThemeMode;
  toggleTheme: () => void;
}) {
  return (
    <header className="topbar">
      <nav className="mode-switch" aria-label="Main workspace modes">
        {modes.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={mode === item.id ? "active" : ""}
              type="button"
              key={item.id}
              onClick={() => setMode(item.id)}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="search-area">
        <label className="search-box">
          <Search size={16} />
          <input
            placeholder="Search notes, tasks, decisions..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        {searchResults.length ? (
          <div className="suggestions">
            <span>Suggestions</span>
            {searchResults.map((result) => (
              <button type="button" key={`${result.kind}-${result.id}`} onClick={() => openSearchResult(result)}>
                <strong>{result.title}</strong>
                <small>
                  {result.kind} - {result.category || result.status} - {result.project_name}
                </small>
                <p>{result.snippet}</p>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="topbar-actions">
        <AIBadge working={aiWorking} modelHealth={modelHealth} />
        <button className="icon-button" type="button" title="Toggle dark mode" onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}

function AIBadge({ working, modelHealth }: { working: boolean; modelHealth: ModelHealth }) {
  return (
    <div className={working ? "ai-badge working" : modelHealth.online ? "ai-badge online" : "ai-badge"}>
      {working ? <Loader2 size={14} /> : <Bot size={14} />}
      <span>{working ? "Qwen working" : modelHealth.online ? "Qwen ready" : "Qwen offline"}</span>
    </div>
  );
}

function NotesWorkspace({
  projects,
  selectedProject,
  scope,
  notes,
  allNotes,
  folders,
  categories,
  tasks,
  relations,
  selectedNoteId,
  setSelectedNoteId,
  setMode,
  refresh,
  openNoteInProject,
  setAiWorking,
}: {
  projects: Project[];
  selectedProject: Project;
  scope: LibraryScope;
  notes: Note[];
  allNotes: Note[];
  folders: CountItem[];
  categories: CountItem[];
  tasks: Task[];
  relations: Relation[];
  selectedNoteId: string;
  setSelectedNoteId: (noteId: string) => void;
  setMode: (mode: ViewMode) => void;
  refresh: () => Promise<void>;
  openNoteInProject: (note: Note) => Promise<void>;
  setAiWorking: (working: boolean) => void;
}) {
  const [draft, setDraft] = useState<Partial<Note>>(emptyDraft);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [linkTarget, setLinkTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeAiMode, setActiveAiMode] = useState<AiMode | "">("");
  const [editorMode, setEditorMode] = useState<"write" | "preview">("write");
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const loadedNoteIdRef = useRef<string>("");
  const scopeKeyRef = useRef<string>("");

  function editDraft(patch: Partial<Note>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  }

  useEffect(() => {
    const scopeKey = `${scope.type}:${scope.id}:${selectedProject.id}`;
    if (selectedNoteId) {
      // Only (re)load when the SELECTED note actually changes — never when a
      // background refresh hands us a fresh object for the same note. This is
      // what was silently destroying in-progress edits.
      if (selectedNoteId !== loadedNoteIdRef.current) {
        const found = notes.find((note) => note.id === selectedNoteId);
        if (found) {
          setDraft(found);
          loadedNoteIdRef.current = selectedNoteId;
          scopeKeyRef.current = scopeKey;
          setDirty(false);
          setSaveError("");
        }
      }
      return;
    }
    if (loadedNoteIdRef.current !== "" || scopeKeyRef.current !== scopeKey) {
      setDraft(newDraftForScope(scope, selectedProject));
      loadedNoteIdRef.current = "";
      scopeKeyRef.current = scopeKey;
      setDirty(false);
      setSaveError("");
    }
  }, [selectedNoteId, notes, selectedProject.id, scope.id, scope.type]);

  const relatedNotes = useMemo(() => {
    if (!draft.id) return [];
    const ids = new Set<string>();
    relations.forEach((relation) => {
      if (relation.from_type === "note" && relation.to_type === "note" && relation.from_id === draft.id) {
        ids.add(relation.to_id);
      }
      if (relation.from_type === "note" && relation.to_type === "note" && relation.to_id === draft.id) {
        ids.add(relation.from_id);
      }
    });
    return allNotes.filter((note) => ids.has(note.id));
  }, [draft.id, relations, allNotes]);

  async function saveNote(opts?: { silent?: boolean }): Promise<Note | undefined> {
    const silent = opts?.silent === true;
    if (!silent) setSaving(true);
    setDirty(false);
    const payload = {
      project_id: draft.project_id || selectedProject.id,
      title: draft.title?.trim() || "Untitled",
      content: draft.content || "",
      type: draft.type || "Human Note",
      status: draft.status || "draft",
      folder: draft.folder?.trim() || "",
      category: draft.category?.trim() || "General",
      created_by_agent_id: draft.created_by_agent_id || "user",
    };
    try {
      const note = draft.id
        ? await api<Note>(`/api/notes/${draft.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api<Note>("/api/notes", { method: "POST", body: JSON.stringify(payload) });
      loadedNoteIdRef.current = note.id;
      setSaveError("");
      // Silent autosave must NOT overwrite the live draft or trigger a refresh:
      // the user may have typed more characters while the request was in flight.
      if (!silent) {
        setDraft(note);
        setSelectedNoteId(note.id);
        await refresh();
      }
      return note;
    } catch (error) {
      setDirty(true);
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar la nota.");
      return undefined;
    } finally {
      if (!silent) setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty || !draft.id) return;
    const handle = window.setTimeout(() => {
      void saveNote({ silent: true });
    }, 800);
    return () => window.clearTimeout(handle);
  }, [dirty, draft.id, draft.title, draft.content, draft.folder, draft.category, draft.type, draft.status, draft.project_id]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function runAiMode(item: (typeof aiModes)[number]) {
    setAiWorking(true);
    setActiveAiMode(item.id);
    try {
      const target = await saveNote();
      if (!target?.id) return;
      const result = await api<{ note: Note }>(`/api/notes/${target.id}/improve`, {
        method: "POST",
        body: JSON.stringify({
          agent_id: "qwen",
          mode: item.id,
          goal: item.goal,
        }),
      });
      setDraft(result.note);
      setSelectedNoteId(result.note.id);
      loadedNoteIdRef.current = result.note.id;
      setDirty(false);
      await refresh();
    } finally {
      setActiveAiMode("");
      setAiWorking(false);
    }
  }

  function newNote() {
    setSelectedNoteId("");
    setDraft(newDraftForScope(scope, selectedProject));
    loadedNoteIdRef.current = "";
    setDirty(false);
    setSaveError("");
    setEditorMode("write");
  }

  async function insertImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const dataUrl = await readFileAsDataUrl(file);
    const imageMarkdown = `![${file.name.replace(/\.[^.]+$/, "")}](${dataUrl})`;
    setDraft((current) => ({
      ...current,
      content: `${current.content || ""}${current.content?.trim() ? "\n\n" : ""}${imageMarkdown}\n`,
    }));
    setDirty(true);
    setEditorMode("preview");
  }

  async function addTask() {
    if (!newTaskTitle.trim()) return;
    await api<Task>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        project_id: draft.project_id || selectedProject.id,
        title: newTaskTitle,
        status: "open",
        source_note_id: draft.id || null,
        source_agent_id: "user",
      }),
    });
    setNewTaskTitle("");
    await refresh();
  }

  async function cycleTask(task: Task) {
    const nextStatus = {
      open: "in_progress",
      in_progress: "review",
      review: "implemented",
      implemented: "open",
    }[task.status] as Task["status"];
    await api<Task>(`/api/tasks/${task.id}`, {
      method: "PUT",
      body: JSON.stringify({
        project_id: task.project_id,
        title: task.title,
        status: nextStatus,
        source_note_id: task.source_note_id || null,
        source_agent_id: task.source_agent_id || "user",
      }),
    });
    await refresh();
  }

  async function linkNote() {
    if (!draft.id || !linkTarget || linkTarget === draft.id) return;
    await api<Relation>("/api/relations", {
      method: "POST",
      body: JSON.stringify({
        from_type: "note",
        from_id: draft.id,
        to_type: "note",
        to_id: linkTarget,
        relation_type: "related",
        created_by_agent_id: "user",
        status: "active",
      }),
    });
    setLinkTarget("");
    await refresh();
  }

  return (
    <div className="notes-workspace">
      <section className="note-list-pane">
        <div className="pane-header">
          <div>
            <span>{scopeDescriptor(scope)}</span>
            <h1>{scope.label}</h1>
          </div>
          <button className="primary-button" type="button" onClick={newNote}>
            <Plus size={16} />
            New
          </button>
        </div>

        <div className="note-list">
          {notes.length ? (
            notes.map((note) => (
              <button
                className={note.id === draft.id ? "note-card active" : "note-card"}
                style={{ borderLeftColor: note.color }}
                type="button"
                key={note.id}
                onClick={() => setSelectedNoteId(note.id)}
              >
                <strong>{note.title}</strong>
                <span>
                  {note.category || "General"} {note.folder ? `/ ${note.folder}` : ""} /{" "}
                  {projectName(note.project_id, projects)}
                </span>
                <p>{note.excerpt || "No content yet."}</p>
              </button>
            ))
          ) : (
            <div className="empty-list">
              <FileText size={18} />
              <strong>No notes here yet</strong>
              <p>Create a note or use another folder/category from the sidebar.</p>
            </div>
          )}
        </div>
      </section>

      <section className="editor-surface">
        <div className="editor-toolbar">
          <label className="field-control">
            <span>Project</span>
            <select
              value={draft.project_id || selectedProject.id}
              onChange={(event) => editDraft({ project_id: event.target.value })}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-control">
            <span>Folder</span>
            <input
              list="folder-options"
              placeholder="Loose"
              value={draft.folder || ""}
              onChange={(event) => editDraft({ folder: event.target.value })}
            />
          </label>
          <label className="field-control">
            <span>Category</span>
            <input
              list="category-options"
              placeholder="General"
              value={draft.category || "General"}
              onChange={(event) => editDraft({ category: event.target.value })}
            />
          </label>
          <label className="field-control">
            <span>Type</span>
            <select
              value={draft.type || "Human Note"}
              onChange={(event) => editDraft({ type: event.target.value })}
            >
              {["Human Note", "Project Note", "Research", "Decision", "Meeting", "Task Source", "Agent Draft"].map(
                (type) => (
                  <option key={type}>{type}</option>
                ),
              )}
            </select>
          </label>
          <label className="field-control compact-field">
            <span>Status</span>
            <input
              className="status-input"
              value={draft.status || "draft"}
              onChange={(event) => editDraft({ status: event.target.value })}
            />
          </label>
          <div className="markdown-tools toolbar-command">
            <button className="icon-button" type="button" title={editorMode === "write" ? "Preview" : "Edit"} onClick={() => setEditorMode(editorMode === "write" ? "preview" : "write")}>
              {editorMode === "write" ? <Eye size={16} /> : <Pencil size={16} />}
            </button>
            <button className="icon-button" type="button" title="Insert image" onClick={() => imageInputRef.current?.click()}>
              <ImageIcon size={16} />
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={insertImage} />
          </div>
          <button className="secondary-button toolbar-command" type="button" onClick={() => setMode("map")}>
            <Network size={16} />
            Map
          </button>
          <datalist id="folder-options">
            {folders.map((folder) => (
              <option key={folder.id} value={folder.label} />
            ))}
          </datalist>
          <datalist id="category-options">
            {categories.map((category) => (
              <option key={category.id} value={category.label} />
            ))}
          </datalist>
        </div>

        <input
          className="title-input"
          placeholder="Untitled"
          value={draft.title || ""}
          onChange={(event) => editDraft({ title: event.target.value })}
        />

        {editorMode === "write" ? (
          <textarea
            className="note-body"
            placeholder="Write Markdown, paste an agent answer, or capture a meeting."
            value={draft.content || ""}
            onChange={(event) => editDraft({ content: event.target.value })}
          />
        ) : (
          <MarkdownPreview content={draft.content || ""} />
        )}

        <div className="editor-footer">
          <div className="note-metrics">
            <span>{estimateTokens(draft.content || "")} tokens</span>
            <span>{draft.folder?.trim() ? draft.folder : "Loose"}</span>
            <span>{draft.category || "General"}</span>
          </div>
          <div className="footer-actions">
            <div className="ai-actions" aria-label="Local AI note modes">
              {aiModes.map((item) => (
                <button
                  className="secondary-button ai-action"
                  type="button"
                  key={item.id}
                  title={item.goal}
                  onClick={() => runAiMode(item)}
                  disabled={Boolean(activeAiMode)}
                >
                  {activeAiMode === item.id ? <Loader2 size={15} /> : <Wand2 size={15} />}
                  {item.label}
                </button>
              ))}
            </div>
            <button className="primary-button" type="button" onClick={() => saveNote()} disabled={saving}>
              <Save size={16} />
              {saving ? "Saving" : "Save"}
            </button>
            <small style={{ alignSelf: "center", fontSize: 12, color: saveError ? "var(--warning)" : "var(--muted)" }}>
              {saveError ? saveError : saving ? "Guardando…" : dirty ? "Sin guardar" : draft.id ? "Guardado" : ""}
            </small>
          </div>
        </div>

        <div className="relation-strip">
          <div className="relation-list">
            <span>Linked notes</span>
            {relatedNotes.length ? (
              relatedNotes.map((note) => (
                <button type="button" key={note.id} onClick={() => openNoteInProject(note)}>
                  <Link size={13} />
                  {note.title}
                </button>
              ))
            ) : (
              <small>No links yet</small>
            )}
          </div>
          <div className="link-form">
            <select value={linkTarget} onChange={(event) => setLinkTarget(event.target.value)} disabled={!draft.id}>
              <option value="">Link another note</option>
              {allNotes
                .filter((note) => note.id !== draft.id)
                .map((note) => (
                  <option key={note.id} value={note.id}>
                    {note.title}
                  </option>
                ))}
            </select>
            <button className="secondary-button" type="button" onClick={linkNote} disabled={!linkTarget}>
              Link
            </button>
          </div>
        </div>
      </section>

      <aside className="task-pane">
        <div className="pane-header compact">
          <div>
            <span>{scope.type === "project" ? "Project tasks" : "Visible tasks"}</span>
            <h2>{tasks.filter((task) => task.status !== "implemented").length} open</h2>
          </div>
        </div>
        <div className="task-list">
          {tasks.length ? (
            tasks.map((task) => (
              <button className={`task-row ${task.status}`} type="button" key={task.id} onClick={() => cycleTask(task)}>
                {task.status === "implemented" ? <CheckCircle size={16} /> : <Circle size={16} />}
                <span>{task.title}</span>
              </button>
            ))
          ) : (
            <div className="empty-list small">
              <CheckCircle size={16} />
              <strong>No tasks</strong>
            </div>
          )}
        </div>
        <div className="task-add">
          <input
            placeholder="Add task"
            value={newTaskTitle}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addTask();
            }}
          />
          <button className="icon-button" type="button" onClick={addTask}>
            <Plus size={16} />
          </button>
        </div>
      </aside>
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="note-body markdown-preview">
      {content.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeMarkdownUrl}>
          {content}
        </ReactMarkdown>
      ) : (
        <p className="markdown-empty">No content yet.</p>
      )}
    </div>
  );
}

function MapWorkspace({
  scope,
  projects,
  notes,
  allNotes,
  tasks,
  relations,
  selectedNoteId,
  onSelectNote,
  onOpenNote,
}: {
  scope: LibraryScope;
  projects: Project[];
  notes: Note[];
  allNotes: Note[];
  tasks: Task[];
  relations: Relation[];
  selectedNoteId: string;
  onSelectNote: (noteId: string) => void;
  onOpenNote: (note: Note) => Promise<void>;
}) {
  const [vectorMap, setVectorMap] = useState<VectorMap | null>(null);
  const [vectorLoading, setVectorLoading] = useState(false);
  const graphNodes = useMemo(() => positionGraphNodes(vectorMap?.nodes ?? notes), [vectorMap, notes]);
  const graphNodeMap = useMemo(() => new Map(graphNodes.map((node) => [node.id, node])), [graphNodes]);
  const graphEdges = useMemo(
    () => (vectorMap?.edges ?? relationEdgesFromRows(relations)).filter((edge) => graphNodeMap.has(edge.from_id) && graphNodeMap.has(edge.to_id)),
    [vectorMap, relations, graphNodeMap],
  );
  const selectedNote =
    graphNodes.find((note) => note.id === selectedNoteId) ?? graphNodes[0] ?? allNotes.find((note) => note.id === selectedNoteId);
  const selectedConnections = selectedNote ? connectedNotes(selectedNote.id, allNotes, relations) : [];
  const selectedTasks = selectedNote
    ? tasks.filter((task) => task.source_note_id === selectedNote.id || relationTouches(relations, selectedNote.id, task.id))
    : [];
  const relatedVectorEdges = selectedNote
    ? graphEdges
        .filter((edge) => edge.from_id === selectedNote.id || edge.to_id === selectedNote.id)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
    : [];

  async function loadVectorMap(rebuild = false) {
    setVectorLoading(true);
    try {
      if (rebuild) {
        await api(`/api/vectors/rebuild${scope.type === "project" ? `?project_id=${encodeURIComponent(scope.id)}` : ""}`, {
          method: "POST",
        });
      }
      setVectorMap(await api<VectorMap>(vectorMapPathForScope(scope)));
    } finally {
      setVectorLoading(false);
    }
  }

  useEffect(() => {
    loadVectorMap().catch(() => setVectorMap(null));
  }, [scope.type, scope.id, notes.length]);

  return (
    <div className="map-workspace">
      <section className="map-header">
        <div>
          <span>Memory map</span>
          <h1>{scope.label}</h1>
          <p>Notes are grouped by topic and linked by manual relations plus local semantic proximity.</p>
        </div>
        <div className="map-stats">
          <strong>{graphNodes.length}</strong>
          <span>notes</span>
          <strong>{vectorMap?.dimensions ?? 96}</strong>
          <span>dims</span>
          <button className="secondary-button map-refresh" type="button" onClick={() => loadVectorMap(true)} disabled={vectorLoading}>
            {vectorLoading ? <Loader2 size={15} /> : <RefreshCw size={15} />}
            Revectorize
          </button>
        </div>
      </section>

      <div className="map-layout">
        <section className="map-canvas">
          {graphNodes.length ? (
            <ThreeVectorScene nodes={graphNodes} edges={graphEdges} selectedNoteId={selectedNote?.id ?? ""} onSelectNote={onSelectNote} />
          ) : (
            <div className="empty-map">
                <FileText size={18} />
                <strong>No notes to map</strong>
                <p>Create notes in this scope and the 3D memory map will appear here.</p>
              </div>
          )}
          <div className="graph-legend">
            <span>
              <i className="legend-dot relation" /> manual
            </span>
            <span>
              <i className="legend-dot semantic" /> semantic
            </span>
            <span>{vectorMap?.model ?? "local-hash-v1"}</span>
          </div>
        </section>

        <aside className="map-inspector">
          <div className="inspector-block">
            <span>Selected note</span>
            {selectedNote ? (
              <>
                <h2>{selectedNote.title}</h2>
                <p>{trimText(selectedNote.excerpt || "", 220)}</p>
                <div className="meta-pills">
                  <small>{selectedNote.category || "General"}</small>
                  <small>{selectedNote.folder || "Loose"}</small>
                  <small>{projectName(selectedNote.project_id, projects)}</small>
                  <small>{selectedNote.status}</small>
                  {"z" in selectedNote ? <small>z {selectedNote.z.toFixed(2)}</small> : null}
                </div>
                <button className="primary-button open-note-button" type="button" onClick={() => onOpenNote(selectedNote as Note)}>
                  <FileText size={15} />
                  Open note
                </button>
              </>
            ) : (
              <p>No note selected.</p>
            )}
          </div>

          <div className="inspector-block">
            <span>Vector neighborhood</span>
            <div className="connection-list">
              {relatedVectorEdges.length ? (
                relatedVectorEdges.map((edge) => {
                  const otherId = edge.from_id === selectedNote?.id ? edge.to_id : edge.from_id;
                  const other = graphNodeMap.get(otherId);
                  if (!other) return null;
                  return (
                    <button type="button" key={edge.id} onClick={() => onSelectNote(other.id)}>
                      <Link size={13} />
                      <span>{other.title}</span>
                      <small>{edge.source === "relation" ? edge.relation_type : edge.score.toFixed(2)}</small>
                    </button>
                  );
                })
              ) : selectedConnections.length ? (
                selectedConnections.map((note) => (
                  <button type="button" key={note.id} onClick={() => onSelectNote(note.id)}>
                    <Link size={13} />
                    <span>{note.title}</span>
                  </button>
                ))
              ) : (
                <p>No linked notes yet.</p>
              )}
            </div>
          </div>

          <div className="inspector-block">
            <span>Tasks from note</span>
            <div className="connection-list">
              {selectedTasks.length ? (
                selectedTasks.slice(0, 6).map((task) => (
                  <div className="mini-task" key={task.id}>
                    <Circle size={13} />
                    <span>{task.title}</span>
                  </div>
                ))
              ) : (
                <p>No tasks linked to this note.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ThreeVectorScene({
  nodes,
  edges,
  selectedNoteId,
  onSelectNote,
}: {
  nodes: GraphNode[];
  edges: VectorEdge[];
  selectedNoteId: string;
  onSelectNote: (noteId: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const layout = useMemo(() => buildThreeNodePositions(nodes, edges), [nodes, edges]);
  const featuredNodes = useMemo(() => {
    const selectedNode = nodes.find((node) => node.id === selectedNoteId);
    return selectedNode ? [selectedNode] : [];
  }, [nodes, selectedNoteId]);

  useEffect(() => {
    const host = hostRef.current;
    const mount = canvasMountRef.current;
    if (!host || !mount || !nodes.length) return;
    const hostElement: HTMLDivElement = host;
    const mountElement: HTMLDivElement = mount;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080b12, 0.014);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1200);
    camera.position.set(0, 8, 42);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setClearColor(0x080b12, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "three-map-canvas";
    renderer.domElement.setAttribute("aria-label", "3D note memory map");
    renderer.domElement.tabIndex = 0;
    mountElement.appendChild(renderer.domElement);

    const root = new THREE.Group();
    root.rotation.x = -0.34;
    root.rotation.y = 0.52;
    scene.add(root);

    const { positions, connectionCounts, clusters } = layout;
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const glowTexture = createGlowTexture();
    const sphereGeometry = new THREE.SphereGeometry(0.42, 24, 14);
    const pulseGeometry = new THREE.SphereGeometry(0.08, 12, 8);
    const ringGeometry = new THREE.TorusGeometry(0.78, 0.014, 8, 80);
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>([sphereGeometry, pulseGeometry, ringGeometry]);
    const clickable: THREE.Object3D[] = [];
    const meshById = new Map<string, THREE.Mesh>();
    const selectedRings: THREE.Mesh[] = [];

    const ambient = new THREE.AmbientLight(0xc9d7ff, 0.72);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(12, 18, 16);
    const sideLight = new THREE.PointLight(0x63e6be, 3.6, 80);
    sideLight.position.set(-16, 10, 20);
    const rimLight = new THREE.PointLight(0x7aa7ff, 2.8, 90);
    rimLight.position.set(20, 4, -22);
    scene.add(ambient, keyLight, sideLight, rimLight);

    const grid = new THREE.GridHelper(58, 12, 0x273144, 0x111722);
    grid.position.y = -9.8;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.2;
    root.add(grid);

    const clusterDiscs = clusters.map((cluster) => {
      const color = makeThreeColor(cluster.color);
      const fillMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.045,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ringMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const fillGeometry = new THREE.CircleGeometry(cluster.radius, 80);
      const ringGeometryForCluster = new THREE.RingGeometry(cluster.radius * 0.98, cluster.radius * 1.02, 96);
      materials.add(fillMaterial);
      materials.add(ringMaterial);
      geometries.add(fillGeometry);
      geometries.add(ringGeometryForCluster);
      const disc = new THREE.Mesh(fillGeometry, fillMaterial);
      const ring = new THREE.Mesh(ringGeometryForCluster, ringMaterial);
      disc.position.set(cluster.position.x, -9.55, cluster.position.z);
      ring.position.copy(disc.position);
      disc.rotation.x = -Math.PI / 2;
      ring.rotation.x = Math.PI / 2;
      root.add(disc);
      root.add(ring);
      return ring;
    });

    const relationLinePositions: number[] = [];
    const semanticLinePositions: number[] = [];
    const visibleEdges = chooseVisibleEdges(edges, selectedNoteId, nodes.length);
    visibleEdges.forEach((edge) => {
      const from = positions.get(edge.from_id);
      const to = positions.get(edge.to_id);
      if (!from || !to) return;
      const target = edge.source === "relation" ? relationLinePositions : semanticLinePositions;
      target.push(from.x, from.y, from.z, to.x, to.y, to.z);
    });

    const relationLineMaterial = new THREE.LineBasicMaterial({
      color: 0x78f0d4,
      transparent: true,
      opacity: 0.5,
    });
    const semanticLineMaterial = new THREE.LineBasicMaterial({
      color: 0x8ab4ff,
      transparent: true,
      opacity: 0.18,
    });
    materials.add(relationLineMaterial);
    materials.add(semanticLineMaterial);
    addLineSegments(root, relationLinePositions, relationLineMaterial, geometries);
    addLineSegments(root, semanticLinePositions, semanticLineMaterial, geometries);

    nodes.forEach((node) => {
      const position = positions.get(node.id);
      if (!position) return;
      const selected = node.id === selectedNoteId;
      const color = makeThreeColor(node.color);
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.26),
        emissiveIntensity: selected ? 0.85 : 0.42,
        metalness: 0.08,
        roughness: 0.72,
      });
      materials.add(material);

      const mesh = new THREE.Mesh(sphereGeometry, material);
      const connections = connectionCounts.get(node.id) ?? 0;
      const baseScale = Math.min(1.45, 0.74 + node.linkCount * 0.045 + connections * 0.025);
      mesh.position.copy(position);
      mesh.scale.setScalar(selected ? baseScale * 1.32 : baseScale);
      mesh.userData = { baseScale, noteId: node.id };
      clickable.push(mesh);
      meshById.set(node.id, mesh);
      root.add(mesh);

      if (selected) {
        const glowMaterial = new THREE.SpriteMaterial({
          map: glowTexture,
          color,
          transparent: true,
          opacity: 0.44,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        materials.add(glowMaterial);
        const glow = new THREE.Sprite(glowMaterial);
        glow.position.copy(position);
        glow.scale.setScalar(5.4 * baseScale);
        root.add(glow);
      }

      if (selected) {
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: 0xf6d365,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        });
        materials.add(ringMaterial);
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.copy(position);
        ring.scale.setScalar(baseScale * 1.56);
        ring.lookAt(camera.position);
        ring.userData = { baseScale };
        selectedRings.push(ring);
        root.add(ring);
      }
    });

    const animatedEdges = visibleEdges
      .slice()
      .sort((a, b) => Number(b.source === "relation") - Number(a.source === "relation") || b.score - a.score)
      .slice(0, 22);
    const pulses: Array<{ mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; offset: number; speed: number }> = [];
    animatedEdges.forEach((edge, index) => {
      const from = positions.get(edge.from_id);
      const to = positions.get(edge.to_id);
      if (!from || !to) return;
      const material = new THREE.MeshBasicMaterial({
        color: edge.source === "relation" ? 0x7cf5d9 : 0x9dbdff,
        transparent: true,
        opacity: edge.source === "relation" ? 0.52 : 0.28,
        depthWrite: false,
      });
      materials.add(material);
      const pulse = new THREE.Mesh(pulseGeometry, material);
      root.add(pulse);
      pulses.push({
        mesh: pulse,
        from: from.clone(),
        to: to.clone(),
        offset: (index * 0.137) % 1,
        speed: edge.source === "relation" ? 0.18 : 0.12,
      });
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let targetRotationX = -0.34;
    let targetRotationY = 0.52;
    let targetCameraZ = 42;
    let isDragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let animationTimer = 0;
    let frame = 0;
    const startTime = window.performance.now();

    function resize() {
      const width = Math.max(1, hostElement.clientWidth);
      const height = Math.max(1, hostElement.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function noteIdAtPoint(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(clickable, false)[0];
      const noteId = hit?.object.userData.noteId;
      if (typeof noteId === "string") return noteId;

      root.updateMatrixWorld();
      camera.updateMatrixWorld();
      let nearestNoteId = "";
      let nearestDistance = Number.POSITIVE_INFINITY;
      positions.forEach((position, projectedNoteId) => {
        const projected = position.clone().applyMatrix4(root.matrixWorld).project(camera);
        if (projected.z < -1 || projected.z > 1) return;
        const x = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
        const y = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
        const radius = 18 + Math.min(14, (connectionCounts.get(projectedNoteId) || 0) * 2.2);
        const distance = Math.hypot(clientX - x, clientY - y);
        if (distance <= radius && distance < nearestDistance) {
          nearestDistance = distance;
          nearestNoteId = projectedNoteId;
        }
      });
      return nearestNoteId;
    }

    function pickNode(clientX: number, clientY: number) {
      const noteId = noteIdAtPoint(clientX, clientY);
      if (noteId) onSelectNote(noteId);
    }

    function hideHoverLabel() {
      const label = hostElement.querySelector<HTMLElement>(".three-hover-label");
      if (label) label.style.opacity = "0";
      renderer.domElement.style.cursor = "grab";
    }

    function showHoverLabel(event: PointerEvent) {
      const noteId = noteIdAtPoint(event.clientX, event.clientY);
      const note = noteId ? nodeById.get(noteId) : null;
      const label = hostElement.querySelector<HTMLElement>(".three-hover-label");
      if (!label || !note) {
        hideHoverLabel();
        return;
      }
      const rect = hostElement.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left + 14, 70, Math.max(70, rect.width - 70));
      const y = clamp(event.clientY - rect.top - 16, 28, Math.max(28, rect.height - 28));
      label.textContent = note.title;
      label.style.opacity = "1";
      label.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
      renderer.domElement.style.cursor = "pointer";
    }

    function onPointerDown(event: PointerEvent) {
      isDragging = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (!isDragging) {
        showHoverLabel(event);
        return;
      }
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      targetRotationY += dx * 0.006;
      targetRotationX = clamp(targetRotationX + dy * 0.0045, -1.0, 0.28);
      lastX = event.clientX;
      lastY = event.clientY;
    }

    function onPointerUp(event: PointerEvent) {
      if (!moved) pickNode(event.clientX, event.clientY);
      isDragging = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
    }

    function onPointerCancel() {
      isDragging = false;
      hideHoverLabel();
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      targetCameraZ = clamp(targetCameraZ + event.deltaY * 0.025, 24, 66);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(hostElement);
    resize();

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    renderer.domElement.addEventListener("pointerleave", hideHoverLabel);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    function updateLabels() {
      const labels = hostElement.querySelectorAll<HTMLElement>(".three-node-label");
      const clusterLabels = hostElement.querySelectorAll<HTMLElement>(".three-cluster-label");
      root.updateMatrixWorld();
      camera.updateMatrixWorld();
      labels.forEach((label) => {
        const noteId = label.dataset.nodeId;
        const position = noteId ? positions.get(noteId) : null;
        if (!position) {
          label.style.opacity = "0";
          return;
        }
        const projected = position.clone().applyMatrix4(root.matrixWorld).project(camera);
        const visible = projected.z > -1 && projected.z < 1;
        const hostWidth = hostElement.clientWidth;
        const hostHeight = hostElement.clientHeight;
        const x = clamp((projected.x * 0.5 + 0.5) * hostWidth, 92, Math.max(92, hostWidth - 92));
        const y = clamp((-projected.y * 0.5 + 0.5) * hostHeight, 42, Math.max(42, hostHeight - 42));
        const isSelected = noteId === selectedNoteId;
        const depthOpacity = clamp(1.12 - projected.z, 0.18, 1);
        label.style.opacity = visible ? String(isSelected ? 1 : depthOpacity * 0.88) : "0";
        label.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        label.style.zIndex = String(Math.round((1 - projected.z) * 1000));
      });
      clusterLabels.forEach((label) => {
        const cluster = clusters.find((item) => item.id === label.dataset.clusterId);
        const position = cluster?.labelPosition;
        if (!position) {
          label.style.opacity = "0";
          return;
        }
        const projected = position.clone().applyMatrix4(root.matrixWorld).project(camera);
        const visible = projected.z > -1 && projected.z < 1;
        const hostWidth = hostElement.clientWidth;
        const hostHeight = hostElement.clientHeight;
        const x = clamp((projected.x * 0.5 + 0.5) * hostWidth, 72, Math.max(72, hostWidth - 72));
        const y = clamp((-projected.y * 0.5 + 0.5) * hostHeight, 38, Math.max(38, hostHeight - 38));
        label.style.opacity = visible ? "0.82" : "0";
        label.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        label.style.zIndex = String(Math.round((1 - projected.z) * 700));
      });
    }

    function animate() {
      frame += 1;
      const elapsed = (window.performance.now() - startTime) / 1000;
      if (!isDragging) targetRotationY += 0.0015;
      root.rotation.x += (targetRotationX - root.rotation.x) * 0.08;
      root.rotation.y += (targetRotationY - root.rotation.y) * 0.08;
      camera.position.z += (targetCameraZ - camera.position.z) * 0.08;
      camera.lookAt(0, 0, 0);

      relationLineMaterial.opacity = 0.42 + Math.sin(elapsed * 1.35) * 0.05;
      semanticLineMaterial.opacity = 0.14 + Math.sin(elapsed * 0.9) * 0.035;
      sideLight.intensity = 2.8 + Math.sin(elapsed * 1.2) * 0.35;
      rimLight.intensity = 2.5 + Math.cos(elapsed * 0.9) * 0.32;

      clusterDiscs.forEach((ring, index) => {
        ring.rotation.z += 0.00035 + index * 0.00004;
      });

      meshById.forEach((mesh, noteId) => {
        const baseScale = Number(mesh.userData.baseScale) || 1;
        const selected = noteId === selectedNoteId;
        const pulse = Math.sin(elapsed * (selected ? 2.4 : 1.4) + baseScale * 2) * (selected ? 0.055 : 0.018);
        mesh.scale.setScalar(baseScale * (selected ? 1.32 : 1) * (1 + pulse));
      });

      selectedRings.forEach((ring) => {
        const baseScale = Number(ring.userData.baseScale) || 1;
        ring.lookAt(camera.position);
        ring.scale.setScalar(baseScale * (1.58 + Math.sin(elapsed * 2.8) * 0.08));
      });

      pulses.forEach((pulse) => {
        const t = (elapsed * pulse.speed + pulse.offset) % 1;
        pulse.mesh.position.lerpVectors(pulse.from, pulse.to, t);
        const material = pulse.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = 0.2 + Math.sin(t * Math.PI) * 0.62;
      });

      updateLabels();
      renderer.render(scene, camera);
      hostElement.dataset.frame = String(frame);
      hostElement.dataset.rotation = root.rotation.y.toFixed(4);
      animationTimer = window.setTimeout(animate, 33);
    }

    animate();

    return () => {
      window.clearTimeout(animationTimer);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener("pointerleave", hideHoverLabel);
      renderer.domElement.removeEventListener("wheel", onWheel);
      if (renderer.domElement.parentElement === mountElement) mountElement.removeChild(renderer.domElement);
      scene.traverse((object) => {
        const maybeDisposable = object as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
        if (maybeDisposable.geometry) geometries.add(maybeDisposable.geometry);
        if (Array.isArray(maybeDisposable.material)) {
          maybeDisposable.material.forEach((material) => materials.add(material));
        } else if (maybeDisposable.material) {
          materials.add(maybeDisposable.material);
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      glowTexture.dispose();
      renderer.dispose();
    };
  }, [nodes, edges, layout, selectedNoteId, onSelectNote]);

  return (
    <div className="three-map-host" ref={hostRef}>
      <div className="three-canvas-mount" ref={canvasMountRef} />
      <div className="three-label-layer">
        <div className="three-hover-label" />
        {layout.clusters.map((cluster) => (
          <div className="three-cluster-label" data-cluster-id={cluster.id} key={cluster.id}>
            <span>{cluster.label}</span>
            <small>{cluster.count}</small>
          </div>
        ))}
        {featuredNodes.map((node) => (
          <button
            className={node.id === selectedNoteId ? "three-node-label selected" : "three-node-label"}
            data-node-id={node.id}
            key={node.id}
            onClick={() => onSelectNote(node.id)}
            type="button"
          >
            <span style={{ backgroundColor: node.color }} />
            {trimText(node.title, 28)}
          </button>
        ))}
      </div>
      <div className="three-map-count">
        <strong>{nodes.length}</strong>
        <span>{layout.clusters.length} grupos</span>
      </div>
    </div>
  );
}

function LLMWorkspace({ selectedProject, modelHealth }: { selectedProject: Project; modelHealth: ModelHealth }) {
  const [copied, setCopied] = useState("");
  const prompt = `Use Neuronotes 2.0 as the shared brain.
Project id: ${selectedProject.id}

Rules:
- Search before making project claims.
- Read notes with project, folder, category, source and status.
- Create or update notes when you produce durable knowledge.
- Link related notes.
- Create tasks from actionable work.
- Keep private data local unless the user exports it.`;
  const rows = [
    ["MCP", "npm run mcp"],
    ["Search", "GET /api/search?query=..."],
    ["All notes", "GET /api/notes"],
    ["Folder", "GET /api/notes?folder=..."],
    ["Category", "GET /api/notes?category=..."],
    ["Create note", "POST /api/notes"],
    ["Improve note", "POST /api/notes/{note_id}/improve"],
    ["Vector search", "GET /api/vectors/search?query=..."],
    ["Vector map", "GET /api/vectors/map"],
    ["Rebuild vectors", "POST /api/vectors/rebuild"],
    ["Context", "POST /api/context/compile"],
  ];

  async function copy(value: string) {
    await navigator.clipboard?.writeText(value);
    setCopied(value);
    window.setTimeout(() => setCopied(""), 1200);
  }

  return (
    <div className="llm-workspace">
      <section className="llm-header">
        <span>Agent-neutral access</span>
        <h1>One brain for any LLM</h1>
        <p>Codex, Claude, Qwen, ChatGPT or another client can read, write, link and classify shared memory.</p>
      </section>
      <div className="llm-grid">
        <section className="llm-panel">
          <h2>Connect</h2>
          {rows.map(([label, value]) => (
            <button className="copy-row" type="button" key={label} onClick={() => copy(value)}>
              <span>{label}</span>
              <code>{value}</code>
              {copied === value ? <Check size={16} /> : <Copy size={16} />}
            </button>
          ))}
        </section>
        <section className="llm-panel">
          <h2>Agent prompt</h2>
          <pre>{prompt}</pre>
        </section>
        <section className="llm-panel status-panel">
          <h2>Local model</h2>
          <AIBadge working={false} modelHealth={modelHealth} />
          <p>{modelHealth.message}</p>
        </section>
      </div>
    </div>
  );
}

function notesPathForScope(scope: LibraryScope) {
  if (scope.type === "project") return `/api/notes?project_id=${encodeURIComponent(scope.id)}`;
  if (scope.type === "folder") return `/api/notes?folder=${encodeURIComponent(scope.id)}`;
  if (scope.type === "category") return `/api/notes?category=${encodeURIComponent(scope.id)}`;
  if (scope.type === "loose") return "/api/notes?folder=";
  return "/api/notes";
}

function vectorMapPathForScope(scope: LibraryScope) {
  if (scope.type === "project") return `/api/vectors/map?project_id=${encodeURIComponent(scope.id)}`;
  if (scope.type === "folder") return `/api/vectors/map?folder=${encodeURIComponent(scope.id)}`;
  if (scope.type === "category") return `/api/vectors/map?category=${encodeURIComponent(scope.id)}`;
  if (scope.type === "loose") return "/api/vectors/map?folder=";
  return "/api/vectors/map";
}

function projectScope(project: Project): LibraryScope {
  return { type: "project", id: project.id, label: project.name };
}

function buildCountItems(notes: Note[], getter: (note: Note) => string | undefined) {
  const counts = new Map<string, number>();
  notes.forEach((note) => {
    const label = getter(note)?.trim();
    if (!label) return;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, count]) => ({ id: label, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildThreeNodePositions(nodes: GraphNode[], edges: VectorEdge[]) {
  const connectionCounts = new Map<string, number>();
  edges.forEach((edge) => {
    connectionCounts.set(edge.from_id, (connectionCounts.get(edge.from_id) ?? 0) + 1);
    connectionCounts.set(edge.to_id, (connectionCounts.get(edge.to_id) ?? 0) + 1);
  });

  const groups = new Map<string, GraphNode[]>();
  nodes.forEach((node) => {
    const id = clusterIdForNode(node);
    groups.set(id, [...(groups.get(id) ?? []), node]);
  });

  const orderedGroups = Array.from(groups.entries()).sort(
    ([leftId, leftNodes], [rightId, rightNodes]) => rightNodes.length - leftNodes.length || clusterLabelFromId(leftId).localeCompare(clusterLabelFromId(rightId)),
  );
  const positions = new Map<string, THREE.Vector3>();
  const clusters: ThreeCluster[] = [];
  const groupCount = Math.max(orderedGroups.length, 1);
  const centerRing = clamp(groupCount * 2.35, 9.5, 25);

  orderedGroups.forEach(([clusterId, groupNodes], groupIndex) => {
    const groupAngle = groupCount === 1 ? 0 : (Math.PI * 2 * groupIndex) / groupCount - Math.PI / 2;
    const centerRadius = groupCount === 1 ? 0 : centerRing;
    const center = new THREE.Vector3(Math.cos(groupAngle) * centerRadius, 0, Math.sin(groupAngle) * centerRadius);
    const sortedNodes = groupNodes.slice().sort((a, b) => b.linkCount - a.linkCount || a.title.localeCompare(b.title));
    const clusterRadius = clamp(2.7 + Math.sqrt(groupNodes.length) * 0.6, 3.7, 8.2);
    const clusterColor = sortedNodes[0]?.color ?? "#6ee7d8";
    clusters.push({
      id: clusterId,
      label: clusterLabelFromId(clusterId),
      count: groupNodes.length,
      radius: clusterRadius + 1.0,
      color: clusterColor,
      position: center.clone(),
      labelPosition: new THREE.Vector3(center.x, 6.4, center.z),
    });

    sortedNodes.forEach((node, index) => {
      const hasVectorPosition = "x" in node && typeof node.x === "number";
      const localAngle = (Math.PI * 2 * index) / Math.max(sortedNodes.length, 1) + hashUnit(`${node.id}-angle`) * 0.52;
      const localRadius = Math.sqrt(index + 1) / Math.sqrt(sortedNodes.length + 1) * clusterRadius;
      const vectorX = hasVectorPosition ? node.x : hashUnit(`${node.id}-x`) - 0.5;
      const vectorY = hasVectorPosition ? node.y : hashUnit(`${node.id}-y`) - 0.5;
      const vectorZ = hasVectorPosition ? node.z : hashUnit(`${node.id}-z`) - 0.5;
      const connections = connectionCounts.get(node.id) ?? 0;
      const x = center.x + Math.cos(localAngle) * localRadius + vectorX * 1.35;
      const z = center.z + Math.sin(localAngle) * localRadius + vectorY * 1.35;
      const y = clamp(vectorZ * 5.5 + Math.min(2.6, connections * 0.08), -5.8, 6.8);
      positions.set(node.id, new THREE.Vector3(x, y, z));
    });
  });

  return { positions, connectionCounts, clusters };
}

function clusterIdForNode(node: GraphNode) {
  const label = (node.category || node.folder || "General").trim() || "General";
  return (
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "general"
  );
}

function clusterLabelFromId(id: string) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "General";
}

function chooseVisibleEdges(edges: VectorEdge[], selectedNoteId: string, nodeCount: number) {
  const limit = Math.max(24, Math.min(edges.length, Math.round(nodeCount * 0.72)));
  const selectedEdges = edges.filter((edge) => edge.from_id === selectedNoteId || edge.to_id === selectedNoteId);
  const relationEdges = edges.filter((edge) => edge.source === "relation");
  const semanticEdges = edges.filter((edge) => edge.source === "vector").sort((a, b) => b.score - a.score);
  const edgeMap = new Map<string, VectorEdge>();

  [...selectedEdges, ...relationEdges, ...semanticEdges].forEach((edge) => {
    if (edgeMap.size >= limit && !selectedEdges.includes(edge)) return;
    const key = [edge.from_id, edge.to_id].sort().join("::");
    if (!edgeMap.has(key)) edgeMap.set(key, edge);
  });

  return Array.from(edgeMap.values());
}

function makeThreeColor(value: string | undefined) {
  const color = new THREE.Color();
  try {
    color.set(value || "#6ee7d8");
  } catch {
    color.set("#6ee7d8");
  }
  return color;
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 48);
    gradient.addColorStop(0, "rgba(255,255,255,0.85)");
    gradient.addColorStop(0.34, "rgba(255,255,255,0.28)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  return new THREE.CanvasTexture(canvas);
}

function addLineSegments(root: THREE.Group, values: number[], material: THREE.Material, geometries: Set<THREE.BufferGeometry>) {
  if (!values.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
  geometries.add(geometry);
  root.add(new THREE.LineSegments(geometry, material));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeMarkdownUrl(url: string) {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return "";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function relationEdgesFromRows(relations: Relation[]): VectorEdge[] {
  return relations
    .filter((relation) => relation.from_type === "note" && relation.to_type === "note")
    .map((relation) => ({
      id: relation.id,
      from_id: relation.from_id,
      to_id: relation.to_id,
      relation_type: relation.relation_type,
      score: 1,
      source: "relation",
    }));
}

function positionGraphNodes(items: Array<VectorNode | Note>): GraphNode[] {
  const values = items.map((item, index) => {
    const hasVectorPosition = "x" in item && typeof item.x === "number";
    const fallbackAngle = (Math.PI * 2 * index) / Math.max(items.length, 1);
    const rawX = hasVectorPosition ? item.x : Math.cos(fallbackAngle) * hashUnit(item.id);
    const rawY = hasVectorPosition ? item.y : Math.sin(fallbackAngle) * hashUnit(item.title);
    return { item, rawX, rawY };
  });
  const xs = values.map((value) => value.rawX);
  const ys = values.map((value) => value.rawY);
  const minX = Math.min(...xs, -1);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, -1);
  const maxY = Math.max(...ys, 1);
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;
  const linkCounts = new Map<string, number>();
  items.forEach((item) => {
    const sameCategory = items.filter((candidate) => candidate.category === item.category).length;
    linkCounts.set(item.id, sameCategory > 1 ? Math.min(5, sameCategory - 1) : 0);
  });
  return values.map(({ item, rawX, rawY }, index) => {
    const jitter = (hashUnit(`${item.id}-${index}`) - 0.5) * 18;
    return {
      ...item,
      graphX: 70 + ((rawX - minX) / xRange) * 860 + jitter,
      graphY: 60 + ((rawY - minY) / yRange) * 530 - jitter,
      linkCount: linkCounts.get(item.id) ?? 0,
    };
  });
}

function hashUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function newDraftForScope(scope: LibraryScope, selectedProject: Project): Partial<Note> {
  return {
    ...emptyDraft,
    project_id: scope.type === "project" ? scope.id : selectedProject.id,
    folder: scope.type === "folder" ? scope.id : "",
    category: scope.type === "category" ? scope.id : "General",
  };
}

function connectedNotes(noteId: string, notes: Note[], relations: Relation[]) {
  const ids = new Set<string>();
  relations.forEach((relation) => {
    if (relation.from_type !== "note" || relation.to_type !== "note") return;
    if (relation.from_id === noteId) ids.add(relation.to_id);
    if (relation.to_id === noteId) ids.add(relation.from_id);
  });
  return notes.filter((note) => ids.has(note.id));
}

function relationTouches(relations: Relation[], fromId: string, toId: string) {
  return relations.some(
    (relation) =>
      ((relation.from_id === fromId && relation.to_id === toId) ||
        (relation.from_id === toId && relation.to_id === fromId)) &&
      relation.status === "active",
  );
}

function projectName(projectId: string, projects: Project[]) {
  return projects.find((project) => project.id === projectId)?.name ?? projectId;
}

function scopeDescriptor(scope: LibraryScope) {
  if (scope.type === "project") return "Project";
  if (scope.type === "folder") return "Folder";
  if (scope.type === "category") return "Category";
  if (scope.type === "loose") return "Loose notes";
  return "Library";
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.35));
}

function trimText(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export default App;
