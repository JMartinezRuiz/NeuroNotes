import { FileText, Network, Plug } from "lucide-react";
import type {
  AiMode,
  Dashboard,
  LibraryScope,
  Note,
  Project,
  SidebarSectionId,
  ViewMode,
} from "../types";

export const fallbackProject: Project = {
  id: "agent-memory-hub",
  name: "Agent Memory Hub",
  goal: "Crear una app local-first donde humanos y agentes compartan memoria.",
  status: "MVP",
  summary: "Single brain local para notas, tareas, relaciones y contexto de LLMs.",
  tags: ["single-brain", "LLM", "local-first"],
};

export const fallbackDashboard: Dashboard = {
  project: fallbackProject,
  projects: [fallbackProject],
  agents: [],
  decisions: [],
  tasks: [],
  notes: [],
  inbox: [],
  activity: [],
  health: {},
  pending_patches: [],
};

export const emptyDraft: Partial<Note> = {
  project_id: fallbackProject.id,
  title: "",
  content: "",
  type: "Human Note",
  status: "draft",
  folder: "",
  category: "General",
  created_by_agent_id: "user",
};

export const defaultScope: LibraryScope = {
  type: "project",
  id: fallbackProject.id,
  label: fallbackProject.name,
};

export const defaultSidebarOrder: SidebarSectionId[] = ["library", "folders", "categories", "projects"];

export const modes: Array<{ id: ViewMode; label: string; icon: typeof FileText }> = [
  { id: "notes", label: "Notes", icon: FileText },
  { id: "map", label: "Map", icon: Network },
  { id: "llm", label: "LLM", icon: Plug },
];

export const aiModes: Array<{ id: AiMode; label: string; goal: string }> = [
  {
    id: "grammar",
    label: "Grammar",
    goal: "Only correct grammar, spelling, punctuation and casing. Preserve the note structure.",
  },
  {
    id: "clean",
    label: "Clean",
    goal: "Turn this messy capture into a clean note with concise headings or bullets. Do not add facts.",
  },
  {
    id: "format",
    label: "Format",
    goal: "Format and polish this quick note. Correct phrasing and structure without adding information.",
  },
  {
    id: "categorize",
    label: "Categorize",
    goal: "Assign the best project, folder, category, type and links. Keep the content almost unchanged.",
  },
];
