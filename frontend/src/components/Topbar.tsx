import { Moon, Search, Sun } from "lucide-react";
import { modes } from "../lib/constants";
import type { ModelHealth, SearchResult, ThemeMode, ViewMode } from "../types";
import { AIBadge } from "./AIBadge";

export function Topbar({
  mode,
  setMode,
  searchQuery,
  setSearchQuery,
  searchResults,
  openSearchResult,
  aiWorking,
  modelHealth,
  theme,
  toggleTheme,
}: {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  openSearchResult: (result: SearchResult) => void | Promise<void>;
  aiWorking: boolean;
  modelHealth: ModelHealth;
  theme: ThemeMode;
  toggleTheme: () => void;
}) {
  return (
    <header className="topbar">
      <nav className="mode-switch" aria-label="Main workspace modes">
        {modes.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={mode === item.id ? "active" : ""}
              type="button"
              key={item.id}
              onClick={() => setMode(item.id)}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="search-area">
        <label className="search-box">
          <Search size={16} />
          <input
            placeholder="Search notes, tasks, decisions..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        {searchResults.length ? (
          <div className="suggestions">
            <span>Suggestions</span>
            {searchResults.map((result) => (
              <button type="button" key={`${result.kind}-${result.id}`} onClick={() => openSearchResult(result)}>
                <strong>{result.title}</strong>
                <small>
                  {result.kind} - {result.category || result.status} - {result.project_name}
                </small>
                <p>{result.snippet}</p>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="topbar-actions">
        <AIBadge working={aiWorking} modelHealth={modelHealth} />
        <button className="icon-button" type="button" title="Toggle dark mode" onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
