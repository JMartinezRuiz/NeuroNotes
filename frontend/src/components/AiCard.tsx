import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, X } from "lucide-react";
import { api } from "../lib/api";
import type { McpStatus, ModelHealth } from "../types";

export function AiCard({ health, onClose }: { health: ModelHealth; onClose: () => void }) {
  const [copied, setCopied] = useState("");
  const mcpQuery = useQuery({
    queryKey: ["mcp-status"],
    queryFn: ({ signal }) => api<McpStatus>("/api/mcp/status", { signal }),
    refetchInterval: 5000,
  });
  const mcp = mcpQuery.data;

  async function copy(value: string) {
    await navigator.clipboard?.writeText(value);
    setCopied(value);
    window.setTimeout(() => setCopied(""), 1200);
  }

  function CopyRow({ label, value }: { label: string; value: string }) {
    return (
      <button className="copy-row" type="button" onClick={() => copy(value)}>
        <span>{label}</span>
        <code>{value}</code>
        {copied === value ? <Check size={14} /> : <Copy size={14} />}
      </button>
    );
  }

  return (
    <div className="overlay" role="dialog" aria-label="IA local" onClick={onClose}>
      <div className="panel ai-card" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>IA local</strong>
          <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="ai-row">
          <span className={health.online ? "dot on" : "dot"} />
          <div>
            <strong>Chat · {health.model}</strong>
            <small>{health.message}</small>
          </div>
        </div>
        {!health.online ? (
          <div className="ai-fix">
            <CopyRow label="Arrancar" value="ollama serve" />
            <CopyRow label="Instalar modelo" value={`ollama pull ${health.model}`} />
          </div>
        ) : null}

        <div className="ai-row">
          <span className={health.embedding_online ? "dot on" : "dot"} />
          <div>
            <strong>Significado · {health.embedding_model || "hash local"}</strong>
            <small>Búsqueda, notas cercanas y mapa.</small>
          </div>
        </div>

        <p className="ai-privacy">
          Todo se ejecuta en tu equipo vía {health.provider} ({health.base_url}). Ningún texto sale de este dispositivo.
        </p>

        <div className="ai-divider" />

        <div className="ai-row">
          <span className={mcp?.running ? "dot on" : "dot"} />
          <div>
            <strong>Conectar otros LLMs (MCP)</strong>
            <small>
              {mcp?.running
                ? `Activo · ${mcp.tools ?? "?"} herramientas · auth: ninguna`
                : "Apagado — arráncalo para Claude/Codex/ChatGPT"}
            </small>
          </div>
        </div>
        {mcp?.running ? (
          <div className="ai-fix">
            <CopyRow label="Endpoint (SSE)" value={mcp.endpoint} />
            <small className="ai-hint">
              Para ChatGPT: túnel HTTPS al puerto {mcp.port} (cloudflared/ngrok), URL acabada en /sse, auth
              «No authentication».
            </small>
          </div>
        ) : (
          <div className="ai-fix">
            <CopyRow label="MCP local (Claude/Codex)" value="npm run mcp" />
            <CopyRow label="MCP para ChatGPT (SSE)" value="npm run mcp:http" />
          </div>
        )}
      </div>
    </div>
  );
}
