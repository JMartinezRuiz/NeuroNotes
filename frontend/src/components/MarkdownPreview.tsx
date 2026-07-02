import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeMarkdownUrl } from "../lib/utils";

export function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="note-body markdown-preview">
      {content.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeMarkdownUrl}>
          {content}
        </ReactMarkdown>
      ) : (
        <p className="markdown-empty">Sin contenido todavía.</p>
      )}
    </div>
  );
}
