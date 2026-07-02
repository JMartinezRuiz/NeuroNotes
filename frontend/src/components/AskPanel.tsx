import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { agentHex, api } from "../lib/api";
import type { AskResult } from "../types";

export function AskPanel({
  question,
  onClose,
  onOpenNote,
}: {
  question: string;
  onClose: () => void;
  onOpenNote: (noteId: string) => void;
}) {
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError("");
    api<AskResult>("/api/ask", { method: "POST", body: JSON.stringify({ question }) })
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo consultar tu cerebro.");
      });
    return () => {
      cancelled = true;
    };
  }, [question]);

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const sources = result?.sources.filter((source) => (source.score ?? 0) >= 0.15) ?? [];

  return (
    <div className="overlay" role="dialog" aria-label="Preguntar a tu cerebro" onClick={onClose}>
      <div className="panel ask-panel" onClick={(event) => event.stopPropagation()}>
        <header>
          <Sparkles size={15} />
          <strong>{question}</strong>
          <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {error ? <p className="ask-error">{error}</p> : null}
        {!result && !error ? (
          <p className="ask-loading">
            <Loader2 size={14} className="spin" /> Leyendo tus notas…
          </p>
        ) : null}

        {result ? (
          <>
            {result.answer ? (
              <div className="ask-answer">{result.answer}</div>
            ) : (
              <p className="ask-offline">
                El modelo local está apagado, así que te dejo las notas más relevantes:
              </p>
            )}
            <div className="ask-sources">
              {sources.length === 0 ? (
                <small>No hay notas relacionadas con esto todavía.</small>
              ) : (
                sources.map((source, index) => (
                  <button key={source.id} type="button" onClick={() => onOpenNote(source.id)}>
                    <span className="src-index">[{index + 1}]</span>
                    <span className="agent-dot" style={{ backgroundColor: agentHex(source.created_by) }} />
                    <span className="src-title">{source.title}</span>
                    <small>{Math.round((source.score ?? 0) * 100)}%</small>
                  </button>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
