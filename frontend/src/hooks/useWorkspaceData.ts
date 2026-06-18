import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { notesPathForScope } from "../lib/helpers";
import type { Dashboard, LibraryScope, ModelHealth, Note, Relation, Task } from "../types";

export type WorkspaceData = {
  dashboard: Dashboard;
  notes: Note[];
  allNotes: Note[];
  tasks: Task[];
  relations: Relation[];
};

// One scoped query for the whole workspace. react-query dedupes concurrent
// invalidations and cancels stale requests via the AbortSignal, which removes
// the "last refresh() response wins" race the old manual fetcher had.
export function useWorkspaceData(scope: LibraryScope, contextProjectId: string) {
  const dashboardProjectId = scope.type === "project" ? scope.id : contextProjectId;
  return useQuery<WorkspaceData>({
    queryKey: ["workspace", scope.type, scope.id, dashboardProjectId],
    placeholderData: (previous) => previous,
    queryFn: async ({ signal }) => {
      const taskPath =
        scope.type === "project"
          ? `/api/tasks?project_id=${encodeURIComponent(scope.id)}`
          : "/api/tasks";
      const relationPath =
        scope.type === "project"
          ? `/api/relations?project_id=${encodeURIComponent(scope.id)}`
          : "/api/relations";
      const [dashboard, notes, allNotes, tasks, relations] = await Promise.all([
        api<Dashboard>(`/api/dashboard?project_id=${encodeURIComponent(dashboardProjectId)}`, { signal }),
        api<Note[]>(notesPathForScope(scope), { signal }),
        api<Note[]>("/api/notes", { signal }),
        api<Task[]>(taskPath, { signal }),
        api<Relation[]>(relationPath, { signal }),
      ]);
      return { dashboard, notes, allNotes, tasks, relations };
    },
  });
}

export function useModelHealth() {
  return useQuery<ModelHealth>({
    queryKey: ["modelHealth"],
    queryFn: ({ signal }) => api<ModelHealth>("/api/health/model", { signal }),
    refetchInterval: 30_000,
    retry: false,
  });
}
