import { type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";

export function SidebarSection({
  label,
  collapsed,
  actions,
  children,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  label: string;
  collapsed: boolean;
  actions?: ReactNode;
  children: ReactNode;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <section className={collapsed ? "sidebar-section collapsed" : "sidebar-section"}>
      <div className="section-title">
        <button className="section-toggle" type="button" onClick={onToggle} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <span>{label}</span>
        </button>
        <div className="section-actions">
          <button className="tiny-icon" type="button" title="Move up" onClick={onMoveUp}>
            <ArrowUp size={13} />
          </button>
          <button className="tiny-icon" type="button" title="Move down" onClick={onMoveDown}>
            <ArrowDown size={13} />
          </button>
          {actions}
        </div>
      </div>
      {collapsed ? null : children}
    </section>
  );
}
