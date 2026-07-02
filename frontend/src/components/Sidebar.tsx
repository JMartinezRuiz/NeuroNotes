import { Download, FileText, Network, Plus, Search, Sparkles } from "lucide-react";
import { agentHex, apiUrl } from "../lib/api";
import { relativeTime, trimText } from "../lib/utils";
import type { ModelHealth, NoteLite, TagCount, View } from "../types";

export function Sidebar({
  view,
  setView,
  searchQuery,
  setSearchQuery,
  onAsk,
  notes,
  isSearchResults,
  tags,
  activeTag,
  setActiveTag,
  selectedNoteId,
  onSelectNote,
  onNewNote,
  health,
  onOpenAi,
}: {
  view: View;
  setView: (view: View) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onAsk: () => void;
  notes: NoteLite[];
  isSearchResults: boolean;
  tags: TagCount[];
  activeTag: string;
  setActiveTag: (tag: string) => void;
  selectedNoteId: string;
  onSelectNote: (noteId: string) => void;
  onNewNote: () => void;
  health: ModelHealth;
  onOpenAi: () => void;
}) {
  const aiReady = health.online || health.embedding_online;

  return (
    <aside className="sidebar">
      <header className="sidebar-brand">
        <strong>NeuroNotes</strong>
        <div className="view-switch" role="tablist" aria-label="Vista">
          <button
            type="button"
            role="tab"
            aria-selected={view === "notas"}
            className={view === "notas" ? "active" : ""}
            onClick={() => setView("notas")}
            title="Notas"
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "mapa"}
            className={view === "mapa" ? "active" : ""}
            onClick={() => setView("mapa")}
            title="Mapa"
          >
            <Network size={15} />
          </button>
        </div>
      </header>

      <div className="sidebar-search">
        <Search size={14} />
        <input
          id="global-search"
          placeholder="Buscar por significado…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && searchQuery.trim().length >= 3) onAsk();
            if (event.key === "Escape") setSearchQuery("");
          }}
          aria-label="Buscar notas"
        />
        {!searchQuery ? <kbd>Ctrl K</kbd> : null}
      </div>
      {searchQuery.trim().length >= 3 ? (
        <button className="ask-cta" type="button" onClick={onAsk}>
          <Sparkles size={14} />
          Preguntar a tu cerebro
          <kbd>↵</kbd>
        </button>
      ) : null}

      <button className="new-note" type="button" onClick={onNewNote}>
        <Plus size={15} />
        Nueva nota
      </button>

      {tags.length > 0 && !isSearchResults ? (
        <div className="tag-row" aria-label="Temas">
          {tags.slice(0, 8).map((item) => (
            <button
              key={item.tag}
              type="button"
              className={activeTag === item.tag ? "tag-chip active" : "tag-chip"}
              onClick={() => setActiveTag(activeTag === item.tag ? "" : item.tag)}
            >
              {item.tag}
            </button>
          ))}
        </div>
      ) : null}

      <div className="note-list">
        {notes.length === 0 ? (
          <div className="list-empty">
            {isSearchResults ? "Nada parecido todavía." : "Aún no hay notas."}
          </div>
        ) : (
          notes.map((note) => (
            <button
              key={note.id}
              type="button"
              className={note.id === selectedNoteId ? "note-item active" : "note-item"}
              style={{ "--note-bar": agentHex(note.created_by) } as React.CSSProperties}
              onClick={() => onSelectNote(note.id)}
            >
              <strong>{note.title || "Sin título"}</strong>
              <span>{trimText(note.excerpt || "Sin contenido", 72)}</span>
              <small>
                {note.tags.slice(0, 2).join(" · ")}
                {note.tags.length ? " · " : ""}
                {relativeTime(note.updated_at)}
                {typeof note.score === "number" && isSearchResults ? ` · ${(note.score * 100).toFixed(0)}%` : ""}
              </small>
            </button>
          ))
        )}
      </div>

      <footer className="sidebar-foot">
        <button type="button" className="ai-status" onClick={onOpenAi} title={health.message}>
          <span className={aiReady ? "dot on" : "dot"} />
          IA local {health.online ? "lista" : health.embedding_online ? "parcial" : "apagada"}
        </button>
        <button
          type="button"
          className="icon-button"
          title="Exportar todo (Markdown .zip)"
          aria-label="Exportar todas las notas"
          onClick={() => {
            const link = document.createElement("a");
            link.href = apiUrl("/api/export");
            link.download = "neuronotes.zip";
            link.click();
          }}
        >
          <Download size={15} />
        </button>
      </footer>
    </aside>
  );
}
