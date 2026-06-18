import * as THREE from "three";
import { emptyDraft } from "./constants";
import type {
  GraphNode,
  LibraryScope,
  Note,
  Project,
  Relation,
  ThreeCluster,
  VectorEdge,
  VectorNode,
} from "../types";

export function notesPathForScope(scope: LibraryScope) {
  if (scope.type === "project") return `/api/notes?project_id=${encodeURIComponent(scope.id)}`;
  if (scope.type === "folder") return `/api/notes?folder=${encodeURIComponent(scope.id)}`;
  if (scope.type === "category") return `/api/notes?category=${encodeURIComponent(scope.id)}`;
  if (scope.type === "loose") return "/api/notes?folder=";
  return "/api/notes";
}

export function vectorMapPathForScope(scope: LibraryScope) {
  if (scope.type === "project") return `/api/vectors/map?project_id=${encodeURIComponent(scope.id)}`;
  if (scope.type === "folder") return `/api/vectors/map?folder=${encodeURIComponent(scope.id)}`;
  if (scope.type === "category") return `/api/vectors/map?category=${encodeURIComponent(scope.id)}`;
  if (scope.type === "loose") return "/api/vectors/map?folder=";
  return "/api/vectors/map";
}

export function projectScope(project: Project): LibraryScope {
  return { type: "project", id: project.id, label: project.name };
}

export function buildCountItems(notes: Note[], getter: (note: Note) => string | undefined) {
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

export function buildThreeNodePositions(nodes: GraphNode[], edges: VectorEdge[]) {
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

export function clusterIdForNode(node: GraphNode) {
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

export function clusterLabelFromId(id: string) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "General";
}

export function chooseVisibleEdges(edges: VectorEdge[], selectedNoteId: string, nodeCount: number) {
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

export function makeThreeColor(value: string | undefined) {
  const color = new THREE.Color();
  try {
    color.set(value || "#6ee7d8");
  } catch {
    color.set("#6ee7d8");
  }
  return color;
}

export function createGlowTexture() {
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

export function addLineSegments(root: THREE.Group, values: number[], material: THREE.Material, geometries: Set<THREE.BufferGeometry>) {
  if (!values.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
  geometries.add(geometry);
  root.add(new THREE.LineSegments(geometry, material));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function safeMarkdownUrl(url: string) {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return "";
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function relationEdgesFromRows(relations: Relation[]): VectorEdge[] {
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

export function positionGraphNodes(items: Array<VectorNode | Note>): GraphNode[] {
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

export function hashUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

export function newDraftForScope(scope: LibraryScope, selectedProject: Project): Partial<Note> {
  return {
    ...emptyDraft,
    project_id: scope.type === "project" ? scope.id : selectedProject.id,
    folder: scope.type === "folder" ? scope.id : "",
    category: scope.type === "category" ? scope.id : "General",
  };
}

export function connectedNotes(noteId: string, notes: Note[], relations: Relation[]) {
  const ids = new Set<string>();
  relations.forEach((relation) => {
    if (relation.from_type !== "note" || relation.to_type !== "note") return;
    if (relation.from_id === noteId) ids.add(relation.to_id);
    if (relation.to_id === noteId) ids.add(relation.from_id);
  });
  return notes.filter((note) => ids.has(note.id));
}

export function relationTouches(relations: Relation[], fromId: string, toId: string) {
  return relations.some(
    (relation) =>
      ((relation.from_id === fromId && relation.to_id === toId) ||
        (relation.from_id === toId && relation.to_id === fromId)) &&
      relation.status === "active",
  );
}

export function projectName(projectId: string, projects: Project[]) {
  return projects.find((project) => project.id === projectId)?.name ?? projectId;
}

export function scopeDescriptor(scope: LibraryScope) {
  if (scope.type === "project") return "Project";
  if (scope.type === "folder") return "Folder";
  if (scope.type === "category") return "Category";
  if (scope.type === "loose") return "Loose notes";
  return "Library";
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.35));
}

export function trimText(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
