export type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  excerpt: string;
  tokens: number;
  score?: number;
  vector_score?: number;
  lexical_score?: number;
};

export type NoteLite = Omit<Note, "content">;

export type MapNode = NoteLite & { x: number; y: number; z: number };

export type MapEdge = {
  id: string;
  from_id: string;
  to_id: string;
  score: number;
  source: "strong" | "semantic";
};

export type MapData = {
  nodes: MapNode[];
  edges: MapEdge[];
  model: string;
  dimensions: number;
};

export type ModelHealth = {
  online: boolean;
  embedding_online: boolean;
  provider: string;
  model: string;
  embedding_model: string;
  base_url: string;
  message: string;
};

export type McpStatus = {
  running: boolean;
  transport: string;
  host: string;
  port: number;
  endpoint: string;
  auth: string;
  tools: number | null;
  start_command: string;
};

export type AskResult = {
  question: string;
  answer: string | null;
  sources: NoteLite[];
  local_fallback: boolean;
  model: string;
};

export type TagCount = { tag: string; count: number };

export type View = "notas" | "mapa";
