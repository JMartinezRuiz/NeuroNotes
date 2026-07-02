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

// Synapse agent-provenance palette — one canonical set shared with the CSS vars
// and the 3D map, so "who wrote this" reads the same everywhere.
export const AGENT_HEX: Record<string, string> = {
  usuario: "#e8895e",
  claude: "#e0a33b",
  codex: "#8c99f0",
  qwen: "#b388e8",
  chatgpt: "#5dcaa5",
};

export function agentKey(value?: string | null): keyof typeof AGENT_HEX {
  const v = (value ?? "").toLowerCase();
  if (v.includes("claude")) return "claude";
  if (v.includes("codex")) return "codex";
  if (v.includes("qwen")) return "qwen";
  if (v.includes("chatgpt") || v.includes("gpt")) return "chatgpt";
  return "usuario";
}

export function agentHex(value?: string | null): string {
  return AGENT_HEX[agentKey(value)];
}

export function agentLabel(value?: string | null): string {
  const key = agentKey(value);
  return key === "usuario" ? "Tú" : key.charAt(0).toUpperCase() + key.slice(1);
}
