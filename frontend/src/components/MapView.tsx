import { useQuery } from "@tanstack/react-query";
import { Network } from "lucide-react";
import { api } from "../lib/api";
import type { MapData } from "../types";
import { Scene3D } from "./Scene3D";

export function MapView({
  selectedNoteId,
  onSelectNote,
  onOpenNote,
}: {
  selectedNoteId: string;
  onSelectNote: (noteId: string) => void;
  onOpenNote: (noteId: string) => void;
}) {
  const mapQuery = useQuery({
    queryKey: ["map"],
    queryFn: ({ signal }) => api<MapData>("/api/map", { signal }),
    staleTime: 60_000,
  });
  const map = mapQuery.data;

  if (mapQuery.isLoading) {
    return <div className="map-empty">Calculando el mapa…</div>;
  }
  if (!map || map.nodes.length === 0) {
    return (
      <div className="map-empty">
        <Network size={20} />
        <strong>Tu mente, en 3D</strong>
        <p>Escribe algunas notas y aparecerán aquí, agrupadas por significado.</p>
      </div>
    );
  }

  return (
    <div className="map-view">
      <Scene3D nodes={map.nodes} edges={map.edges} selectedNoteId={selectedNoteId} onSelectNote={onSelectNote} />
      <div className="map-hud">
        <span>
          <strong>{map.nodes.length}</strong> notas · cercanía = significado
        </span>
        {selectedNoteId && map.nodes.some((node) => node.id === selectedNoteId) ? (
          <button className="primary-button small" type="button" onClick={() => onOpenNote(selectedNoteId)}>
            Abrir nota
          </button>
        ) : null}
      </div>
    </div>
  );
}
