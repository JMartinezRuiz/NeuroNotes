import { Bot, Loader2 } from "lucide-react";
import type { ModelHealth } from "../types";

export function AIBadge({ working, modelHealth }: { working: boolean; modelHealth: ModelHealth }) {
  return (
    <div className={working ? "ai-badge working" : modelHealth.online ? "ai-badge online" : "ai-badge"}>
      {working ? <Loader2 size={14} /> : <Bot size={14} />}
      <span>{working ? "Qwen working" : modelHealth.online ? "Qwen ready" : "Qwen offline"}</span>
    </div>
  );
}
