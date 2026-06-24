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

// Neutral default that mirrors the backend's guaranteed starter project (id "inbox").
// Used as the pre-load scope and as the fallback when the API is unreachable —
// never demo content, so a fresh vault opens clean.
export const fallbackProject: Project = {
  id: "inbox",
  name: "Notas",
  goal: "",
  status: "active",
  summary: "",
  tags: [],
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
    id: "tidy",
    label: "Tidy",
    goal: "Tidy this note: fix grammar, spelling and punctuation, and turn messy capture into clean prose with concise headings or bullets. Do NOT add facts.",
  },
  {
    id: "categorize",
    label: "Categorize",
    goal: "Assign the best project, folder, category, type and links. Keep the content almost unchanged.",
  },
];
