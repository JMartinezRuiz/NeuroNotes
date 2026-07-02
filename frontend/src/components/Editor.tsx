import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Image as ImageIcon, Link2, Loader2, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { agentHex, agentLabel, api } from "../lib/api";
import { estimateTokens, readFileAsDataUrl, relativeTime } from "../lib/utils";
import type { Note, NoteLite } from "../types";
import { MarkdownPreview } from "./MarkdownPreview";

type Draft = {
  id?: string;
  title: string;
  content: string;
  tags: string[];
  created_by: string;
};

const EMPTY_DRAFT: Draft = { title: "", content: "", tags: [], created_by: "user" };

type Enrichment = { title: string; tags: string[]; local_fallback: boolean } | null;

export function Editor({
  noteId,
  onNoteCreated,
  onSelectNote,
  onNewNote,
}: {
  noteId: string; // "" = nothing, "new" = composing
  onNoteCreated: (noteId: string) => void;
  onSelectNote: (noteId: string) => void;
  onNewNote: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSignal, setSaveSignal] = useState(0);
  const [editorMode, setEditorMode] = useState<"write" | "preview">("write");
  const [tagInput, setTagInput] = useState("");
  const [enriching, setEnriching] = useState(false);
  const [enrichment, setEnrichment] = useState<Enrichment>(null);

  const titleRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const loadedNoteIdRef = useRef<string>("");
  const inFlightRef = useRef(false);
  const tagsTouchedRef = useRef(false);
  const autoTaggedRef = useRef(false);

  const isReal = Boolean(noteId) && noteId !== "new";

  const noteQuery = useQuery({
    queryKey: ["note", noteId],
    queryFn: ({ signal }) => api<Note>(`/api/notes/${noteId}`, { signal }),
    enabled: isReal,
  });

  const relatedQuery = useQuery({
    queryKey: ["related", draft.id ?? ""],
    queryFn: ({ signal }) => api<NoteLite[]>(`/api/notes/${draft.id}/related?limit=4`, { signal }),
    enabled: Boolean(draft.id),
    staleTime: 30_000,
  });
  // The backend applies a relative "actually close" threshold — trust it.
  const related = relatedQuery.data ?? [];

  // Load the selected note into the draft — only when the SELECTION changes,
  // never when a background refetch hands us a fresh object for the same note
  // (that used to destroy in-progress edits).
  useEffect(() => {
    if (noteId === "new") {
      if (loadedNoteIdRef.current !== "new") {
        setDraft(EMPTY_DRAFT);
        loadedNoteIdRef.current = "new";
        setDirty(false);
        setSaveError("");
        setEnrichment(null);
        setEditorMode("write");
        tagsTouchedRef.current = false;
        autoTaggedRef.current = false;
        window.setTimeout(() => titleRef.current?.focus(), 0);
      }
      return;
    }
    const note = noteQuery.data;
    if (isReal && note && note.id === noteId && noteId !== loadedNoteIdRef.current) {
      setDraft({ id: note.id, title: note.title, content: note.content, tags: note.tags, created_by: note.created_by });
      loadedNoteIdRef.current = noteId;
      setDirty(false);
      setSaveError("");
      setEnrichment(null);
    }
  }, [noteId, noteQuery.data, isReal]);

  function editDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    if (saveError) setSaveError(""); // re-arm autosave after a failure
  }

  async function saveNote(opts?: { silent?: boolean }): Promise<Note | undefined> {
    const silent = opts?.silent === true;
    // Never stack a silent autosave on an in-flight save — that is how a
    // brand-new note could be POSTed twice.
    if (silent && inFlightRef.current) return undefined;
    inFlightRef.current = true;
    const wasNew = !draft.id;
    if (!silent) setSaving(true);
    setDirty(false);
    try {
      const payload = { title: draft.title, content: draft.content, tags: draft.tags };
      const note = draft.id
        ? await api<Note>(`/api/notes/${draft.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api<Note>("/api/notes", { method: "POST", body: JSON.stringify({ ...payload, created_by: "user" }) });
      setSaveError("");
      if (wasNew) {
        // Adopt the id without clobbering keystrokes typed mid-request; adopt
        // server-derived title/tags only if the user hasn't typed their own.
        loadedNoteIdRef.current = note.id;
        setDraft((current) => ({
          ...current,
          id: current.id ?? note.id,
          title: current.title.trim() ? current.title : note.title,
          tags: current.tags.length ? current.tags : note.tags,
        }));
        onNoteCreated(note.id);
        void autoTagWithModel(note.id);
      }
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      void queryClient.invalidateQueries({ queryKey: ["map"] });
      return note;
    } catch (error) {
      setDirty(true);
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar.");
      return undefined;
    } finally {
      inFlightRef.current = false;
      if (!silent) setSaving(false);
      // Re-evaluate autosave once a save settles so a trailing burst of edits
      // that arrived during the request still gets flushed.
      setSaveSignal((value) => value + 1);
    }
  }

  // Autosave on a debounce. A brand-new note autosaves once it has content;
  // after a failed save we pause until the next edit clears saveError.
  useEffect(() => {
    if (!dirty || saveError) return;
    if (!draft.id && !(draft.title.trim() || draft.content.trim())) return;
    const handle = window.setTimeout(() => {
      void saveNote({ silent: true });
    }, 800);
    return () => window.clearTimeout(handle);
  }, [dirty, saveError, saveSignal, draft.id, draft.title, draft.content, draft.tags]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // AI-first: once the first save of a brand-new note lands, quietly ask the
  // local model for better tags than the instant heuristic — and apply them
  // only if the user hasn't touched tags meanwhile. Offline → no-op.
  async function autoTagWithModel(targetNoteId: string) {
    if (autoTaggedRef.current) return;
    autoTaggedRef.current = true;
    try {
      const suggestion = await api<{ tags: string[]; local_fallback: boolean }>(
        `/api/notes/${targetNoteId}/enrich`,
        { method: "POST" },
      );
      if (suggestion.local_fallback || !suggestion.tags.length || tagsTouchedRef.current) return;
      // The suggestion arrives seconds later — apply it ONLY if the editor still
      // holds that same note (the user may have opened another one meanwhile).
      let applied = false;
      setDraft((current) => {
        if (current.id !== targetNoteId) return current;
        applied = true;
        return { ...current, tags: suggestion.tags };
      });
      if (applied) setDirty(true);
    } catch {
      /* silent — the heuristic tags stay */
    }
  }

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/,+$/, "");
    tagsTouchedRef.current = true;
    if (!tag) return;
    if (!draft.tags.includes(tag)) editDraft({ tags: [...draft.tags, tag].slice(0, 8) });
    setTagInput("");
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagInput);
    } else if (event.key === "Backspace" && !tagInput && draft.tags.length) {
      tagsTouchedRef.current = true;
      editDraft({ tags: draft.tags.slice(0, -1) });
    }
  }

  async function insertImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const dataUrl = await readFileAsDataUrl(file);
    const markdown = `![${file.name.replace(/\.[^.]+$/, "")}](${dataUrl})`;
    editDraft({ content: `${draft.content}${draft.content.trim() ? "\n\n" : ""}${markdown}\n` });
    setEditorMode("preview");
  }

  async function deleteNote() {
    if (!draft.id) return;
    if (!window.confirm(`¿Eliminar "${draft.title || "Sin título"}"? No se puede deshacer.`)) return;
    try {
      await api(`/api/notes/${draft.id}`, { method: "DELETE" });
      loadedNoteIdRef.current = "";
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      void queryClient.invalidateQueries({ queryKey: ["map"] });
      onNewNote();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo eliminar.");
    }
  }

  async function runEnrich() {
    setEnriching(true);
    setSaveError("");
    try {
      const target = draft.id ? { id: draft.id } : await saveNote();
      if (!target?.id) return;
      const suggestion = await api<{ title: string; tags: string[]; local_fallback: boolean }>(
        `/api/notes/${target.id}/enrich`,
        { method: "POST" },
      );
      setEnrichment(suggestion);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "La IA no pudo organizar la nota.");
    } finally {
      setEnriching(false);
    }
  }

  function applyEnrichment() {
    if (!enrichment) return;
    editDraft({
      title: enrichment.title || draft.title,
      tags: enrichment.tags.length ? enrichment.tags : draft.tags,
    });
    setEnrichment(null);
  }

  if (!noteId) {
    return (
      <section className="editor empty">
        <div className="editor-welcome">
          <strong>Escribe tu primera nota</strong>
          <p>Solo escribe — se guarda sola, la IA la etiqueta y la conecta con lo que ya sabes.</p>
          <button className="primary-button" type="button" onClick={onNewNote}>
            Nueva nota
          </button>
        </div>
      </section>
    );
  }

  if (isReal && noteQuery.isError) {
    return (
      <section className="editor empty">
        <div className="editor-welcome">
          <strong>Esa nota ya no existe</strong>
          <p>Puede que la borraras o que el enlace sea antiguo.</p>
          <button className="primary-button" type="button" onClick={onNewNote}>
            Nueva nota
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="editor">
      <div className="editor-head">
        <input
          ref={titleRef}
          className="title-input"
          placeholder="Sin título"
          value={draft.title}
          onChange={(event) => editDraft({ title: event.target.value })}
        />
        <div className="editor-tools">
          <button
            className="icon-button"
            type="button"
            title={editorMode === "write" ? "Vista previa" : "Editar"}
            onClick={() => setEditorMode(editorMode === "write" ? "preview" : "write")}
          >
            {editorMode === "write" ? <Eye size={16} /> : <Pencil size={16} />}
          </button>
          <button className="icon-button" type="button" title="Insertar imagen" onClick={() => imageInputRef.current?.click()}>
            <ImageIcon size={16} />
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={insertImage} />
          <button className="icon-button ai" type="button" title="Organizar con IA (título + etiquetas)" onClick={runEnrich} disabled={enriching}>
            {enriching ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          </button>
          {draft.id ? (
            <button className="icon-button danger" type="button" title="Eliminar nota" onClick={deleteNote}>
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="meta-row">
        <span className="agent-dot" style={{ backgroundColor: agentHex(draft.created_by) }} title={`Creada por ${agentLabel(draft.created_by)}`} />
        <div className="tag-editor">
          {draft.tags.map((tag) => (
            <span className="tag-chip solid" key={tag}>
              {tag}
              <button
                type="button"
                aria-label={`Quitar ${tag}`}
                onClick={() => {
                  tagsTouchedRef.current = true;
                  editDraft({ tags: draft.tags.filter((item) => item !== tag) });
                }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            placeholder={draft.tags.length ? "" : "etiquetas…"}
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={onTagKeyDown}
            onBlur={() => addTag(tagInput)}
            aria-label="Añadir etiqueta"
          />
        </div>
        <small className="save-state">
          {saveError ? saveError : saving ? "Guardando…" : dirty ? "Sin guardar" : draft.id ? "Guardado" : ""}
        </small>
      </div>

      {enrichment ? (
        <div className="enrich-strip">
          <Sparkles size={14} />
          <div>
            {enrichment.title && enrichment.title !== draft.title ? (
              <div className="enrich-line">Título: <strong>{enrichment.title}</strong></div>
            ) : null}
            <div className="enrich-line">Etiquetas: {enrichment.tags.map((tag) => `#${tag}`).join("  ")}</div>
            <small>{enrichment.local_fallback ? "Sugerencia offline (sin modelo)" : "Sugerencia del modelo local"}</small>
          </div>
          <div className="enrich-actions">
            <button className="primary-button small" type="button" onClick={applyEnrichment}>
              Aplicar
            </button>
            <button className="secondary-button small" type="button" onClick={() => setEnrichment(null)}>
              Descartar
            </button>
          </div>
        </div>
      ) : null}

      {editorMode === "write" ? (
        <textarea
          className="note-body"
          placeholder="Escribe en Markdown. Se guarda solo."
          value={draft.content}
          onChange={(event) => editDraft({ content: event.target.value })}
        />
      ) : (
        <MarkdownPreview content={draft.content} />
      )}

      <footer className="editor-foot">
        <small>{estimateTokens(draft.content)} tokens</small>
        {noteQuery.data && draft.id ? <small>editada {relativeTime(noteQuery.data.updated_at)}</small> : null}
      </footer>

      {draft.id ? (
        <div className="related-strip">
          <span className="related-head">
            <Link2 size={13} />
            Notas cercanas
          </span>
          {related.length === 0 ? (
            <small className="related-empty">
              {relatedQuery.isLoading ? "Buscando…" : "Nada cercano todavía — la conexión aparece sola al escribir más."}
            </small>
          ) : (
            related.map((item) => (
              <button key={item.id} type="button" className="related-item" onClick={() => onSelectNote(item.id)}>
                <span className="agent-dot" style={{ backgroundColor: agentHex(item.created_by) }} />
                {item.title}
                <small>{Math.round((item.score ?? 0) * 100)}%</small>
              </button>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
