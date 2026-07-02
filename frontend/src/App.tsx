import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api";
import type { ModelHealth, NoteLite, TagCount, View } from "./types";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { AskPanel } from "./components/AskPanel";
import { AiCard } from "./components/AiCard";

// three.js is heavy — the map (and three) loads only when opened.
const MapView = lazy(() => import("./components/MapView").then((module) => ({ default: module.MapView })));

const FALLBACK_HEALTH: ModelHealth = {
  online: false,
  embedding_online: false,
  provider: "ollama",
  model: "qwen3:4b",
  embedding_model: "nomic-embed-text",
  base_url: "http://localhost:11434",
  message: "IA local no comprobada.",
};

function App() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<View>(() => (searchParams.get("vista") === "mapa" ? "mapa" : "notas"));
  const [selectedNoteId, setSelectedNoteId] = useState(() => searchParams.get("nota") ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [askQuestion, setAskQuestion] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  // URL sync (replace: no history spam) so deep links and reload restore the view.
  useEffect(() => {
    const next = new URLSearchParams();
    if (view !== "notas") next.set("vista", view);
    if (selectedNoteId && selectedNoteId !== "new") next.set("nota", selectedNoteId);
    setSearchParams(next, { replace: true });
  }, [view, selectedNoteId, setSearchParams]);

  const isSearching = debouncedQuery.length >= 2;
  const notesQuery = useQuery({
    queryKey: ["notes", isSearching ? debouncedQuery : "all", isSearching ? "" : activeTag],
    queryFn: ({ signal }) =>
      api<NoteLite[]>(
        isSearching
          ? `/api/notes?q=${encodeURIComponent(debouncedQuery)}&limit=30`
          : `/api/notes?limit=200${activeTag ? `&tag=${encodeURIComponent(activeTag)}` : ""}`,
        { signal },
      ),
    placeholderData: (previous) => previous,
  });
  const notes = notesQuery.data ?? [];

  const tagsQuery = useQuery({
    queryKey: ["tags"],
    queryFn: ({ signal }) => api<TagCount[]>("/api/tags", { signal }),
  });
  const tags = tagsQuery.data ?? [];

  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => api<ModelHealth>("/api/health/model", { signal }),
    refetchInterval: 30_000,
    retry: false,
  });
  const health = healthQuery.data ?? FALLBACK_HEALTH;

  // Keep a valid selection: pick the newest note when nothing is selected, but
  // never while deliberately composing a new one ("new" sentinel).
  useEffect(() => {
    if (selectedNoteId === "new" || isSearching) return;
    if (!notes.length) {
      if (selectedNoteId) setSelectedNoteId("");
      return;
    }
    if (!selectedNoteId || (!activeTag && !notes.some((note) => note.id === selectedNoteId))) {
      // Only auto-repair when the note truly disappeared (not merely filtered out).
      if (!selectedNoteId || !notes.some((note) => note.id === selectedNoteId)) {
        setSelectedNoteId(notes[0].id);
      }
    }
  }, [notes, selectedNoteId, isSearching, activeTag]);

  const sidebarNotes = useMemo(() => notes, [notes]);

  function openNote(noteId: string) {
    setSelectedNoteId(noteId);
    setView("notas");
    setAskQuestion("");
    setSearchQuery("");
  }

  function newNote() {
    setSelectedNoteId("new");
    setView("notas");
    setSearchQuery("");
  }

  return (
    <div className="app">
      <Sidebar
        view={view}
        setView={setView}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onAsk={() => setAskQuestion(searchQuery.trim())}
        notes={sidebarNotes}
        isSearchResults={isSearching}
        tags={tags}
        activeTag={activeTag}
        setActiveTag={setActiveTag}
        selectedNoteId={selectedNoteId}
        onSelectNote={openNote}
        onNewNote={newNote}
        health={health}
        onOpenAi={() => setAiOpen(true)}
      />

      <main className="main">
        {view === "notas" ? (
          <Editor
            noteId={selectedNoteId}
            onNoteCreated={(noteId) => setSelectedNoteId(noteId)}
            onSelectNote={openNote}
            onNewNote={newNote}
          />
        ) : (
          <Suspense fallback={<div className="map-empty">Cargando el mapa…</div>}>
            <MapView selectedNoteId={selectedNoteId} onSelectNote={setSelectedNoteId} onOpenNote={openNote} />
          </Suspense>
        )}
      </main>

      {askQuestion ? (
        <AskPanel question={askQuestion} onClose={() => setAskQuestion("")} onOpenNote={openNote} />
      ) : null}
      {aiOpen ? <AiCard health={health} onClose={() => setAiOpen(false)} /> : null}
    </div>
  );
}

export default App;
