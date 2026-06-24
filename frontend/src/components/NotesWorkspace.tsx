import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  CheckCircle,
  Circle,
  Eye,
  FileText,
  Image as ImageIcon,
  Link,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Wand2,
} from "lucide-react";
import { api, agentColor } from "../lib/api";
import { aiModes, emptyDraft } from "../lib/constants";
import { estimateTokens, newDraftForScope, projectName, readFileAsDataUrl, scopeDescriptor } from "../lib/helpers";
import type { AiMode, CountItem, LibraryScope, Note, Project, Relation, Task } from "../types";
import { MarkdownPreview } from "./MarkdownPreview";

type AiProposal = {
  title?: string;
  content?: string;
  type?: string;
  status?: string;
  folder?: string;
  category?: string;
  tasks?: Array<{ title: string }>;
  related_note_ids?: string[];
};

export function NotesWorkspace({
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
  const [aiProposal, setAiProposal] = useState<AiProposal | null>(null);
  const [editorMode, setEditorMode] = useState<"write" | "preview">("write");
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const loadedNoteIdRef = useRef<string>("");
  const scopeKeyRef = useRef<string>("");
  const inFlightRef = useRef(false);

  function editDraft(patch: Partial<Note>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    // Re-arm autosave after a previous failure once the user keeps editing.
    if (saveError) setSaveError("");
  }

  // Focus the title for a fresh draft so capture starts with the keyboard.
  useEffect(() => {
    if (!selectedNoteId) titleRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Never stack a silent autosave on an in-flight save — that is how a brand-new
    // (id-less) note could be POSTed twice and duplicated.
    if (silent && inFlightRef.current) return undefined;
    inFlightRef.current = true;
    const wasNew = !draft.id;
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
      if (silent) {
        // Adopt the new id WITHOUT clobbering in-flight keystrokes (merge only the
        // id) so the next autosave PUTs instead of creating a duplicate note.
        if (wasNew) setDraft((current) => (current.id ? current : { ...current, id: note.id }));
      } else {
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
      inFlightRef.current = false;
      if (!silent) setSaving(false);
    }
  }

  useEffect(() => {
    // Autosave on a debounce. A brand-new (id-less) note autosaves once it has
    // real content (never persist an empty draft); after a failed save we pause
    // until the next edit (editDraft clears saveError) to avoid a retry storm.
    if (!dirty || saveError) return;
    if (!draft.id && !(draft.title?.trim() || draft.content?.trim())) return;
    const handle = window.setTimeout(() => {
      void saveNote({ silent: true });
    }, 800);
    return () => window.clearTimeout(handle);
  }, [dirty, saveError, draft.id, draft.title, draft.content, draft.folder, draft.category, draft.type, draft.status, draft.project_id]);

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
    setSaveError("");
    try {
      const target = await saveNote();
      if (!target?.id) return;
      // Ask for a PROPOSAL (preview), never auto-overwrite the note.
      const result = await api<{ proposal: AiProposal }>(`/api/notes/${target.id}/improve`, {
        method: "POST",
        body: JSON.stringify({ agent_id: "qwen", mode: item.id, goal: item.goal, preview: true }),
      });
      setAiProposal(result.proposal);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "La IA no pudo generar una propuesta.");
    } finally {
      setActiveAiMode("");
      setAiWorking(false);
    }
  }

  async function acceptProposal() {
    if (!aiProposal || !draft.id) return;
    const proposal = aiProposal;
    setAiProposal(null);
    setAiWorking(true);
    try {
      const result = await api<{ note: Note }>(`/api/notes/${draft.id}/improve/apply`, {
        method: "POST",
        body: JSON.stringify({ agent_id: "qwen", proposal }),
      });
      setDraft(result.note);
      setSelectedNoteId(result.note.id);
      loadedNoteIdRef.current = result.note.id;
      setDirty(false);
      await refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo aplicar la propuesta.");
    } finally {
      setAiWorking(false);
    }
  }

  function rejectProposal() {
    setAiProposal(null);
  }

  function newNote() {
    setSelectedNoteId("");
    setDraft(newDraftForScope(scope, selectedProject));
    loadedNoteIdRef.current = "";
    setDirty(false);
    setSaveError("");
    setEditorMode("write");
    window.setTimeout(() => titleRef.current?.focus(), 0);
  }

  async function deleteNote() {
    if (!draft.id) return;
    if (!window.confirm(`¿Eliminar la nota "${draft.title || "Untitled"}"? No se puede deshacer.`)) return;
    try {
      await api(`/api/notes/${draft.id}`, { method: "DELETE" });
      loadedNoteIdRef.current = "";
      setDirty(false);
      setSaveError("");
      setSelectedNoteId("");
      await refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo eliminar la nota.");
    }
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
                style={{ borderLeftColor: agentColor(note.created_by_agent_id) }}
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
              <strong>{allNotes.length === 0 ? "Write your first note" : "No notes here yet"}</strong>
              <p>
                {allNotes.length === 0
                  ? "Just start typing — it autosaves. Organize later."
                  : "Create a note or pick another folder/category from the sidebar."}
              </p>
              <button className="primary-button" type="button" onClick={newNote} style={{ marginTop: 4 }}>
                <Plus size={16} />
                New note
              </button>
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
            <button className="icon-button" type="button" title="Insert image" aria-label="Insertar imagen" onClick={() => imageInputRef.current?.click()}>
              <ImageIcon size={16} />
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={insertImage} />
          </div>
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
          ref={titleRef}
          className="title-input"
          placeholder="Untitled"
          value={draft.title || ""}
          onChange={(event) => editDraft({ title: event.target.value })}
        />
        <div className="note-attribution">
          <span className="agent-dot" style={{ backgroundColor: agentColor(draft.created_by_agent_id) }} />
          <span>{draft.agent || "Usuario"}</span>
          {draft.status ? <span className="attribution-status">· {draft.status}</span> : null}
        </div>

        {aiProposal ? (
          <div
            style={{
              margin: "0 24px 12px",
              border: "1px solid var(--accent)",
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-soft)",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <strong style={{ fontSize: 13 }}>Propuesta de IA — revisar antes de aplicar</strong>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              {aiProposal.type || draft.type} · {aiProposal.category || draft.category}
              {aiProposal.tasks?.length ? ` · ${aiProposal.tasks.length} tarea(s)` : ""}
            </span>
            <pre
              style={{
                margin: 0,
                maxHeight: 220,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                fontSize: 12.5,
                fontFamily: "inherit",
                color: "var(--text)",
              }}
            >
              {aiProposal.content}
            </pre>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary-button small" type="button" onClick={acceptProposal}>
                Aceptar
              </button>
              <button
                type="button"
                onClick={rejectProposal}
                style={{
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-sm)",
                  background: "transparent",
                  color: "var(--muted)",
                  padding: "6px 12px",
                  fontSize: 13,
                }}
              >
                Rechazar
              </button>
            </div>
          </div>
        ) : null}

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
            {draft.id ? (
              <button
                className="icon-button"
                type="button"
                onClick={deleteNote}
                title="Eliminar nota"
                aria-label="Eliminar nota"
                style={{ marginLeft: "auto" }}
              >
                <Trash2 size={16} />
              </button>
            ) : null}
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
