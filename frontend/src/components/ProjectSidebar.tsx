import { useEffect, useState, type ReactNode } from "react";
import { Archive, Folder, FolderKanban, Inbox, Plus, Tags } from "lucide-react";
import { api } from "../lib/api";
import { defaultSidebarOrder } from "../lib/constants";
import { projectScope } from "../lib/helpers";
import type { CountItem, LibraryScope, Project, SidebarSectionId } from "../types";
import { SidebarSection } from "./SidebarSection";
import { ScopeButton } from "./ScopeButton";

export function ProjectSidebar({
  projects,
  scope,
  selectedProject,
  folders,
  categories,
  allNotesCount,
  looseNotesCount,
  onChooseScope,
  onProjectCreated,
}: {
  projects: Project[];
  scope: LibraryScope;
  selectedProject: Project;
  folders: CountItem[];
  categories: CountItem[];
  allNotesCount: number;
  looseNotesCount: number;
  onChooseScope: (scope: LibraryScope) => Promise<void>;
  onProjectCreated: (project: Project) => void | Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<SidebarSectionId, boolean>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("neuronotes-sidebar-collapsed") || "{}");
    } catch {
      return {};
    }
  });
  const [sectionOrder, setSectionOrder] = useState<SidebarSectionId[]>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("neuronotes-sidebar-order") || "[]");
      if (Array.isArray(saved) && defaultSidebarOrder.every((item) => saved.includes(item))) {
        return saved;
      }
    } catch {
      return defaultSidebarOrder;
    }
    return defaultSidebarOrder;
  });

  useEffect(() => {
    window.localStorage.setItem("neuronotes-sidebar-collapsed", JSON.stringify(collapsedSections));
  }, [collapsedSections]);

  useEffect(() => {
    window.localStorage.setItem("neuronotes-sidebar-order", JSON.stringify(sectionOrder));
  }, [sectionOrder]);

  async function createProject() {
    if (!name.trim()) return;
    const created = await api<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name,
        goal: "",
        status: "active",
        summary: "",
        tags: [],
      }),
    });
    setName("");
    setCreating(false);
    await onProjectCreated(created);
  }

  function toggleSection(section: SidebarSectionId) {
    setCollapsedSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function moveSection(section: SidebarSectionId, direction: -1 | 1) {
    setSectionOrder((current) => {
      const index = current.indexOf(section);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  const sections: Record<SidebarSectionId, { label: string; actions?: ReactNode; content: ReactNode }> = {
    library: {
      label: "Library",
      content: (
        <div className="library-list">
          <ScopeButton
            active={scope.type === "all"}
            icon={Archive}
            label="All notes"
            count={allNotesCount}
            onClick={() => onChooseScope({ type: "all", id: "all", label: "All notes" })}
          />
          <ScopeButton
            active={scope.type === "loose"}
            icon={Inbox}
            label="Loose notes"
            count={looseNotesCount}
            onClick={() => onChooseScope({ type: "loose", id: "loose", label: "Loose notes" })}
          />
        </div>
      ),
    },
    folders: {
      label: "Folders",
      content: (
        <div className="library-list">
          {folders.length ? (
            folders.map((folder) => (
              <ScopeButton
                active={scope.type === "folder" && scope.id === folder.id}
                icon={Folder}
                key={folder.id}
                label={folder.label}
                count={folder.count}
                onClick={() => onChooseScope({ type: "folder", id: folder.id, label: folder.label })}
              />
            ))
          ) : (
            <p className="empty-sidebar">No folders yet</p>
          )}
        </div>
      ),
    },
    categories: {
      label: "Categories",
      content: (
        <div className="library-list">
          {categories.map((category) => (
            <ScopeButton
              active={scope.type === "category" && scope.id === category.id}
              icon={Tags}
              key={category.id}
              label={category.label}
              count={category.count}
              onClick={() => onChooseScope({ type: "category", id: category.id, label: category.label })}
            />
          ))}
        </div>
      ),
    },
    projects: {
      label: "Projects",
      actions: (
        <button className="ghost-icon" type="button" title="New project" onClick={() => setCreating(true)}>
          <Plus size={15} />
        </button>
      ),
      content: (
        <>
          {creating ? (
            <div className="new-project-box">
              <input
                autoFocus
                placeholder="Project name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createProject();
                  if (event.key === "Escape") setCreating(false);
                }}
              />
              <button className="primary-button small" type="button" onClick={createProject}>
                Create
              </button>
            </div>
          ) : null}
          <div className="project-list">
            {projects.map((project) => (
              <ScopeButton
                active={scope.type === "project" && scope.id === project.id}
                icon={FolderKanban}
                key={project.id}
                label={project.name}
                onClick={() => onChooseScope(projectScope(project))}
              />
            ))}
          </div>
        </>
      ),
    },
  };

  return (
    <aside className="project-sidebar">
      <div className="brand">
        <div className="brand-mark">N2</div>
        <div>
          <strong>Neuronotes</strong>
          <span>single brain</span>
        </div>
      </div>

      {sectionOrder.map((sectionId) => {
        const section = sections[sectionId];
        return (
          <SidebarSection
            collapsed={Boolean(collapsedSections[sectionId])}
            key={sectionId}
            label={section.label}
            onMoveDown={() => moveSection(sectionId, 1)}
            onMoveUp={() => moveSection(sectionId, -1)}
            onToggle={() => toggleSection(sectionId)}
            actions={section.actions}
          >
            {section.content}
          </SidebarSection>
        );
      })}

      <section className="project-summary">
        <span>{selectedProject.status}</span>
        <p>{selectedProject.summary || selectedProject.goal || "No project summary yet."}</p>
      </section>
    </aside>
  );
}
