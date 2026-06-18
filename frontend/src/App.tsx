import { useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";
import { defaultScope, fallbackDashboard, fallbackProject } from "./lib/constants";
import { buildCountItems, notesPathForScope, projectScope } from "./lib/helpers";
import type {
  Dashboard,
  LibraryScope,
  ModelHealth,
  Note,
  Relation,
  SearchResult,
  Task,
  ThemeMode,
  ViewMode,
} from "./types";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { Topbar } from "./components/Topbar";
import { NotesWorkspace } from "./components/NotesWorkspace";
import { MapWorkspace } from "./components/MapWorkspace";
import { LLMWorkspace } from "./components/LLMWorkspace";

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

export default App;
