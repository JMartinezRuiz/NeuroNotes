declare global {
  interface Window {
    neuronotes?: {
      apiBase?: string;
      apiToken?: string;
      desktop?: boolean;
    };
  }
}

export function apiUrl(path: string) {
  const base = window.neuronotes?.apiBase ?? import.meta.env.VITE_API_BASE ?? "";
  return `${base}${path}`;
}

export function apiToken(): string {
  return window.neuronotes?.apiToken ?? import.meta.env.VITE_API_TOKEN ?? "";
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = apiToken();
  const response = await fetch(apiUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Neuronotes-Token": token } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

// Synapse agent-provenance colors. One normalizer maps an agent id OR display
// name to a key, so "who authored this" is a consistent visual language across
// note-card gutters, the editor, and the 3D map (which needs real hex, not vars).
const AGENT_HEX: Record<string, string> = {
  usuario: "#e8895e",
  claude: "#e0a33b",
  codex: "#8c99f0",
  qwen: "#b388e8",
  chatgpt: "#5dcaa5",
};

function normalizeAgentKey(value?: string | null): keyof typeof AGENT_HEX {
  const v = (value ?? "").toLowerCase();
  if (v.includes("claude")) return "claude";
  if (v.includes("codex")) return "codex";
  if (v.includes("qwen")) return "qwen";
  if (v.includes("chatgpt") || v.includes("gpt")) return "chatgpt";
  return "usuario";
}

export function agentColor(value?: string | null): string {
  return `var(--agent-${normalizeAgentKey(value)})`;
}

export function agentHex(value?: string | null): string {
  return AGENT_HEX[normalizeAgentKey(value)];
}
