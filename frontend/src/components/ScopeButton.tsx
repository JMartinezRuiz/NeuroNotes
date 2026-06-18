import { FileText } from "lucide-react";

export function ScopeButton({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: typeof FileText;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button className={active ? "project-row active" : "project-row"} type="button" onClick={onClick}>
      <Icon size={15} />
      <span>{label}</span>
      {typeof count === "number" ? <small>{count}</small> : null}
    </button>
  );
}
