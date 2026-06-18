import { useEffect, useMemo, useState } from "react";
import { Circle, FileText, Link, Loader2, RefreshCw } from "lucide-react";
import { api, agentHex } from "../lib/api";
import {
  connectedNotes,
  positionGraphNodes,
  projectName,
  relationEdgesFromRows,
  relationTouches,
  trimText,
  vectorMapPathForScope,
} from "../lib/helpers";
import type { LibraryScope, Note, Project, Relation, Task, VectorMap } from "../types";
import { ThreeVectorScene } from "./ThreeVectorScene";

export function MapWorkspace({
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
  const graphNodes = useMemo(
    () => positionGraphNodes(vectorMap?.nodes ?? notes).map((node) => ({ ...node, color: agentHex(node.agent) })),
    [vectorMap, notes],
  );
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
