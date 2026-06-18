import type * as THREE from "three";

export type ViewMode = "notes" | "map" | "llm";
export type ThemeMode = "light" | "dark";
export type ScopeType = "all" | "project" | "folder" | "category" | "loose";
export type AiMode = "grammar" | "clean" | "format" | "categorize";
export type SidebarSectionId = "library" | "folders" | "categories" | "projects";

export type LibraryScope = {
  type: ScopeType;
  id: string;
  label: string;
};

export type Project = {
  id: string;
  name: string;
  goal: string;
  status: string;
  summary: string;
  tags: string[];
};

export type Note = {
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

export type Dashboard = {
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

export type Task = {
  id: string;
  project_id: string;
  title: string;
  status: "open" | "in_progress" | "review" | "implemented";
  source_note_id?: string | null;
  source_agent_id?: string;
  source: string;
  created_at?: string;
};

export type Relation = {
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

export type SearchResult = {
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

export type ModelHealth = {
  online: boolean;
  provider?: string;
  model: string;
  base_url: string;
  message: string;
};

export type CountItem = {
  id: string;
  label: string;
  count: number;
};

export type VectorNode = {
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

export type VectorEdge = {
  id: string;
  from_id: string;
  to_id: string;
  relation_type: string;
  score: number;
  source: "relation" | "vector";
};

export type VectorMap = {
  nodes: VectorNode[];
  edges: VectorEdge[];
  dimensions: number;
  model: string;
  sources: {
    relation_edges: number;
    semantic_edges: number;
  };
};

export type GraphNode = (VectorNode | Note) & {
  graphX: number;
  graphY: number;
  linkCount: number;
};

export type ThreeCluster = {
  id: string;
  label: string;
  count: number;
  radius: number;
  color: string;
  position: THREE.Vector3;
  labelPosition: THREE.Vector3;
};
