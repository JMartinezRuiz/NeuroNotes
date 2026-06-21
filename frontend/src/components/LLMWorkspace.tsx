import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { api, agentColor } from "../lib/api";
import type { ModelHealth, Project } from "../types";
import { AIBadge } from "./AIBadge";

type MemoryPatch = {
  id: string;
  agent: string;
  agent_id: string;
  status: string;
  summary: string;
  proposed_notes: number;
  proposed_tasks: number;
  proposed_decisions: number;
  created_at: string;
};

type ActivityEvent = {
  id: string;
  agent: string;
  action: string;
  time: string;
};

type McpStatus = {
  running: boolean;
  transport: string;
  host: string;
  port: number;
  endpoint: string;
  auth: string;
  tools: number | null;
  start_command: string;
};

export function LLMWorkspace({ selectedProject, modelHealth }: { selectedProject: Project; modelHealth: ModelHealth }) {
  const [copied, setCopied] = useState("");
  const queryClient = useQueryClient();
  const patchesQuery = useQuery({
    queryKey: ["patches", "pending", selectedProject.id],
    queryFn: ({ signal }) =>
      api<MemoryPatch[]>(
        `/api/memory-patches?status=pending&project_id=${encodeURIComponent(selectedProject.id)}`,
        { signal },
      ),
  });
  const patches = patchesQuery.data ?? [];
  const activityQuery = useQuery({
    queryKey: ["activity", selectedProject.id],
    queryFn: ({ signal }) =>
      api<ActivityEvent[]>(`/api/activity?project_id=${encodeURIComponent(selectedProject.id)}`, { signal }),
  });
  const activity = activityQuery.data ?? [];
  const mcpQuery = useQuery({
    queryKey: ["mcp-status"],
    queryFn: ({ signal }) => api<McpStatus>("/api/mcp/status", { signal }),
    refetchInterval: 5000,
  });
  const mcp = mcpQuery.data;

  async function approvePatch(id: string) {
    await api("/api/memory/apply", { method: "POST", body: JSON.stringify({ patch_id: id, approved: true }) });
    await queryClient.invalidateQueries({ queryKey: ["patches"] });
    await queryClient.invalidateQueries({ queryKey: ["workspace"] });
  }

  async function rejectPatch(id: string) {
    await api(`/api/memory-patches/${id}/reject`, { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: ["patches"] });
  }

  const prompt = `Use Neuronotes 2.0 as the shared brain.
Project id: ${selectedProject.id}

Rules:
- Search before making project claims.
- Read notes with project, folder, category, source and status.
- Create or update notes when you produce durable knowledge.
- Link related notes.
- Create tasks from actionable work.
- Keep private data local unless the user exports it.`;
  const rows = [
    ["MCP (local)", "npm run mcp"],
    ["MCP (ChatGPT/SSE)", "npm run mcp:http"],
    ["Search", "GET /api/search?query=..."],
    ["All notes", "GET /api/notes"],
    ["Folder", "GET /api/notes?folder=..."],
    ["Category", "GET /api/notes?category=..."],
    ["Create note", "POST /api/notes"],
    ["Improve note", "POST /api/notes/{note_id}/improve"],
    ["Vector search", "GET /api/vectors/search?query=..."],
    ["Vector map", "GET /api/vectors/map"],
    ["Rebuild vectors", "POST /api/vectors/rebuild"],
    ["Context", "POST /api/context/compile"],
  ];

  async function copy(value: string) {
    await navigator.clipboard?.writeText(value);
    setCopied(value);
    window.setTimeout(() => setCopied(""), 1200);
  }

  return (
    <div className="llm-workspace">
      <section className="llm-header">
        <span>Agent-neutral access</span>
        <h1>One brain for any LLM</h1>
        <p>Codex, Claude, Qwen, ChatGPT or another client can read, write, link and classify shared memory.</p>
      </section>
      <section className="llm-panel">
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Servidor MCP · ChatGPT
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 999,
                background: mcp?.running ? "#1D9E75" : "var(--faint)",
                boxShadow: mcp?.running ? "0 0 0 3px rgba(29,158,117,0.18)" : "none",
              }}
            />
            {mcpQuery.isLoading ? "…" : mcp?.running ? "Activo" : "Apagado"}
          </span>
        </h2>
        {mcp?.running ? (
          <>
            <button className="copy-row" type="button" onClick={() => copy(mcp.endpoint)}>
              <span>Endpoint local</span>
              <code>{mcp.endpoint}</code>
              {copied === mcp.endpoint ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "10px 0 0" }}>
              Transporte SSE · Auth <strong>Ninguna</strong> · {mcp.tools ?? "?"} herramientas (incluye <code>search</code> y <code>fetch</code>).
            </p>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0" }}>
              Para ChatGPT: expón el puerto {mcp.port} con un túnel HTTPS (cloudflared/ngrok) y pega la URL acabada en <code>/sse</code>. En el campo
              de autenticación elige <strong>No authentication</strong>.
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px" }}>
              El servidor MCP remoto no está corriendo. Arráncalo para conectarlo a ChatGPT:
            </p>
            <button className="copy-row" type="button" onClick={() => copy(mcp?.start_command ?? "npm run mcp:http")}>
              <span>Arrancar</span>
              <code>{mcp?.start_command ?? "npm run mcp:http"}</code>
              {copied === (mcp?.start_command ?? "npm run mcp:http") ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </>
        )}
      </section>
      <section className="llm-panel">
        <h2>Memory review — {patches.length} pendiente{patches.length === 1 ? "" : "s"}</h2>
        {patchesQuery.isLoading ? (
          <p>Cargando…</p>
        ) : patches.length === 0 ? (
          <p>No hay parches de memoria pendientes de revisión.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {patches.map((patch) => (
              <div
                key={patch.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: agentColor(patch.agent_id) }} />
                  {patch.agent}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--faint)" }}>
                    {patch.proposed_notes} notas · {patch.proposed_tasks} tareas · {patch.proposed_decisions} decisiones
                  </span>
                </span>
                <p style={{ margin: 0, fontSize: 13 }}>{patch.summary || "(sin resumen)"}</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="primary-button small" type="button" onClick={() => approvePatch(patch.id)}>
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectPatch(patch.id)}
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
            ))}
          </div>
        )}
      </section>
      <div className="llm-grid">
        <section className="llm-panel">
          <h2>Connect</h2>
          {rows.map(([label, value]) => (
            <button className="copy-row" type="button" key={label} onClick={() => copy(value)}>
              <span>{label}</span>
              <code>{value}</code>
              {copied === value ? <Check size={16} /> : <Copy size={16} />}
            </button>
          ))}
        </section>
        <section className="llm-panel">
          <h2>Agent prompt</h2>
          <pre>{prompt}</pre>
        </section>
        <section className="llm-panel status-panel">
          <h2>Local model</h2>
          <AIBadge working={false} modelHealth={modelHealth} />
          <p>{modelHealth.message}</p>
        </section>
        <section className="llm-panel">
          <h2>Actividad reciente</h2>
          {activity.length === 0 ? (
            <p>Sin actividad todavía.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activity.slice(0, 12).map((event) => (
                <div key={event.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: agentColor(event.agent), flex: "none", alignSelf: "center" }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontWeight: 500 }}>{event.agent}</strong> {event.action}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--faint)", flex: "none" }}>{event.time}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
