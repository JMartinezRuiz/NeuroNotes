import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "./lib/api";
import { defaultScope, fallbackDashboard, fallbackProject } from "./lib/constants";
import { buildCountItems, projectScope } from "./lib/helpers";
import { useModelHealth, useWorkspaceData } from "./hooks/useWorkspaceData";
import type {
  LibraryScope,
  ModelHealth,
  Note,
  ScopeType,
  SearchResult,
  ThemeMode,
  ViewMode,
} from "./types";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { Topbar } from "./components/Topbar";
import { NotesWorkspace } from "./components/NotesWorkspace";
import { LLMWorkspace } from "./components/LLMWorkspace";

// Three.js is heavy (~600 kB); load the Map view (and three) on demand so it
// stays out of the initial bundle.
const MapWorkspace = lazy(() =>
  import("./components/MapWorkspace").then((module) => ({ default: module.MapWorkspace })),
);

const FALLBACK_HEALTH: ModelHealth = {
  online: false,
  model: "qwen3:4b",
  base_url: "http://localhost:11434",
  message: "Modelo local no comprobado.",
};

function parseScopeParam(raw: string | null): LibraryScope {
  if (!raw) return defaultScope;
  const idx = raw.indexOf(":");
  const type = (idx >= 0 ? raw.slice(0, idx) : raw) as ScopeType;
  const id = idx >= 0 ? raw.slice(idx + 1) : "";
  switch (type) {
    case "all":
      return { type: "all", id: "all", label: "All notes" };
    case "loose":
      return { type: "loose", id: "loose", label: "Loose notes" };
    case "project":
      return { type: "project", id: id || fallbackProject.id, label: id || fallbackProject.name };
    case "folder":
      return { type: "folder", id, label: id };
    case "category":
      return { type: "category", id, label: id };
    default:
      return defaultScope;
  }
}

function App() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = window.localStorage.getItem("neuronotes-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [mode, setMode] = useState<ViewMode>(() => {
    const value = searchParams.get("mode");
    return value === "map" || value === "llm" ? value : "notes";
  });
  const [scope, setScope] = useState<LibraryScope>(() => parseScopeParam(searchParams.get("scope")));
  const [selectedProjectId, setSelectedProjectId] = useState(
    scope.type === "project" ? scope.id : fallbackProject.id,
  );
  const [selectedNoteId, setSelectedNoteId] = useState(() => searchParams.get("note") ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [aiWorking, setAiWorking] = useState(false);

  const workspace = useWorkspaceData(scope, selectedProjectId);
  const dashboard = workspace.data?.dashboard ?? fallbackDashboard;
  const notes = workspace.data?.notes ?? [];
  const allNotes = workspace.data?.allNotes ?? [];
  const tasks = workspace.data?.tasks ?? [];
  const relations = workspace.data?.relations ?? [];

  const healthQuery = useModelHealth();
  const modelHealth: ModelHealth = healthQuery.data ?? {
    ...FALLBACK_HEALTH,
    message: healthQuery.isError
      ? "Qwen no responde; notas, tareas y mapa siguen activos."
      : FALLBACK_HEALTH.message,
  };

  const selectedProject =
    dashboard.projects.find((project) => project.id === selectedProjectId) ?? dashboard.project;
  const folders = useMemo(() => buildCountItems(allNotes, (note) => note.folder), [allNotes]);
  const categories = useMemo(
    () => buildCountItems(allNotes, (note) => note.category || "General"),
    [allNotes],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("neuronotes-theme", theme);
  }, [theme]);

  // Keep the URL in sync with navigation state so deep links and reload restore
  // the same view (replace = no history spam from derived note reconciliation).
  useEffect(() => {
    const next = new URLSearchParams();
    next.set("mode", mode);
    next.set("scope", `${scope.type}:${scope.id}`);
    if (selectedNoteId) next.set("note", selectedNoteId);
    setSearchParams(next, { replace: true });
  }, [mode, scope.type, scope.id, selectedNoteId, setSearchParams]);

  // Track the active project context from the fetched data.
  useEffect(() => {
    const data = workspace.data;
    if (!data) return;
    setSelectedProjectId((prev) =>
      scope.type === "project" ? data.dashboard.project.id : data.notes[0]?.project_id ?? prev,
    );
  }, [workspace.data, scope.type]);

  // Keep a valid note selected within the current scope.
  useEffect(() => {
    if (!notes.length) {
      if (selectedNoteId) setSelectedNoteId("");
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

  function refresh(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: ["workspace"] });
  }

  async function chooseScope(nextScope: LibraryScope) {
    setScope(nextScope);
    setSelectedNoteId("");
    if (nextScope.type === "project") {
      setSelectedProjectId(nextScope.id);
    }
    setMode("notes");
  }

  async function openNoteInProject(note: Note) {
    const project = dashboard.projects.find((item) => item.id === note.project_id);
    const nextScope = projectScope(
      project ?? { ...fallbackProject, id: note.project_id, name: note.project_id },
    );
    setScope(nextScope);
    setSelectedProjectId(nextScope.id);
    setSelectedNoteId(note.id);
    setMode("notes");
  }

  async function openSearchResult(result: SearchResult) {
    if (result.project_id) {
      const project = dashboard.projects.find((item) => item.id === result.project_id);
      const nextScope = projectScope(
        project ?? { ...fallbackProject, id: result.project_id, name: result.project_name },
      );
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
            refresh={refresh}
            openNoteInProject={openNoteInProject}
            setAiWorking={setAiWorking}
          />
        ) : null}

        {mode === "map" ? (
          <Suspense fallback={<div style={{ padding: "24px", color: "var(--muted)" }}>Cargando mapa…</div>}>
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
          </Suspense>
        ) : null}

        {mode === "llm" ? <LLMWorkspace selectedProject={selectedProject} modelHealth={modelHealth} /> : null}
      </main>
    </div>
  );
}

export default App;
