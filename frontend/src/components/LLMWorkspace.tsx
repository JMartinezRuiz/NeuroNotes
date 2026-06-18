import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { ModelHealth, Project } from "../types";
import { AIBadge } from "./AIBadge";

export function LLMWorkspace({ selectedProject, modelHealth }: { selectedProject: Project; modelHealth: ModelHealth }) {
  const [copied, setCopied] = useState("");
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
    ["MCP", "npm run mcp"],
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
      </div>
    </div>
  );
}
